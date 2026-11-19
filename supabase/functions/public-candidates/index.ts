// JantaHR Ops — public candidate-registration endpoint.
//
// Talent-pool self-registration for the JantaHR website, optionally tied to a
// vacancy slug. Mirrors public-leads' protections exactly: honeypot, body-size
// cap, per-IP rate limit, idempotency via web_submissions, and a service-role
// client (no RLS bypass risk — the role is trusted and the endpoint is
// write-only: it never returns stored data).
//
// A CV is a file, so registration is two steps:
//   1. action:'get_upload_url' — the endpoint returns a short-lived signed
//      upload URL into the PRIVATE `candidates` bucket plus the path to
//      reference on registration. The browser PUTs the file there directly.
//   2. POST the registration JSON with cvPath (the path from step 1).
// The file lands in a private bucket, never world-readable.
//
// CV PARSING IS NOT HERE: cv_parsed stays null (an AI feature, future slice).
//
// Deploy: supabase functions deploy public-candidates --no-verify-jwt

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildCandidateAlert,
  buildClientForwardEmail,
  parseApplicationNotes,
  type ScreeningQuestion,
} from '../_shared/candidate-alert.ts';
import { applicationConfirmation, isDeliverableEmail, talentPoolConfirmation } from '../_shared/confirmations.ts';
import { contactDifferences, differenceNote, type ExistingContact, gapFill } from '../_shared/contact-match.ts';
import { runAfterResponse, sendNotification } from '../_shared/mailer.ts';
import { opsLink } from '../_shared/ops-url.ts';
import { sendConfirmation, sendResendEmail, type ResendAttachment } from '../_shared/resend.ts';

// --- config ----------------------------------------------------------------
const MAX_BODY_BYTES = 10_240; // 10 KB — the CV is uploaded separately
const RATE_LIMIT_MAX = 8; // submissions per IP per window
const RATE_LIMIT_WINDOW_MIN = 1;
const UPLOAD_URL_TTL_SECONDS = 900; // 15 minutes
const CLIENT_DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days for forwarded client links
const MAX_EMAIL_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB per attached document
const MAX_TOTAL_ATTACHMENT_BYTES = 7 * 1024 * 1024; // 7 MB total across CV + Cover Letter
const SAFE_CV_PATH_RE = /^cvs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9._-]+$/i;
const SAFE_COVER_LETTER_PATH_RE =
  /^cvs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9._-]+_CoverLetter\.[a-z0-9]{2,5}$/i;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_CV_BYTES = 10 * 1024 * 1024; // 10 MB
const BUCKET = 'candidates';
// The website's general talent-pool form sends this slug; it is not a vacancy.
const TALENT_POOL_SLUG = 'general-talent-pool';
const DEFAULT_TRUSTED_ORIGINS = [
  'https://jantahr.com',
  'https://www.jantahr.com',
  'https://jantahr.netlify.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

const RAW_ALLOWED = Deno.env.get('PUBLIC_CANDIDATES_ALLOWED_ORIGIN') ?? '*';

function corsHeaders(origin: string | null): HeadersInit {
  let allow = '*';
  if (RAW_ALLOWED !== '*') {
    const list = RAW_ALLOWED.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const trusted = new Set([...DEFAULT_TRUSTED_ORIGINS.map((s) => s.toLowerCase()), ...list]);
    if (origin && trusted.has(origin.toLowerCase())) {
      allow = origin;
    } else {
      allow = list[0] || 'https://jantahr.com';
    }
  } else if (origin) {
    allow = origin;
  }

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}

// --- phone normalisation (ported from src/lib/phone.ts — Deno can't import it) --
function normalizeUgandanPhone(input: string): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  let candidate: string;
  if (hasPlus) candidate = `+${digits}`;
  else if (digits.startsWith('0') && digits.length === 10) candidate = `+256${digits.slice(1)}`;
  else if (digits.startsWith('256') && digits.length === 12) candidate = `+${digits}`;
  else if (digits.length === 9) candidate = `+256${digits}`;
  else return null;
  return /^\+256\d{9}$/.test(candidate) ? candidate : null;
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf': return 'pdf';
    case 'application/msword': return 'doc';
    default: return 'docx';
  }
}

function mimeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

type AvailabilityStatus = 'immediate' | 'one_month' | 'three_months' | 'not_looking';

function normalizeAvailability(raw: string | null | undefined): AvailabilityStatus | null {
  const val = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!val) return null;
  if (val === 'immediate' || val === 'immediately') return 'immediate';
  if (
    val === 'two_weeks' ||
    val === '2_weeks' ||
    val === '2_weeks_notice' ||
    val === 'two_weeks_notice' ||
    val === '14_days' ||
    val === 'one_month' ||
    val === '1_month' ||
    val === '1_month_notice' ||
    val === 'one_month_notice' ||
    val === '30_days'
  ) {
    return 'one_month';
  }
  if (
    val === '60_days' ||
    val === '2_months' ||
    val === 'two_months' ||
    val === '2_months_notice' ||
    val === '90_days' ||
    val === 'three_months' ||
    val === '3_months' ||
    val === '3_months_notice' ||
    val === 'three_months_notice'
  ) {
    return 'three_months';
  }
  if (
    val === 'not_looking' ||
    val === 'not_actively_looking' ||
    val === 'exploring_opportunities'
  ) {
    return 'not_looking';
  }
  return null;
}

function isSafeCvStoragePath(path: string | null | undefined): path is string {
  if (!path || path.includes('..')) return false;
  return SAFE_CV_PATH_RE.test(path.trim());
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function buildAttachmentFilename(
  candidateName: string,
  kind: 'CV' | 'Cover_Letter',
  storagePath: string,
): string {
  const safeName =
    candidateName
      .trim()
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'Candidate';
  const extMatch = /\.([a-z0-9]{2,5})$/i.exec(storagePath);
  const ext = extMatch ? extMatch[1]!.toLowerCase() : 'pdf';
  return `${safeName}_${kind}.${ext}`;
}

async function prepareForwardDocument(
  supabase: SupabaseClient,
  storagePath: string | null,
  attachmentFilename: string,
  remainingBudgetBytes: number,
): Promise<{ signedUrl: string | null; attachment: ResendAttachment | null; bytesUsed: number }> {
  if (!storagePath || !isSafeCvStoragePath(storagePath)) {
    return { signedUrl: null, attachment: null, bytesUsed: 0 };
  }
  try {
    const { data: signedData } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, CLIENT_DOWNLOAD_TTL_SECONDS, { download: attachmentFilename });
    const signedUrl = signedData?.signedUrl ?? null;

    let attachment: ResendAttachment | null = null;
    let bytesUsed = 0;
    const { data: fileBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(storagePath);
    if (!dlErr && fileBlob) {
      const buf = new Uint8Array(await fileBlob.arrayBuffer());
      if (
        buf.byteLength > 0 &&
        buf.byteLength <= MAX_EMAIL_ATTACHMENT_BYTES &&
        buf.byteLength <= remainingBudgetBytes
      ) {
        attachment = {
          filename: attachmentFilename,
          content: uint8ToBase64(buf),
        };
        bytesUsed = buf.byteLength;
      }
    }
    return { signedUrl, attachment, bytesUsed };
  } catch (err) {
    console.warn('prepareForwardDocument failed:', err);
    return { signedUrl: null, attachment: null, bytesUsed: 0 };
  }
}

interface RegistrationPayload {
  action?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  skills?: string | string[];
  yearsExperience?: number;
  salaryExpectation?: number;
  availability?: string;
  cvPath?: string;
  vacancySlug?: string;
  screeningAnswers?: Record<string, unknown>;
  notes?: string;
  honeypot?: string;
  submittedAt?: string;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405, origin);
  }

  // Body-size cap before parsing.
  const lenHeader = req.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'Payload too large.' }, 413, origin);
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'Payload too large.' }, 413, origin);
  }

  let payload: RegistrationPayload;
  try {
    payload = JSON.parse(raw) as RegistrationPayload;
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400, origin);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Step 1 — hand the browser a place to PUT the CV. No rate limit needed here
  // (it only creates an object in a private bucket); but the filename must be
  // sanitised and the mime allowlisted.
  if (payload.action === 'get_upload_url') {
    const filename = (payload.fullName ?? '').trim() || 'cv';
    const mime = (payload.email ?? '').trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return json({ ok: false, error: 'Unsupported file type. Use PDF or Word.' }, 400, origin);
    }
    const safeBase = filename.replace(/[^a-z0-9._-]/gi, '_').slice(0, 60);
    const path = `cvs/${crypto.randomUUID()}-${safeBase}.${extensionForMime(mime)}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data) {
      return json({ ok: false, error: 'Could not create an upload target.' }, 500, origin);
    }

    return json(
      {
        ok: true,
        path,
        uploadUrl: data.signedUrl,
        uploadExpiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        // The registration POST references `path`, so the CV file is never sent
        // through this function.
      },
      200,
      origin,
    );
  }

  if (payload.action === 'send_recovered_confirmation') {
    const authHeader = req.headers.get('authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!bearer) return json({ ok: false, error: 'Unauthorized.' }, 401, origin);
    if (bearer !== serviceRoleKey) {
      const probe = createClient(supabaseUrl, bearer, { auth: { persistSession: false } });
      const { error: adminErr } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (adminErr) return json({ ok: false, error: 'Unauthorized.' }, 401, origin);
    }
    const recipEmail = (payload.email ?? '').trim().toLowerCase();
    const recipName = (payload.fullName ?? '').trim() || 'Applicant';
    const vacTitle = (payload.headline ?? '').trim();
    const idempKey = (payload.submittedAt ?? '').trim() || `recovered-${recipEmail}`;
    const hasCv = Boolean(payload.cvPath);
    if (!isDeliverableEmail(recipEmail)) {
      return json({ ok: false, error: 'Not deliverable.' }, 400, origin);
    }
    const confirmation = vacTitle
      ? applicationConfirmation({ fullName: recipName, vacancyTitle: vacTitle, hasCv })
      : talentPoolConfirmation({ fullName: recipName, hasCv });
    const sent = await sendConfirmation(
      recipEmail,
      confirmation,
      vacTitle ? 'application_confirmation' : 'talent_pool_confirmation',
      `candidate-confirm-${idempKey}`,
    );
    return json({ ok: sent }, sent ? 200 : 502, origin);
  }

  // Step 2 — registration proper. Honeypot first, same as public-leads.
  if (payload.honeypot && payload.honeypot.trim() !== '') {
    return json({ ok: true }, 200, origin);
  }

  const fullName = (payload.fullName ?? '').trim();
  const email = (payload.email ?? '').trim().toLowerCase() || null;
  const phone = payload.phone ? normalizeUgandanPhone(payload.phone) : null;

  if (!fullName) return json({ ok: false, error: 'A name is required.' }, 400, origin);
  if (!email && !phone) {
    return json({ ok: false, error: 'An email or phone number is required.' }, 400, origin);
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    null;

  // Rate limit per IP.
  if (ip) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
    const { count } = await supabase
      .from('web_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return json({ ok: false, error: 'Too many submissions. Please try again shortly.' }, 429, origin);
    }
  }

  // Idempotency: claim the key first. A repeat submit collides and is a no-op.
  const submittedAt = (payload.submittedAt ?? '').trim() || new Date().toISOString();
  const idempotencyKey = `candidate|${email ?? phone}|${submittedAt}`;

  const claim = await supabase
    .from('web_submissions')
    .insert({ idempotency_key: idempotencyKey, lead_type: 'candidate', payload, ip })
    .select('id')
    .single();

  if (claim.error) {
    // 23505 = unique violation = already processed. Treat as success.
    if (claim.error.code === '23505') return json({ ok: true }, 200, origin);
    return json({ ok: false, error: 'Could not record submission.' }, 500, origin);
  }
  const submissionId = claim.data.id;

  try {
    // Contact: find-or-create by email, then phone; add the 'candidate' role.
    const CONTACT_FIELDS = 'id, full_name, phone_e164, organisation_id';
    let knownContact: ExistingContact | null = null;
    if (email) {
      const { data } = await supabase.from('contacts').select(CONTACT_FIELDS).ilike('email', email).maybeSingle();
      knownContact = data;
    }
    if (!knownContact && phone) {
      const { data } = await supabase.from('contacts').select(CONTACT_FIELDS).eq('phone_e164', phone).maybeSingle();
      knownContact = data;
    }
    let contactId: string | null = knownContact?.id ?? null;

    // A known person: fill gaps only, and record (never apply) any differences.
    let differences: string[] = [];
    if (knownContact) {
      const submitted = {
        fullName,
        phone,
        rawPhone: payload.phone ?? '',
        organisationId: null,
      };
      const fill = gapFill(knownContact, submitted);
      if (Object.keys(fill).length > 0) {
        await supabase.from('contacts').update(fill).eq('id', knownContact.id);
      }
      differences = contactDifferences(knownContact, submitted);
    }
    const mismatchNote = knownContact ? differenceNote(knownContact, differences) : null;
    if (!contactId) {
      const { data, error } = await supabase
        .from('contacts')
        .insert({ full_name: fullName, email, phone_e164: phone, source: 'Website (candidate)' })
        .select('id')
        .single();
      if (error) throw error;
      contactId = data.id;
    }
    await supabase.from('contact_roles').upsert({ contact_id: contactId, role: 'candidate' });

    // Candidate profile: find-or-create (unique on contact_id). On an existing
    // candidate, UPDATE the profile fields and replace cv_file_id — never
    // duplicate the person or the profile.
    const skillsArray = Array.isArray(payload.skills)
      ? payload.skills
      : (payload.skills ?? '').split(',').map((s) => s.trim()).filter(Boolean);

    const existing = await supabase
      .from('candidates')
      .select('id, cv_file_id')
      .eq('contact_id', contactId)
      .maybeSingle();

    const profileFields = {
      headline: (payload.headline ?? '').trim() || null,
      skills: skillsArray,
      years_experience: Number.isFinite(payload.yearsExperience) ? payload.yearsExperience : null,
      salary_expectation_ugx: Number.isFinite(payload.salaryExpectation) ? payload.salaryExpectation : null,
      availability: normalizeAvailability(payload.availability),
      source: 'Website (candidate)',
      owner_id: null,
    };

    let candidateId: string;
    let oldCvFileId: string | null = null;

    if (existing?.data) {
      oldCvFileId = existing.data.cv_file_id;
      candidateId = existing.data.id;
      // A re-registration is a PARTIAL update: the form may omit fields the
      // candidate gave us last time. Only write keys the payload actually
      // supplied — otherwise a shorter second submission silently wipes good
      // data (availability, salary expectation, skills) we already held.
      const patch = Object.fromEntries(
        Object.entries(profileFields).filter(([key, value]) => {
          if (key === 'source' || key === 'owner_id') return false; // never overwrite on update
          if (value === null) return false;
          if (Array.isArray(value) && value.length === 0) return false;
          return true;
        }),
      );
      if (Object.keys(patch).length > 0) {
        await supabase.from('candidates').update(patch).eq('id', candidateId);
      }
    } else {
      const { data, error } = await supabase
        .from('candidates')
        .insert({ contact_id: contactId, ...profileFields })
        .select('id')
        .single();
      if (error) throw error;
      candidateId = data.id;
    }

    // Record the CV file (if one was uploaded) and point candidates.cv_file_id at it.
    let freshlyUploadedCvPath: string | null = null;
    if (payload.cvPath && isSafeCvStoragePath(payload.cvPath)) {
      const cleanCvPath = payload.cvPath.trim();
      const { data: fileMeta, error: fileError } = await supabase
        .from('candidate_files')
        .select('id, path')
        .eq('path', cleanCvPath)
        .maybeSingle();

      if (fileError) throw fileError;

      if (fileMeta) {
        await supabase.from('candidates').update({ cv_file_id: fileMeta.id }).eq('id', candidateId);
      } else {
        freshlyUploadedCvPath = cleanCvPath;
        // The upload URL was issued but the file never uploaded (or the metadata
        // row is missing). Store the reference anyway as a best-effort so the
        // registration still completes.
        const { data: createdFile, error: createFileErr } = await supabase
          .from('candidate_files')
          .insert({
            bucket: BUCKET,
            path: cleanCvPath,
            filename: cleanCvPath.split('/').pop() ?? cleanCvPath,
            mime: mimeForPath(cleanCvPath),
            size_bytes: 0,
          })
          .select('id')
          .single();
        if (!createFileErr && createdFile) {
          await supabase.from('candidates').update({ cv_file_id: createdFile.id }).eq('id', candidateId);
        }
      }
    }

    // If the CV was replaced, clean up the old file (best-effort).
    if (oldCvFileId && freshlyUploadedCvPath) {
      const { data: oldFile } = await supabase
        .from('candidate_files')
        .select('path')
        .eq('id', oldCvFileId)
        .maybeSingle();
      if (oldFile && oldFile.path !== freshlyUploadedCvPath) {
        await supabase.storage.from(BUCKET).remove([oldFile.path]);
        await supabase.from('candidate_files').delete().eq('id', oldCvFileId);
      }
    }

    // Application: only if the vacancy slug matches an open, public vacancy.
    const vacancySlug = (payload.vacancySlug ?? '').trim();
    const isTalentPool = !vacancySlug || vacancySlug === TALENT_POOL_SLUG;
    let applicationId: string | null = null;
    let vacancy: {
      id: string;
      title: string;
      screening_questions: unknown;
      forwarding_emails?: unknown;
    } | null = null;
    if (!isTalentPool) {
      const { data } = await supabase
        .from('vacancies')
        .select('id, title, screening_questions, forwarding_emails')
        .eq('slug', vacancySlug)
        .eq('is_public', true)
        .eq('status', 'open')
        .maybeSingle();
      vacancy = data;

      if (vacancy) {
        const { data: application, error: appError } = await supabase
          .from('applications')
          .insert({
            vacancy_id: vacancy.id,
            candidate_id: candidateId,
            source: 'website',
            screening_answers: payload.screeningAnswers ?? {},
            notes: payload.notes ?? null,
          })
          .select('id')
          .single();
        // Duplicate application (same person, same vacancy) is fine — the unique
        // constraint turns it into a no-op, not an error.
        if (!appError && application) applicationId = application.id;
      }
    }

    // A talent-pool registration (no vacancy) puts the person back in the
    // "New from the website" queue, even if they registered before: they may
    // have sent a new CV. A new application is queued as the application.
    if (!vacancy) {
      await supabase
        .from('candidates')
        .update({ reviewed_at: null, reviewed_by: null })
        .eq('id', candidateId);
    }

    // Timeline entry on the candidate. Notes only live on an application, so
    // without one (talent-pool form, closed vacancy) they go on the timeline —
    // otherwise the cover note, discipline, country and LinkedIn are lost.
    const notes = (payload.notes ?? '').trim();
    let activityBody = applicationId
      ? `Registered on the website for ${vacancy?.title ?? vacancySlug}. Application created.`
      : 'Registered on the website. Added to the talent pool.';
    if (!applicationId && notes) activityBody += `\n\n${notes}`;
    if (mismatchNote) activityBody += `\n\n${mismatchNote}`;
    await supabase.from('activities').insert({
      subject_type: 'candidate',
      subject_id: candidateId,
      type: 'system',
      body: activityBody,
      meta: { source: 'public-candidates', hasCv: Boolean(payload.cvPath) },
    });

    // Link the submission to what it produced (audit trail).
    await supabase.from('web_submissions').update({ contact_id: contactId }).eq('id', submissionId);

    // After the response is sent: alert the team (Apps Script mailer) and
    // confirm receipt to the candidate (Resend). Neither can fail the submission.
    const background: Promise<unknown>[] = [];

    const questions = Array.isArray(vacancy?.screening_questions)
      ? (vacancy.screening_questions as ScreeningQuestion[])
      : [];

    // Team alert. Skip a repeat application to the same vacancy (the unique
    // constraint made it a no-op, so there is nothing new to review).
    const repeatApplication = Boolean(vacancy) && !applicationId;
    if (!repeatApplication) {
      const alert = buildCandidateAlert({
        fullName,
        email,
        phone,
        headline: profileFields.headline,
        yearsExperience: profileFields.years_experience,
        salaryExpectationUgx: profileFields.salary_expectation_ugx,
        availability: profileFields.availability,
        skills: skillsArray,
        hasCv: Boolean(payload.cvPath),
        outcome: applicationId ? 'application' : isTalentPool ? 'talent_pool' : 'vacancy_unavailable',
        vacancyTitle: vacancy?.title ?? null,
        vacancySlug: isTalentPool ? null : vacancySlug,
        screeningQuestions: questions,
        screeningAnswers: payload.screeningAnswers ?? null,
        notes,
        submittedAt,
        existingContact:
          knownContact && differences.length > 0 ? { name: knownContact.full_name, differences } : null,
        opsLink: applicationId
          ? opsLink(`/recruitment/${vacancy!.id}?application=${applicationId}`)
          : opsLink(`/talent?candidate=${candidateId}`),
      });
      background.push(sendNotification({ ...alert, replyTo: email }, 'candidate alert'));
    }

    // Resend tasks (candidate confirmation + optional external client forwarding)
    // run sequentially so they never trip Resend's 2 req/sec burst rate limit.
    const forwardRecipients =
      !repeatApplication && applicationId && Array.isArray(vacancy?.forwarding_emails)
        ? vacancy.forwarding_emails
            .map((addr) => (typeof addr === 'string' ? addr.trim().toLowerCase() : ''))
            .filter((addr): addr is string => isDeliverableEmail(addr))
            .slice(0, 5)
        : [];

    if (isDeliverableEmail(email) || forwardRecipients.length > 0) {
      background.push(
        (async () => {
          let sentConfirm = false;
          if (isDeliverableEmail(email)) {
            const hasCv = Boolean(payload.cvPath);
            const confirmation = vacancy
              ? applicationConfirmation({ fullName, vacancyTitle: vacancy.title, hasCv })
              : talentPoolConfirmation({ fullName, hasCv });
            sentConfirm = await sendConfirmation(
              email,
              confirmation,
              vacancy ? 'application_confirmation' : 'talent_pool_confirmation',
              `candidate-confirm-${submissionId}`,
            );
          }

          if (forwardRecipients.length > 0 && vacancy && applicationId) {
            if (sentConfirm) {
              await new Promise((r) => setTimeout(r, 600));
            }
            const parsedNotes = parseApplicationNotes(notes);
            let remainingBudget = MAX_TOTAL_ATTACHMENT_BYTES;
            const attachments: ResendAttachment[] = [];

            const cvPrep = await prepareForwardDocument(
              supabase,
              freshlyUploadedCvPath,
              buildAttachmentFilename(fullName, 'CV', freshlyUploadedCvPath ?? 'cv.pdf'),
              remainingBudget,
            );
            if (cvPrep.attachment) {
              attachments.push(cvPrep.attachment);
              remainingBudget -= cvPrep.bytesUsed;
            }

            let coverPath: string | null = null;
            if (
              parsedNotes.coverLetterPath &&
              SAFE_COVER_LETTER_PATH_RE.test(parsedNotes.coverLetterPath)
            ) {
              const { data: existingCoverFile } = await supabase
                .from('candidate_files')
                .select('id')
                .eq('path', parsedNotes.coverLetterPath)
                .maybeSingle();
              if (!existingCoverFile) coverPath = parsedNotes.coverLetterPath;
            }

            const coverPrep = await prepareForwardDocument(
              supabase,
              coverPath,
              buildAttachmentFilename(fullName, 'Cover_Letter', coverPath ?? 'cover.pdf'),
              remainingBudget,
            );
            if (coverPrep.attachment) {
              attachments.push(coverPrep.attachment);
            }

            const clientEmail = buildClientForwardEmail({
              fullName,
              email,
              phone,
              headline: profileFields.headline,
              yearsExperience: profileFields.years_experience,
              salaryExpectationUgx: profileFields.salary_expectation_ugx,
              availability: profileFields.availability,
              skills: skillsArray,
              hasCv: Boolean(payload.cvPath),
              cvAttached: Boolean(cvPrep.attachment),
              cvDownloadUrl: cvPrep.signedUrl,
              coverLetterAttached: Boolean(coverPrep.attachment),
              coverLetterDownloadUrl: coverPrep.signedUrl,
              vacancyTitle: vacancy.title,
              screeningQuestions: questions,
              screeningAnswers: payload.screeningAnswers ?? null,
              notes,
              submittedAt,
            });

            await sendResendEmail(
              forwardRecipients,
              clientEmail,
              'client_application_forward',
              `client-forward-${submissionId}`,
              { attachments },
            );
          }
        })(),
      );
    }

    // Background AI CV parsing & role-match evaluation (never blocks or fails intake).
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey && (applicationId || payload.cvPath)) {
      const evalBody = applicationId
        ? { action: 'evaluate_application', applicationId, forceReparseCv: Boolean(payload.cvPath) }
        : { action: 'parse_candidate_cv', candidateId, forceReparseCv: true };
      background.push(
        fetch(`${supabaseUrl}/functions/v1/evaluate-candidate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(evalBody),
        }).catch((err) => console.warn('evaluate-candidate background trigger failed:', err)),
      );
    }

    await runAfterResponse(Promise.all(background));

    return json({ ok: true }, 200, origin);
  } catch (_e) {
    // The submission row remains as evidence; the candidate did not complete.
    console.error('public-candidates error:', _e);
    return json({ ok: false, error: 'Could not process the submission.' }, 500, origin);
  }
});

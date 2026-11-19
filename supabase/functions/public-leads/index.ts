// JantaHR Ops — public lead capture endpoint.
//
// Receives the JantaHR website's EXISTING AI-training form payload (which we do
// not control) and turns it into a contact + lead, with the same find-or-create
// dedup the in-app create flow uses. Write-only: it never returns stored data.
//
// Runs with the SERVICE ROLE key (auto-injected by Supabase as
// SUPABASE_SERVICE_ROLE_KEY), so it bypasses RLS. Because it is public, every
// other layer of protection matters: honeypot, body-size cap, per-IP rate
// limit, and idempotency.
//
// Deploy: supabase functions deploy public-leads --no-verify-jwt
// (--no-verify-jwt because the website is anonymous; the function is the guard.)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { enquiryConfirmation, isDeliverableEmail, trainingConfirmation } from '../_shared/confirmations.ts';
import { contactDifferences, differenceNote, type ExistingContact, gapFill } from '../_shared/contact-match.ts';
import {
  dismissUnlinkedSubmissions,
  reportSubmissionFailureOnce,
  requireStaffOrServiceAuth,
} from '../_shared/failure-notify.ts';
import { buildLeadAlert } from '../_shared/lead-alert.ts';
import { runAfterResponse, sendLeadAlert } from '../_shared/mailer.ts';
import { opsLink } from '../_shared/ops-url.ts';
import { sendConfirmation } from '../_shared/resend.ts';

// --- config ----------------------------------------------------------------
const MAX_BODY_BYTES = 10_240; // 10 KB
const RATE_LIMIT_MAX = 8; // submissions per IP per window
const RATE_LIMIT_WINDOW_MIN = 1;
const DEFAULT_TRUSTED_ORIGINS = [
  'https://jantahr.com',
  'https://www.jantahr.com',
  'https://jantahr.netlify.app',
  'https://ops.jantahr.com',
  'https://jantahr-ops.pages.dev',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5180',
];
// Set PUBLIC_LEADS_ALLOWED_ORIGIN to the production website origin to lock this
// down. Defaults to '*': safe here because the endpoint is write-only and
// carries no credentials, and CORS never gates non-browser callers anyway.
const ALLOWED_ORIGIN = Deno.env.get('PUBLIC_LEADS_ALLOWED_ORIGIN') ?? '*';

function corsHeaders(origin: string | null): HeadersInit {
  let allow = '*';
  if (ALLOWED_ORIGIN !== '*') {
    const list = ALLOWED_ORIGIN.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
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
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
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

// --- the website's payload -------------------------------------------------
interface WebsitePayload {
  action?: string;
  submissionId?: string;
  submissionIds?: string[];
  leadType?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  organization?: string;
  trainingUnit?: string;
  /** Contact form: what the enquiry is about. */
  interest?: string;
  message?: string;
  honeypot?: string;
  sourcePage?: string;
  metadata?: unknown;
  submittedAt?: string;
}

async function processLeadPayload(
  supabase: SupabaseClient,
  payload: WebsitePayload,
  submissionId: string,
  submittedAt: string,
  options: { createdAt?: string; isRecovery?: boolean } = {},
): Promise<{ contactId: string; leadId: string; background: Promise<unknown>[] }> {
  const fullName = (payload.fullName ?? '').trim();
  const email = (payload.email ?? '').trim().toLowerCase() || null;
  const phone = payload.phone ? normalizeUgandanPhone(payload.phone) : null;
  const leadType = (payload.leadType ?? 'website').trim() || 'website';
  const interest = (payload.trainingUnit ?? payload.interest ?? '').trim();

  // Organisation: find-or-create by name.
  let organisationId: string | null = null;
  const orgName = (payload.organization ?? '').trim();
  if (orgName) {
    const { data: existing } = await supabase
      .from('organisations')
      .select('id')
      .ilike('name', orgName)
      .maybeSingle();
    organisationId =
      existing?.id ??
      (await supabase.from('organisations').insert({ name: orgName }).select('id').single()).data
        ?.id ??
      null;
  }

  // Contact: find-or-create by email, then phone.
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

  let differences: string[] = [];
  if (knownContact) {
    const submitted = {
      fullName,
      phone,
      rawPhone: payload.phone ?? '',
      organisationId: organisationId,
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
      .insert({
        full_name: fullName,
        email,
        phone_e164: phone,
        organisation_id: organisationId,
        source: `Website (${leadType})`,
      })
      .select('id')
      .single();
    if (error) throw error;
    contactId = String(data.id);
  }
  if (!contactId) throw new Error('Could not resolve contact ID.');

  const { error: roleErr } = await supabase.from('contact_roles').upsert({ contact_id: contactId, role: 'lead' });
  if (roleErr) throw roleErr;

  // Lead. service_interest carries the training unit; message becomes a note.
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      contact_id: contactId,
      organisation_id: organisationId,
      service_interest: interest || null,
      source: `Website (${leadType}) ${(payload.sourcePage ?? '').trim()}`.trim(),
      stage: 'new',
      ...(options.createdAt ? { created_at: options.createdAt } : {}),
    })
    .select('id')
    .single();
  if (leadError) throw leadError;

  const noteParts = [
    payload.message?.trim(),
    payload.sourcePage ? `Page: ${payload.sourcePage}` : '',
    mismatchNote ?? '',
  ]
    .filter(Boolean)
    .join('\n');
  await supabase.from('activities').insert({
    subject_type: 'lead',
    subject_id: lead.id,
    type: 'system',
    body: noteParts || (options.isRecovery ? 'Recovered from Today intake log.' : 'Captured from the website.'),
    meta: { source: options.isRecovery ? 'public-leads-recovery' : 'public-leads', payload },
  });

  await supabase
    .from('web_submissions')
    .update({ contact_id: contactId, lead_id: lead.id })
    .eq('id', submissionId);

  const leadFields = {
    leadType,
    fullName: payload.fullName ?? '',
    email: payload.email ?? '',
    phone: payload.phone ?? '',
    organization: payload.organization ?? '',
    trainingUnit: interest,
    message: payload.message ?? '',
    sourcePage: payload.sourcePage ?? '',
    submittedAt,
  };
  const teamEmail = buildLeadAlert({
    ...leadFields,
    interest,
    existingContact:
      knownContact && differences.length > 0 ? { name: knownContact.full_name, differences } : null,
    opsLink: opsLink(`/leads?lead=${lead.id}`),
  });
  const confirmation =
    leadType === 'ai_training'
      ? trainingConfirmation({ fullName, trainingUnit: interest })
      : enquiryConfirmation({ fullName, interest });
  const category = `${leadType.replace(/[^A-Za-z0-9_-]/g, '_')}_confirmation`;
  const background: Promise<unknown>[] = [
    ...(options.isRecovery ? [] : [sendLeadAlert(leadFields, teamEmail)]),
    ...(isDeliverableEmail(email)
      ? [sendConfirmation(email, confirmation, category, `lead-confirm-${submissionId}`)]
      : []),
  ];

  return { contactId, leadId: lead.id, background };
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

  let payload: WebsitePayload;
  try {
    payload = JSON.parse(raw) as WebsitePayload;
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  if (payload.action === 'recover_submission') {
    const auth = await requireStaffOrServiceAuth(req, supabaseUrl, serviceRoleKey, supabase);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, origin);

    const targetId = (payload.submissionId ?? '').trim();
    if (!targetId) return json({ ok: false, error: 'submissionId is required.' }, 400, origin);

    const { data: subRow, error: subErr } = await supabase
      .from('web_submissions')
      .select('id, created_at, lead_type, payload, contact_id')
      .eq('id', targetId)
      .neq('lead_type', 'candidate')
      .is('contact_id', null)
      .maybeSingle();

    if (subErr || !subRow) {
      return json({ ok: false, error: 'Unlinked lead submission not found.' }, 404, origin);
    }

    const stored = (subRow.payload ?? {}) as WebsitePayload;
    const submittedAt = (stored.submittedAt ?? '').trim() || subRow.created_at;
    try {
      const result = await processLeadPayload(supabase, stored, subRow.id, submittedAt, {
        createdAt: subRow.created_at,
        isRecovery: true,
      });

      const targetEmail = (stored.email ?? '').trim().toLowerCase();
      const targetNormPhone = stored.phone ? normalizeUgandanPhone(stored.phone) : null;
      const targetRawPhone = (stored.phone ?? '').trim();
      const { data: otherUnlinked } = await supabase
        .from('web_submissions')
        .select('id, payload')
        .eq('lead_type', subRow.lead_type)
        .is('contact_id', null);

      const retryIds = (otherUnlinked ?? [])
        .filter((row) => {
          const p = (row.payload ?? {}) as Record<string, unknown>;
          const rowEmail = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
          const rowPhone = typeof p.phone === 'string' ? p.phone.trim() : '';
          const rowNorm = rowPhone ? normalizeUgandanPhone(rowPhone) : null;
          if (targetEmail && rowEmail && targetEmail === rowEmail) return true;
          if (targetNormPhone && rowNorm && targetNormPhone === rowNorm) return true;
          if (targetRawPhone && rowPhone && targetRawPhone === rowPhone) return true;
          return false;
        })
        .map((row) => row.id);

      if (retryIds.length > 0) {
        await supabase
          .from('web_submissions')
          .update({ contact_id: result.contactId, lead_id: result.leadId })
          .in('id', retryIds);
      }

      await runAfterResponse(Promise.all(result.background));
      return json({ ok: true, contactId: result.contactId, leadId: result.leadId }, 200, origin);
    } catch (err) {
      console.error('public-leads recover_submission failed:', err);
      return json({ ok: false, error: 'Could not recover this submission.' }, 500, origin);
    }
  }

  if (payload.action === 'dismiss_failed_submission') {
    const auth = await requireStaffOrServiceAuth(req, supabaseUrl, serviceRoleKey, supabase);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, origin);

    const ids = Array.isArray(payload.submissionIds)
      ? payload.submissionIds.map(String)
      : payload.submissionId
        ? [String(payload.submissionId)]
        : [];
    const deleted = await dismissUnlinkedSubmissions(supabase, ids);
    return json({ ok: true, deleted }, 200, origin);
  }

  // Honeypot: a filled hidden field means a bot. Accept silently so it learns
  // nothing, and create nothing.
  if (payload.honeypot && payload.honeypot.trim() !== '') {
    return json({ ok: true }, 200, origin);
  }

  const fullName = (payload.fullName ?? '').trim();
  const email = (payload.email ?? '').trim().toLowerCase() || null;
  const phone = payload.phone ? normalizeUgandanPhone(payload.phone) : null;
  const leadType = (payload.leadType ?? 'website').trim() || 'website';
  const interest = (payload.trainingUnit ?? payload.interest ?? '').trim();

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
  const idempotencyKey = `${leadType}|${email ?? phone}|${submittedAt}`;

  const claim = await supabase
    .from('web_submissions')
    .insert({ idempotency_key: idempotencyKey, lead_type: leadType, payload, ip })
    .select('id')
    .single();

  if (claim.error) {
    // 23505 = unique violation = already processed. Treat as success.
    if (claim.error.code === '23505') return json({ ok: true }, 200, origin);
    return json({ ok: false, error: 'Could not record submission.' }, 500, origin);
  }
  const submissionId = claim.data.id;

  try {
    const result = await processLeadPayload(supabase, payload, submissionId, submittedAt);
    await runAfterResponse(Promise.all(result.background));
    return json({ ok: true }, 200, origin);
  } catch (err) {
    // The submission row remains as evidence something arrived; notify team once per 15 min.
    console.error('public-leads error:', err);
    const labelBase = leadType === 'ai_training' ? 'AI training' : 'Website enquiry';
    const targetLabel = interest ? `${labelBase} · ${interest}` : labelBase;
    await reportSubmissionFailureOnce(supabase, {
      endpoint: 'public-leads',
      submissionId,
      fullName,
      email,
      rawPhone: payload.phone ?? null,
      normalizedPhone: phone,
      targetLabel,
      err,
      submittedAt,
    });
    return json({ ok: false, error: 'Could not process the submission.' }, 500, origin);
  }
});

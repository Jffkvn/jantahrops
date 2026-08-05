#!/usr/bin/env node
/**
 * Bulk CV importer — one-off migration of the email-attachment dump into the
 * JantaHR Ops talent pool.
 *
 *   node tools/cv-import.mjs --limit 100          # real import, first 100
 *   node tools/cv-import.mjs --limit 100 --dry    # analyse only, write nothing
 *   node tools/cv-import.mjs --all                # the full corpus
 *
 * Requires .env.rls.local (service-role key) — run with:
 *   node --env-file=.env.rls.local tools/cv-import.mjs ...
 *
 * Design decisions, and why:
 *  - Only files classified `cv` mint a candidate. Cover letters, certificates
 *    and transcripts ATTACH to the person they belong to (matched on their own
 *    contact key) so nothing is lost and no phantom candidates appear.
 *  - Dedup keys are email then phone ONLY. Name extraction is ~2/3 accurate, so
 *    it is never trusted to identify a person — it only fills a field.
 *  - Idempotent on the SHA-256 of the file BYTES (cv_import_files), because the
 *    same CV appears under different names and the corpus has literal dupes.
 *  - Scanned files (certificates/transcripts) are uploaded as-is, never parsed.
 *    The dry run showed zero CVs are scanned, so no OCR is needed.
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, basename, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const CV_DIR = '/Users/dora.agai/Downloads/extracted_cvs';
const BATCH = 'cv-import-2026-08';
const BUCKET = 'candidates';
const TEXT_EXTS = new Set(['.docx', '.doc', '.rtf', '.odt']);
const PDF_EXTS = new Set(['.pdf']);
const SKIP_EXTS = new Set(['.csv', '.ds_store', '.pages']);

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const ALL = argv.includes('--all');
const LIMIT = (() => {
  const i = argv.indexOf('--limit');
  return i >= 0 ? Number(argv[i + 1]) : ALL ? Infinity : 100;
})();

// --- supabase ---------------------------------------------------------------
const url = process.env.RLS_SUPABASE_URL;
const key = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing RLS_SUPABASE_URL / RLS_SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run: node --env-file=.env.rls.local tools/cv-import.mjs …');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// --- extraction -------------------------------------------------------------
function extractPdf(path) {
  try {
    // pdf-parse-ish via pypdf through python is slow; use pdfjs-free approach:
    // shell out to python + pypdf, which we verified works on this corpus.
    const out = execFileSync(
      'python3',
      ['-c', `import pypdf,sys
r=pypdf.PdfReader(sys.argv[1])
print(''.join((p.extract_text() or '') for p in r.pages[:4]))`, path],
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out;
  } catch {
    return '';
  }
}

function extractTextutil(path) {
  try {
    return execFileSync('textutil', ['-convert', 'txt', '-stdout', path], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function extractText(path) {
  const ext = extname(path).toLowerCase();
  if (PDF_EXTS.has(ext)) return extractPdf(path);
  if (TEXT_EXTS.has(ext)) return extractTextutil(path);
  return '';
}

// --- field extraction (free: regex) ----------------------------------------
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_NOISE =
  /(noreply|no-reply|donotreply|notifications?@|bni\.com|zoom\.us|mailer|support@|admin@|@example\.|jantahr)/i;
const PHONE_RE = /(?:\+?256[\s-]?|0)(7\d{2}|4\d{2})[\s-]?\d{3}[\s-]?\d{3}/g;

function findEmail(text) {
  for (const m of text.match(EMAIL_RE) ?? []) {
    if (!EMAIL_NOISE.test(m)) return m.toLowerCase();
  }
  return null;
}

function normalisePhone(raw) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('256')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.length === 9 && '74'.includes(d[0]) ? '+256' + d : null;
}

function findPhone(text) {
  for (const m of text.match(PHONE_RE) ?? []) {
    const n = normalisePhone(m);
    if (n) return n;
  }
  return null;
}

/**
 * Name heuristic — TIGHTENED after the dry run, which produced false positives
 * like "Sent To" and "Academics Qualifications With Dates". Every token must
 * look like a name, and no token may be a document word.
 */
const NAME_BAD_TOKEN =
  /^(curriculum|vitae|resume|cv|application|cover|letter|personal|profile|contact|address|phone|email|tel|mobile|name|sent|to|from|subject|date|dates|academics?|academic|qualifications?|education|experience|skills|references?|referees?|republic|university|college|school|certificate|transcript|results?|the|and|of|for|my|with|attachment|mail|document|final|updated|new|copy)$/i;

function guessName(text) {
  const lines = text.split('\n').slice(0, 12);
  for (const raw of lines) {
    const s = raw.replace(/\s+/g, ' ').trim().replace(/^[.:\-|]+|[.:\-|]+$/g, '');
    if (s.length < 5 || s.length > 45) continue;
    if (/\d/.test(s) || s.includes('@')) continue;
    const words = s.split(' ');
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-z'’.-]{2,}$/.test(w))) continue;
    if (words.some((w) => NAME_BAD_TOKEN.test(w))) continue;
    return words
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return null;
}

// --- classification ---------------------------------------------------------
const CV_SECTIONS =
  /(work experience|professional experience|employment history|education|qualification|skills|referee|references|career objective|profile summary|work history|academic)/gi;
const COVER =
  /(dear (sir|madam|hiring|hr)|to whom it may concern|re:\s*application|i (am writing|wish to apply|hereby (write|apply))|application for (the )?(post|position|job))/i;
const TRANSCRIPT =
  /(academic transcript|transcript of records|grade point|cgpa|semester|course code|marks obtained)/i;
const CERT = /(this is to certify|certificate of|has successfully completed|awarded to)/i;
const JUNK =
  /(company profile|letterhead|bni\b|zoom\.us|unsubscribe|newsletter|invoice|quotation|purchase order)/i;

/**
 * Documents that are not candidate material at all — insurer medical forms,
 * bank/NSSF paperwork, ID scans. They carry an employer's or provider's contact
 * details, add nothing to a talent profile, and are personal data we have no
 * reason to hold. Skipped outright: not parsed, not uploaded, not stored.
 */
const NOT_CANDIDATE_MATERIAL =
  /(medical (form|application|examination|report)|health (declaration|questionnaire)|nssf|national social security|bank (details|form|mandate)|passport (photo|copy)|national id|birth certificate)/i;

function classify(filename, text) {
  const fn = filename.toLowerCase();
  const t = text.slice(0, 6000);
  const sections = (t.match(CV_SECTIONS) ?? []).length >= 2;
  const namedCv = /(\bcv\b|_cv_|resume|curriculum)/.test(fn);

  // Checked before anything else: a medical form can mention "education" and
  // otherwise look CV-shaped, but it is never candidate material.
  if (NOT_CANDIDATE_MATERIAL.test(fn) || NOT_CANDIDATE_MATERIAL.test(t.slice(0, 2000))) {
    return 'skip';
  }
  if (JUNK.test(t) && !sections) return 'junk';
  // A CV wins over certificate/transcript markers: CVs routinely LIST awards
  // and qualifications, which was misfiling real CVs as certificates
  // (EYOTARU_..._cv_2024.pdf, Sule_Faridat_Hussein_CV.pdf in the dry run).
  if (sections && t.length > 1200) return 'cv';
  if (namedCv && t.length > 800) return 'cv';
  if (TRANSCRIPT.test(t) || fn.includes('transcript')) return 'transcript';
  if (CERT.test(t) || fn.includes('certificate')) return 'certificate';
  if (COVER.test(t) || fn.includes('cover') || fn.includes('application_letter')) return 'cover_letter';
  if (t.trim().length < 200) return 'unreadable';
  return 'other';
}

/**
 * Shared/company addresses that appear on forms (insurer medical forms, agency
 * templates). These are NOT identities: keying on them would silently merge
 * unrelated people into one contact. The dry run caught
 * medicaluic@uap-group.com on two different applicants' medical forms.
 *
 * Belt and braces — the structural guard is that only a CV may create a new
 * person (see below), so a form can never mint one.
 */
const SHARED_EMAIL =
  /^(medical|hr|info|jobs?|careers?|recruit|apply|applications?|admin|office|contact|enquiries|sales)[@.]|@(uap-group|jubileeinsurance|.*insurance)\./i;

// --- skills (free keyword match) -------------------------------------------
const SKILL_TERMS = [
  'recruitment','payroll','hris','onboarding','employee relations','training',
  'performance management','compensation','benefits','talent acquisition',
  'accounting','bookkeeping','quickbooks','tally','auditing','taxation','ifrs',
  'procurement','supply chain','logistics','inventory','warehouse',
  'customer service','sales','marketing','digital marketing','social media',
  'excel','microsoft office','powerpoint','data analysis','sql','power bi',
  'project management','administration','recordkeeping','communication',
  'javascript','python','react','node','java','php','html','css',
  'nursing','clinical','pharmacy','laboratory','driving','security','teaching',
];
function extractSkills(text) {
  const t = text.toLowerCase();
  const found = SKILL_TERMS.filter((s) => t.includes(s));
  return [...new Set(found)].slice(0, 12).map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
}

function guessYears(text) {
  const m = text.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/i);
  if (m) {
    const y = Number(m[1]);
    if (y >= 0 && y <= 45) return y;
  }
  return null;
}

const MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.rtf': 'application/rtf',
  '.odt': 'application/vnd.oasis.opendocument.text',
};

// --- file discovery ---------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (!SKIP_EXTS.has(extname(name).toLowerCase()) && !name.startsWith('.')) out.push(p);
  }
  return out;
}

// --- main -------------------------------------------------------------------
async function main() {
  console.log(`CV import — batch ${BATCH}${DRY ? '  (DRY RUN — no writes)' : ''}`);

  const files = walk(CV_DIR);
  console.log(`Found ${files.length} files (including _removed/).`);

  // Skip anything already imported (idempotency).
  const { data: done } = await db.from('cv_import_files').select('file_sha256');
  const seen = new Set((done ?? []).map((r) => r.file_sha256));
  if (seen.size) console.log(`${seen.size} already imported — will skip.`);

  const stats = {
    processed: 0, skipped: 0, cvs: 0, attachments: 0,
    candidatesCreated: 0, candidatesUpdated: 0, contactsCreated: 0,
    needsReview: 0, unattributable: 0, unreadable: 0, errors: 0,
  };

  let count = 0;
  for (const path of files) {
    if (count >= LIMIT) break;

    const bytes = readFileSync(path);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (seen.has(sha)) { stats.skipped++; continue; }
    seen.add(sha);
    count++;

    const filename = basename(path);
    const ext = extname(path).toLowerCase();
    const text = extractText(path);
    const docType = classify(filename, text);
    let email = findEmail(text);
    const phone = findPhone(text);
    // A shared/company address identifies an employer, not an applicant.
    if (email && SHARED_EMAIL.test(email)) email = null;
    stats.processed++;

    // Not candidate material (medical forms, bank/NSSF paperwork, ID scans):
    // do not parse, upload or store. Record the hash only, so a re-run skips it.
    if (docType === 'skip') {
      stats.skippedNotCandidate = (stats.skippedNotCandidate ?? 0) + 1;
      if (!DRY) {
        await db.from('cv_import_files').insert({
          file_sha256: sha, original_name: filename, doc_type: 'skip', import_batch: BATCH,
        });
      }
      continue;
    }

    if (docType === 'unreadable') stats.unreadable++;
    if (!email && !phone) { stats.unattributable++; }

    if (DRY) {
      if (count <= 15) {
        console.log(`  ${docType.padEnd(13)} ${filename.slice(0, 44).padEnd(46)} ${email ?? phone ?? '—'}`);
      }
      continue;
    }

    try {
      // ---- find-or-create the person (email then phone) ----
      let contactId = null;
      if (email) {
        const { data } = await db.from('contacts').select('id').ilike('email', email).maybeSingle();
        contactId = data?.id ?? null;
      }
      if (!contactId && phone) {
        const { data } = await db.from('contacts').select('id').eq('phone_e164', phone).maybeSingle();
        contactId = data?.id ?? null;
      }

      const name = guessName(text);
      const isCvDoc = docType === 'cv';

      // STRUCTURAL GUARD: only a CV may create a new person. A cover letter,
      // certificate or medical form attaches to someone who already exists —
      // it must never mint a candidate, because those documents frequently
      // carry an employer's or insurer's contact details rather than the
      // applicant's, which would merge unrelated people onto one record.
      if (!contactId && (email || phone) && isCvDoc) {
        const { data, error } = await db
          .from('contacts')
          .insert({
            full_name: name ?? (email ? email.split('@')[0] : 'Unnamed candidate'),
            email,
            phone_e164: phone,
            source: 'CV import (Aug 2026)',
          })
          .select('id')
          .single();
        if (error) throw error;
        contactId = data.id;
        stats.contactsCreated++;
      }

      // Unattributable file: no contact key at all. Log it and move on — we do
      // not invent a person we cannot identify or de-duplicate.
      if (!contactId) {
        await db.from('cv_import_files').insert({
          file_sha256: sha, original_name: filename, doc_type: docType,
          import_batch: BATCH,
        });
        continue;
      }

      // ---- upload the file to the private bucket ----
      const storagePath = `${BATCH}/${sha.slice(0, 12)}${ext}`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(storagePath, bytes, { contentType: MIME[ext] ?? 'application/octet-stream', upsert: true });
      if (upErr && !/exists/i.test(upErr.message)) throw upErr;

      const { data: fileRow, error: fErr } = await db
        .from('candidate_files')
        .insert({
          bucket: BUCKET, path: storagePath, filename,
          mime: MIME[ext] ?? 'application/octet-stream', size_bytes: bytes.length,
        })
        .select('id')
        .single();
      if (fErr) throw fErr;

      // ---- candidate role + profile ----
      await db.from('contact_roles').upsert({ contact_id: contactId, role: 'candidate' });

      const { data: existing } = await db
        .from('candidates').select('id, cv_file_id, headline').eq('contact_id', contactId).maybeSingle();

      const isCv = isCvDoc;
      if (isCv) stats.cvs++; else stats.attachments++;

      // Review flags — a human should glance at these.
      const reasons = [];
      if (!name) reasons.push('no name extracted');
      if (!email) reasons.push('no email');
      if (text.trim().length < 400) reasons.push('thin text');
      const needsReview = isCv && reasons.length > 0;
      if (needsReview) stats.needsReview++;

      if (existing) {
        // Only a CV may set the primary cv_file_id / profile fields.
        if (isCv) {
          const patch = { cv_file_id: fileRow.id, import_batch: BATCH };
          if (name) patch.headline = existing.headline ?? null;
          const skills = extractSkills(text);
          if (skills.length) patch.skills = skills;
          const yrs = guessYears(text);
          if (yrs !== null) patch.years_experience = yrs;
          if (needsReview) { patch.needs_review = true; patch.review_reason = reasons.join('; '); }
          await db.from('candidates').update(patch).eq('id', existing.id);
          stats.candidatesUpdated++;
        }
        var candidateId = existing.id;
      } else {
        const { data, error } = await db
          .from('candidates')
          .insert({
            contact_id: contactId,
            skills: extractSkills(text),
            years_experience: guessYears(text),
            cv_file_id: isCv ? fileRow.id : null,
            source: 'CV import (Aug 2026)',
            import_batch: BATCH,
            needs_review: needsReview,
            review_reason: needsReview ? reasons.join('; ') : null,
          })
          .select('id')
          .single();
        if (error) throw error;
        candidateId = data.id;
        stats.candidatesCreated++;
      }

      await db.from('cv_import_files').insert({
        file_sha256: sha, original_name: filename, doc_type: docType,
        candidate_id: candidateId, contact_id: contactId,
        storage_path: storagePath, import_batch: BATCH,
      });

      if (count % 25 === 0) console.log(`  …${count} files`);
    } catch (e) {
      stats.errors++;
      console.error(`  ! ${filename.slice(0, 50)}: ${e.message?.slice(0, 90)}`);
    }
  }

  console.log('\n' + '='.repeat(56));
  console.log(DRY ? 'DRY RUN SUMMARY (nothing written)' : 'IMPORT SUMMARY');
  console.log('='.repeat(56));
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  if (!DRY) {
    const { count: total } = await db.from('candidates').select('*', { count: 'exact', head: true });
    const { count: review } = await db
      .from('candidates').select('*', { count: 'exact', head: true }).eq('needs_review', true);
    console.log(`\n  candidates in pool   ${total}`);
    console.log(`  awaiting review      ${review}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

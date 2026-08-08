#!/usr/bin/env node
/**
 * Name recovery pass for bulk-imported candidates.
 *
 *   node --env-file=.env.rls.local tools/cv-fix-names.mjs --dry
 *   node --env-file=.env.rls.local tools/cv-fix-names.mjs
 *
 * The importer extracts a name from the CV text, which works ~73% of the time.
 * The rest fall back to the email prefix ("mokolade.ayo") or, worse, pick up a
 * company header ("Femtech Information Technology").
 *
 * The filename is a second, independent source that the importer ignored — and
 * it is often better: "MOKOLADE_AYODELE_OLANIYAN_RESUME_UPDATE.pdf". This pass
 * mines it, and only accepts a candidate name when it CROSS-VALIDATES against
 * the person's email (shared token/prefix). That check is what keeps us from
 * confidently writing a wrong name — a wrong name is worse than a placeholder,
 * because it looks correct.
 */

import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');

const url = process.env.RLS_SUPABASE_URL;
const key = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Run with: node --env-file=.env.rls.local tools/cv-fix-names.mjs');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Words that mean "this is a document", not a person.
const NOISE_TOKEN =
  /^(cv|cvs|resume|resumes|curriculum|vitae|updated?|update|final|copy|new|latest|my|the|of|for|and|doc|docx|pdf|application|letter|cover|profile|professional|personal|edited?|revised?|draft|version|v\d*|\d+|20\d\d|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|mail|attachment|document|file|scan|scanned|signed)$/i;

// Strings that indicate an ORGANISATION, not a person. Writing one of these as
// a person's name is the "Femtech Information Technology" bug.
const COMPANY_MARKER =
  /\b(ltd|limited|plc|inc|llc|company|co|technolog|solutions?|services?|consult|consultancy|enterprises?|ventures?|holdings?|group|agency|associates?|international|global|systems?|industries|logistics|foundation|organisation|organization|institute|university|college|school|bank|insurance|sacco|femtech)\b/i;

/**
 * Document titles that survive filename cleanup and can spuriously
 * cross-validate — e.g. "UMA Training Courses Prospectus" matched a contact
 * whose fallback name was "training". A person is never called any of these.
 */
const DOCUMENT_TITLE =
  /\b(prospectus|courses?|curriculum|syllabus|terms?|reference|brochure|catalogue|catalog|report|form|template|agenda|minutes|policy|manual|guide|handbook|proposal|invoice|receipt|contract|agreement|schedule|programme|program|training|workshop|seminar|admission|list|register|results?)\b/i;

// Honorifics to strip: "Miss Mirembe Cynthia Nancy" -> "Mirembe Cynthia Nancy".
const TITLE = /^(mr|mrs|miss|ms|dr|prof|eng|engr|sir|madam|hon|rev|capt)\.?$/i;

function titleCase(s) {
  return s
    .split(/\s+/)
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)
        ? w // keep short initialisms as-is
        : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ');
}

/** Pull a plausible person-name out of an import filename. */
function nameFromFilename(filename) {
  let s = filename
    .replace(/^[0-9a-f]{8}_/i, '') // the import hash prefix
    .replace(/\.[a-z0-9]+$/i, '') // extension
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let tokens = s.split(' ').filter(Boolean);
  tokens = tokens.filter((t) => !NOISE_TOKEN.test(t));
  // 3+ letters only: drops numeric junk and stray fragments like the "Oc" left
  // behind by "Oc_2022" (October), which produced "… Olaniyan Oc".
  tokens = tokens.filter((t) => /^[A-Za-z'’]{3,}$/.test(t));
  tokens = tokens.filter((t) => !TITLE.test(t));

  if (tokens.length < 2 || tokens.length > 4) return null;
  const joined = tokens.join(' ');
  if (COMPANY_MARKER.test(joined) || DOCUMENT_TITLE.test(joined)) return null;
  return titleCase(joined);
}

/**
 * Does this name plausibly belong to this email? Requires a shared signal —
 * any name token of 3+ chars appearing in the email's local part (or vice
 * versa). Without this we would confidently write names that are simply wrong.
 */
function crossValidates(name, email) {
  if (!email) return false;
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  if (local.length < 3) return false;
  const tokens = name.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  return tokens.some((t) => local.includes(t) || t.includes(local));
}

/** Is the stored name just the email prefix (i.e. the importer's fallback)? */
function isEmailPrefixName(name, email) {
  if (!name || !email) return false;
  const local = email.split('@')[0].toLowerCase();
  return name.toLowerCase().replace(/\s+/g, '') === local.replace(/[^a-z0-9]/g, '')
    || name.toLowerCase() === local;
}

async function main() {
  console.log(`Name recovery${DRY ? ' (DRY RUN — no writes)' : ''}\n`);

  // PostgREST caps a response at 1,000 rows regardless of .limit(), so both of
  // these must be paged or the pass silently covers only the first thousand.
  async function fetchAll(table, select, tweak = (q) => q) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await tweak(db.from(table).select(select)).range(from, from + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  const cands = await fetchAll(
    'candidates',
    'id, contact_id, needs_review, review_reason, contact:contacts(full_name, email)',
    (q) => q.not('import_batch', 'is', null),
  );

  const files = await fetchAll('cv_import_files', 'candidate_id, original_name', (q) =>
    q.eq('doc_type', 'cv'),
  );
  const fileFor = new Map();
  for (const f of files) {
    if (f.candidate_id && !fileFor.has(f.candidate_id)) fileFor.set(f.candidate_id, f.original_name);
  }

  const stats = { total: cands.length, recovered: 0, titleStripped: 0, companyCleared: 0, stillUnknown: 0, ok: 0 };
  const samples = { recovered: [], company: [], unresolved: [] };

  for (const c of cands) {
    const current = (c.contact?.full_name ?? '').trim();
    const email = c.contact?.email ?? null;
    const filename = fileFor.get(c.id);

    // 1. A company name stored as a person — always wrong, always clear it.
    if (current && COMPANY_MARKER.test(current)) {
      const fromFile = filename ? nameFromFilename(filename) : null;
      const replacement = fromFile && crossValidates(fromFile, email) ? fromFile : null;
      if (samples.company.length < 6) samples.company.push(`${current}  ->  ${replacement ?? '(cleared, flagged)'}`);
      if (!DRY) {
        await db.from('contacts')
          .update({ full_name: replacement ?? (email ? email.split('@')[0] : 'Unknown') })
          .eq('id', c.contact_id);
        await db.from('candidates')
          .update({ needs_review: !replacement, review_reason: replacement ? null : 'company name in CV header; name unresolved' })
          .eq('id', c.id);
      }
      stats.companyCleared++;
      continue;
    }

    // 2. Strip an honorific from an otherwise good name.
    const words = current.split(/\s+/).filter(Boolean);
    if (words.length > 2 && TITLE.test(words[0])) {
      const stripped = titleCase(words.slice(1).join(' '));
      if (!DRY) await db.from('contacts').update({ full_name: stripped }).eq('id', c.contact_id);
      stats.titleStripped++;
      continue;
    }

    // 3. The importer fell back to the email prefix — try the filename.
    if (isEmailPrefixName(current, email) || c.needs_review) {
      const fromFile = filename ? nameFromFilename(filename) : null;
      if (fromFile && crossValidates(fromFile, email)) {
        if (samples.recovered.length < 10) samples.recovered.push(`${current.padEnd(28)} -> ${fromFile}`);
        if (!DRY) {
          await db.from('contacts').update({ full_name: fromFile }).eq('id', c.contact_id);
          await db.from('candidates').update({ needs_review: false, review_reason: null }).eq('id', c.id);
        }
        stats.recovered++;
      } else {
        if (samples.unresolved.length < 5) samples.unresolved.push(`${current} | file: ${filename ?? '—'}`);
        stats.stillUnknown++;
      }
      continue;
    }

    stats.ok++;
  }

  console.log('RECOVERED FROM FILENAME (cross-validated against email):');
  samples.recovered.forEach((s) => console.log('  ' + s));
  if (samples.company.length) {
    console.log('\nCOMPANY NAMES CLEARED:');
    samples.company.forEach((s) => console.log('  ' + s));
  }
  if (samples.unresolved.length) {
    console.log('\nSTILL UNRESOLVED (stay flagged, CV attached):');
    samples.unresolved.forEach((s) => console.log('  ' + s));
  }

  console.log('\n' + '='.repeat(50));
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(16)} ${v}`);

  if (!DRY) {
    const { count: review } = await db
      .from('candidates').select('*', { count: 'exact', head: true }).eq('needs_review', true);
    console.log(`\n  still needing review: ${review}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

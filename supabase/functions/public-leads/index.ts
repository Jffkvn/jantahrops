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

import { createClient } from 'jsr:@supabase/supabase-js@2';

// --- config ----------------------------------------------------------------
const MAX_BODY_BYTES = 10_240; // 10 KB
const RATE_LIMIT_MAX = 8; // submissions per IP per window
const RATE_LIMIT_WINDOW_MIN = 1;
// Set PUBLIC_LEADS_ALLOWED_ORIGIN to the production website origin to lock this
// down. Defaults to '*': safe here because the endpoint is write-only and
// carries no credentials, and CORS never gates non-browser callers anyway.
const ALLOWED_ORIGIN = Deno.env.get('PUBLIC_LEADS_ALLOWED_ORIGIN') ?? '*';

function corsHeaders(origin: string | null): HeadersInit {
  const allow = ALLOWED_ORIGIN === '*' ? (origin ?? '*') : ALLOWED_ORIGIN;
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

// --- the website's payload -------------------------------------------------
interface WebsitePayload {
  leadType?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  organization?: string;
  trainingUnit?: string;
  message?: string;
  honeypot?: string;
  sourcePage?: string;
  metadata?: unknown;
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

  let payload: WebsitePayload;
  try {
    payload = JSON.parse(raw) as WebsitePayload;
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400, origin);
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

  if (!fullName) return json({ ok: false, error: 'A name is required.' }, 400, origin);
  if (!email && !phone) {
    return json({ ok: false, error: 'An email or phone number is required.' }, 400, origin);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

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
    let contactId: string | null = null;
    if (email) {
      const { data } = await supabase.from('contacts').select('id').ilike('email', email).maybeSingle();
      contactId = data?.id ?? null;
    }
    if (!contactId && phone) {
      const { data } = await supabase.from('contacts').select('id').eq('phone_e164', phone).maybeSingle();
      contactId = data?.id ?? null;
    }
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
      contactId = data.id;
    }

    await supabase.from('contact_roles').upsert({ contact_id: contactId, role: 'lead' });

    // Lead. service_interest carries the training unit; message becomes a note.
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        contact_id: contactId,
        organisation_id: organisationId,
        service_interest: (payload.trainingUnit ?? '').trim() || null,
        source: `Website (${leadType}) ${(payload.sourcePage ?? '').trim()}`.trim(),
        stage: 'new',
      })
      .select('id')
      .single();
    if (leadError) throw leadError;

    // The raw message and metadata as the first timeline entry.
    const noteParts = [payload.message?.trim(), payload.sourcePage ? `Page: ${payload.sourcePage}` : '']
      .filter(Boolean)
      .join('\n');
    await supabase.from('activities').insert({
      subject_type: 'lead',
      subject_id: lead.id,
      type: 'system',
      body: noteParts || 'Captured from the website.',
      meta: { source: 'public-leads', payload },
    });

    // Link the submission to what it produced (audit trail).
    await supabase
      .from('web_submissions')
      .update({ contact_id: contactId, lead_id: lead.id })
      .eq('id', submissionId);

    return json({ ok: true }, 200, origin);
  } catch (_e) {
    // The submission row remains as evidence something arrived; the lead did
    // not complete. Never leak internals to the caller.
    return json({ ok: false, error: 'Could not process the submission.' }, 500, origin);
  }
});

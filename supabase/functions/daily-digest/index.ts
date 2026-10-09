// JantaHR Ops — weekday morning digest email.
//
// Called by pg_cron at 07:30 Kampala time, Monday to Saturday (see migration
// 20261009170000_review_queue_and_digest.sql). Emails every active team member
// what needs doing today: website submissions waiting for review, follow-ups
// due or overdue, tasks due or overdue, and overdue invoices. Sends nothing on
// a morning with nothing to report.
//
// Auth: deployed --no-verify-jwt; the caller must send the x-digest-secret
// header matching DIGEST_CRON_SECRET (stored for pg_cron in Supabase Vault as
// digest_cron_secret). POST {"dryRun": true} returns the email without sending.
//
// Deploy: supabase functions deploy daily-digest --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildDigest, type DigestData, isEmptyDigest } from '../_shared/digest.ts';
import { OPS_URL } from '../_shared/ops-url.ts';
import { sendConfirmation } from '../_shared/resend.ts';

const SECRET = Deno.env.get('DIGEST_CRON_SECRET') ?? '';
/** Optional override, comma-separated; otherwise every active team member. */
const DIGEST_TO = (Deno.env.get('DIGEST_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const FROM = 'JantaHR Ops <no-reply@jantahr.com>';
const OPEN_STAGES = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Constant-time comparison so the secret can't be guessed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function kampalaDay(now = new Date()): { date: string; start: string; end: string } {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
  return {
    date,
    start: new Date(`${date}T00:00:00+03:00`).toISOString(),
    end: new Date(`${date}T23:59:59+03:00`).toISOString(),
  };
}

// deno-lint-ignore no-explicit-any
type Row = any;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  if (!SECRET || !safeEqual(req.headers.get('x-digest-secret') ?? '', SECRET)) {
    return json({ ok: false, error: 'Unauthorised.' }, 401);
  }
  let dryRun = false;
  try {
    dryRun = Boolean(((await req.json()) as { dryRun?: unknown })?.dryRun);
  } catch {
    // An empty body is the normal cron call.
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const day = kampalaDay();

  const [followUps, tasks, leadsNew, appsNew, candsNew, invoices, people] = await Promise.all([
    supabase
      .from('leads')
      .select('next_action_at, next_action_note, contact:contacts!leads_contact_id_fkey ( full_name ), owner:profiles!leads_owner_id_fkey ( full_name )')
      .in('stage', OPEN_STAGES)
      .not('next_action_at', 'is', null)
      .lte('next_action_at', day.end)
      .order('next_action_at', { ascending: true }),
    supabase
      .from('tasks')
      .select('title, due_at, assignee:profiles!tasks_assignee_id_fkey ( full_name )')
      .eq('status', 'open')
      .not('due_at', 'is', null)
      .lte('due_at', day.end)
      .order('due_at', { ascending: true }),
    supabase
      .from('leads')
      .select('source, service_interest, contact:contacts!leads_contact_id_fkey ( full_name )')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('applications')
      .select('candidate_id, vacancy:vacancies!applications_vacancy_id_fkey ( title ), candidate:candidates!applications_candidate_id_fkey ( contact:contacts!candidates_contact_id_fkey ( full_name ) )')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('candidates')
      .select('id, contact:contacts!candidates_contact_id_fkey ( full_name )')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('number, total_ugx, due_date, organisation:organisations!documents_organisation_id_fkey ( name ), contact:contacts!documents_contact_id_fkey ( full_name )')
      .eq('type', 'invoice')
      .in('status', ['issued', 'part_paid'])
      .lt('due_date', day.date)
      .order('due_date', { ascending: true }),
    supabase.from('profiles').select('email, full_name').eq('is_active', true),
  ]);

  for (const r of [followUps, tasks, leadsNew, appsNew, candsNew, invoices, people]) {
    if (r.error) {
      console.error('[digest] query failed', r.error);
      return json({ ok: false, error: 'Query failed.' }, 500);
    }
  }

  const apps = (appsNew.data ?? []) as Row[];
  const applying = new Set(apps.map((a) => a.candidate_id));
  const pool = ((candsNew.data ?? []) as Row[]).filter((c) => !applying.has(c.id));
  const leadRows = (leadsNew.data ?? []) as Row[];

  const data: DigestData = {
    startOfToday: day.start,
    followUps: ((followUps.data ?? []) as Row[]).map((l) => ({
      name: l.contact?.full_name ?? 'Unknown contact',
      note: l.next_action_note,
      dueAt: l.next_action_at,
      owner: l.owner?.full_name || null,
    })),
    tasks: ((tasks.data ?? []) as Row[]).map((t) => ({
      title: t.title,
      dueAt: t.due_at,
      assignee: t.assignee?.full_name || null,
    })),
    newArrivals: {
      leads: leadRows.length,
      applications: apps.length,
      talentPool: pool.length,
      names: [
        ...leadRows.map((l) => `${l.contact?.full_name ?? 'Unknown'} · ${l.service_interest ?? 'Website lead'}`),
        ...apps.map((a) => `${a.candidate?.contact?.full_name ?? 'Unknown'} · Application · ${a.vacancy?.title ?? 'vacancy'}`),
        ...pool.map((c) => `${c.contact?.full_name ?? 'Unknown'} · Talent pool`),
      ],
    },
    overdueInvoices: ((invoices.data ?? []) as Row[]).map((d) => ({
      number: d.number,
      client: d.organisation?.name ?? d.contact?.full_name ?? null,
      totalUgx: Number(d.total_ugx ?? 0),
      dueDate: d.due_date,
    })),
  };

  if (isEmptyDigest(data)) {
    console.log('[digest] nothing to report today');
    return json({ ok: true, sent: 0, reason: 'nothing to report' });
  }

  const recipients: { email: string; firstName: string }[] =
    DIGEST_TO.length > 0
      ? DIGEST_TO.map((email) => ({ email, firstName: '' }))
      : ((people.data ?? []) as Row[])
          .filter((p) => p.email)
          .map((p) => ({ email: p.email, firstName: (p.full_name ?? '').trim().split(' ')[0] ?? '' }));

  if (dryRun) {
    const preview = buildDigest(data, recipients[0]?.firstName ?? '', OPS_URL);
    return json({ ok: true, dryRun: true, recipients: recipients.length, subject: preview.subject, text: preview.text });
  }

  let sent = 0;
  for (const r of recipients) {
    const email = buildDigest(data, r.firstName, OPS_URL);
    const ok = await sendConfirmation(r.email, email, 'daily_digest', `digest-${day.date}-${r.email}`, { from: FROM });
    if (ok) sent++;
  }
  console.log(`[digest] sent ${sent} of ${recipients.length}`);
  return json({ ok: true, sent, recipients: recipients.length });
});

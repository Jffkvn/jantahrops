import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Signals rule-engine tests against the live database. Run with
 * `npm run test:rls`. Throws (never skips) if credentials are absent.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'Signals RLS tests need RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY and ' +
      'RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. They fail rather than ' +
      'skip on purpose.',
  );
}

const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });
const created: { leads: string[]; contacts: string[]; signals: string[] } = {
  leads: [],
  contacts: [],
  signals: [],
};

/**
 * Fixture phones are unique per run.
 *
 * `contacts.phone_e164` is uniquely indexed, so a hardcoded number turns any
 * interrupted run into a permanent failure: the cleanup never happens, the row
 * survives, and every subsequent run gets a 23505 on insert and a confusing
 * `Cannot read properties of null` three lines later. A per-run suffix means an
 * aborted run leaves litter, never a blockage.
 */
const RUN = String(Date.now()).slice(-7);
const fixturePhone = (n: number) => `+2567${RUN}${String(n).padStart(2, '0')}`;

async function makeColdLead(name: string, phone: string): Promise<string> {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { data: c, error } = await db
    .from('contacts')
    .insert({ full_name: name, phone_e164: phone })
    .select('id')
    .single();
  // Fail on the real cause rather than on a null dereference further down.
  if (error) throw new Error(`could not create fixture contact ${name}: ${error.message}`);
  created.contacts.push(c.id);
  const { data: l } = await db
    .from('leads')
    .insert({ contact_id: c.id, stage: 'contacted', created_at: tenDaysAgo })
    .select('id')
    .single();
  created.leads.push(l!.id);
  return l!.id;
}

beforeAll(async () => {
  await db.from('signals').delete().eq('kind', 'lead_going_cold');
});

afterAll(async () => {
  for (const id of created.leads) await db.from('leads').delete().eq('id', id);
  for (const id of created.contacts) await db.from('contacts').delete().eq('id', id);
  await db.from('signals').delete().eq('kind', 'lead_going_cold');
});

describe('signals: lead_going_cold rule', () => {
  it('fires for an active lead with no next action, quiet > 7 days', async () => {
    const leadId = await makeColdLead('RLS Cold One', fixturePhone(1));
    await db.rpc('generate_signals');
    const { data } = await db
      .from('signals')
      .select('id, title, evidence, status')
      .eq('subject_id', leadId)
      .eq('status', 'open');
    expect(data).toHaveLength(1);
    expect(data?.[0]?.title).toContain('gone quiet');
    expect((data?.[0]?.evidence as { days_quiet: number }).days_quiet).toBeGreaterThanOrEqual(7);
  });

  it('is idempotent — a second run does not duplicate', async () => {
    const leadId = await makeColdLead('RLS Cold Two', fixturePhone(2));
    await db.rpc('generate_signals');
    await db.rpc('generate_signals');
    const { count } = await db
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', leadId)
      .eq('status', 'open');
    expect(count).toBe(1);
  });

  it('does NOT fire for a lead that has a next action set', async () => {
    const { data: c } = await db
      .from('contacts')
      .insert({ full_name: 'RLS Warm', phone_e164: fixturePhone(3) })
      .select('id')
      .single();
    created.contacts.push(c!.id);
    const { data: l } = await db
      .from('leads')
      .insert({
        contact_id: c!.id,
        stage: 'new',
        created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        next_action_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    created.leads.push(l!.id);
    await db.rpc('generate_signals');
    const { count } = await db
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', l!.id)
      .eq('status', 'open');
    expect(count).toBe(0);
  });

  it('expires when the lead is actioned', async () => {
    const leadId = await makeColdLead('RLS Cold Three', fixturePhone(4));
    await db.rpc('generate_signals');
    await db.from('leads').update({ next_action_at: new Date().toISOString() }).eq('id', leadId);
    await db.rpc('generate_signals');
    const { count } = await db
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', leadId)
      .eq('status', 'open');
    expect(count).toBe(0);
  });

  it('dismissal suppresses re-firing within the cooldown', async () => {
    const leadId = await makeColdLead('RLS Cold Four', fixturePhone(5));
    await db.rpc('generate_signals');
    // Dismiss it.
    await db
      .from('signals')
      .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
      .eq('subject_id', leadId)
      .eq('status', 'open');
    // Regenerate — should NOT reappear (dismissed < 3 days ago).
    await db.rpc('generate_signals');
    const { count } = await db
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', leadId)
      .eq('status', 'open');
    expect(count).toBe(0);
  });
});

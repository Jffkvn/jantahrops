import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Projects against the live database — run with `npm run test:rls`.
 *
 * The P&L view is the reason this file exists. It is the only place in the
 * product that produces a number nobody can check by eye: a profit figure
 * assembled from four sources. A sign error or a missed join would look
 * perfectly plausible on screen, so every term is asserted against arithmetic
 * done here rather than in SQL.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'Projects tests need RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY and ' +
      'RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. They fail rather than skip.',
  );
}

const stamp = Date.now();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const staff = { email: `rls-proj-staff-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };
const other = { email: `rls-proj-other-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };
let staffClient: SupabaseClient;
let otherClient: SupabaseClient;

let orgId = '';
let projectId = '';
/** The user's real day rate, restored in afterAll. */
let originalDayRate: number | null = null;

const DAY_RATE = 250_000;
const CONTRACTED = 10_000_000;
const EXPENSE_A = 1_500_000;
const EXPENSE_B = 250_000;

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`);
  return client;
}

async function pnl() {
  const { data, error } = await admin
    .from('v_project_pnl')
    .select('*')
    .eq('project_id', projectId)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  const { data: company } = await admin
    .from('company_profile')
    .select('internal_day_rate_ugx')
    .single();
  originalDayRate = company?.internal_day_rate_ugx ?? null;
  await admin.from('company_profile').update({ internal_day_rate_ugx: null }).eq('id', true);

  for (const u of [staff, other]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) throw error;
    u.id = data.user.id;
  }
  staffClient = await signIn(staff.email, staff.password);
  otherClient = await signIn(other.email, other.password);

  const { data: org, error: orgError } = await admin
    .from('organisations')
    .insert({ name: `ZZ RLS Projects Org ${stamp}` })
    .select('id')
    .single();
  if (orgError) throw orgError;
  orgId = org.id;

  const { data: project, error: projectError } = await admin
    .from('projects')
    .insert({
      organisation_id: orgId,
      name: `ZZ RLS Project ${stamp}`,
      stage: 'active',
      contracted_value_ugx: CONTRACTED,
    })
    .select('id')
    .single();
  if (projectError) throw projectError;
  projectId = project.id;
});

afterAll(async () => {
  // Expenses are `on delete set null`, so remove them explicitly rather than
  // leaving orphans pointing at nothing.
  if (projectId) await admin.from('expenses').delete().eq('project_id', projectId);
  if (projectId) await admin.from('projects').delete().eq('id', projectId);
  if (orgId) {
    // Settling an invoice in full makes the database generate a RECEIPT, which
    // this file never created and so would never think to delete. It then
    // blocks the organisation delete on a foreign key. Sweep by organisation.
    await admin.from('documents').delete().eq('organisation_id', orgId);
    const { error } = await admin.from('organisations').delete().eq('id', orgId);
    if (error) throw new Error(`projects cleanup left an organisation behind: ${error.message}`);
  }
  await admin
    .from('company_profile')
    .update({ internal_day_rate_ugx: originalDayRate })
    .eq('id', true);
  for (const u of [staff, other]) {
    if (u.id) await admin.auth.admin.deleteUser(u.id);
  }
});

describe('projects: schema guarantees', () => {
  it('refuses a project whose end date precedes its start date', async () => {
    const { error } = await admin.from('projects').insert({
      organisation_id: orgId,
      name: `ZZ backwards ${stamp}`,
      start_date: '2026-09-01',
      end_date: '2026-08-01',
    });
    expect(error).not.toBeNull();
  });

  it('refuses to delete an organisation that still has projects', async () => {
    // `on delete restrict` — losing the delivery history to a stray click on a
    // client record would be silent and unrecoverable.
    const { error } = await admin.from('organisations').delete().eq('id', orgId);
    expect(error).not.toBeNull();
  });

  it('accepts half-days and refuses anything finer', async () => {
    const ok = await admin
      .from('time_entries')
      .insert({ project_id: projectId, work_date: '2026-08-03', days: 0.5 })
      .select('id')
      .single();
    expect(ok.error).toBeNull();
    await admin.from('time_entries').delete().eq('id', ok.data!.id);

    for (const bad of [1.3, 0.25, 0, -1, 8]) {
      const { error } = await admin
        .from('time_entries')
        .insert({ project_id: projectId, work_date: '2026-08-03', days: bad });
      expect(error, `days = ${bad} should have been rejected`).not.toBeNull();
    }
  });

  it('stamps completed_at when a milestone is done and clears it when reopened', async () => {
    const { data: m } = await admin
      .from('project_milestones')
      .insert({ project_id: projectId, title: 'ZZ milestone' })
      .select('id, completed_at')
      .single();
    expect(m?.completed_at).toBeNull();

    await admin.from('project_milestones').update({ status: 'done' }).eq('id', m!.id);
    const { data: done } = await admin
      .from('project_milestones')
      .select('completed_at')
      .eq('id', m!.id)
      .single();
    // The trigger sets this, so it stays right even for a change made in SQL.
    expect(done?.completed_at).not.toBeNull();

    await admin.from('project_milestones').update({ status: 'in_progress' }).eq('id', m!.id);
    const { data: reopened } = await admin
      .from('project_milestones')
      .select('completed_at')
      .eq('id', m!.id)
      .single();
    expect(reopened?.completed_at).toBeNull();

    await admin.from('project_milestones').delete().eq('id', m!.id);
  });

  it('cascades milestones and time when a project is deleted', async () => {
    const { data: p } = await admin
      .from('projects')
      .insert({ organisation_id: orgId, name: `ZZ cascade ${stamp}` })
      .select('id')
      .single();
    await admin.from('project_milestones').insert({ project_id: p!.id, title: 'ZZ gone' });
    await admin
      .from('time_entries')
      .insert({ project_id: p!.id, work_date: '2026-08-03', days: 1 });

    await admin.from('projects').delete().eq('id', p!.id);

    const { count: milestones } = await admin
      .from('project_milestones')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', p!.id);
    const { count: time } = await admin
      .from('time_entries')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', p!.id);
    expect(milestones).toBe(0);
    expect(time).toBe(0);
  });
});

describe('projects: estimated P&L', () => {
  it('reports no labour cost and no profit while the day rate is unset', async () => {
    const row = await pnl();
    expect(row.contracted_value_ugx).toBe(CONTRACTED);
    // Null, never zero. Zero would render as "profit = full contracted value".
    expect(row.labour_cost_ugx).toBeNull();
    expect(row.estimated_profit_ugx).toBeNull();
  });

  it('sums expenses and days across many rows', async () => {
    await admin.from('expenses').insert([
      { category: 'Travel', amount_ugx: EXPENSE_A, incurred_on: '2026-08-01', project_id: projectId },
      { category: 'Printing', amount_ugx: EXPENSE_B, incurred_on: '2026-08-02', project_id: projectId },
    ]);
    await admin.from('time_entries').insert([
      { project_id: projectId, work_date: '2026-08-03', days: 2.5 },
      { project_id: projectId, work_date: '2026-08-04', days: 1.5 },
    ]);

    const row = await pnl();
    expect(row.expenses_ugx).toBe(EXPENSE_A + EXPENSE_B);
    expect(Number(row.days_logged)).toBe(4);
  });

  it('computes labour and profit exactly once a day rate is set', async () => {
    await admin.from('company_profile').update({ internal_day_rate_ugx: DAY_RATE }).eq('id', true);

    const row = await pnl();
    const expectedLabour = 4 * DAY_RATE;
    const expectedProfit = CONTRACTED - (EXPENSE_A + EXPENSE_B) - expectedLabour;

    expect(row.labour_cost_ugx).toBe(expectedLabour);
    expect(row.estimated_profit_ugx).toBe(expectedProfit);
    // Guard the sign: expenses and labour must SUBTRACT. Adding them would give
    // a larger, very plausible-looking number.
    expect(row.estimated_profit_ugx).toBeLessThan(CONTRACTED);
  });

  it('goes negative when the work costs more than the fee', async () => {
    await admin
      .from('expenses')
      .insert({ category: 'Travel', amount_ugx: 20_000_000, incurred_on: '2026-08-05', project_id: projectId });

    const row = await pnl();
    expect(row.estimated_profit_ugx).toBeLessThan(0);

    await admin
      .from('expenses')
      .delete()
      .eq('project_id', projectId)
      .eq('amount_ugx', 20_000_000);
  });

  it('counts an invoice as received only for what was actually paid, WHT included', async () => {
    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'project',
        related_id: projectId,
        status: 'issued',
        subtotal_ugx: 5_000_000,
        total_ugx: 5_000_000,
      })
      .select('id')
      .single();

    let row = await pnl();
    expect(row.invoiced_ugx).toBe(5_000_000);
    expect(row.received_ugx).toBe(0);

    // Uganda WHT: the client pays 94% to us and 6% to URA on our behalf. From
    // the project's side the whole 5,000,000 has been settled.
    await admin.from('payments').insert({
      document_id: doc!.id,
      amount_received_ugx: 4_700_000,
      wht_withheld_ugx: 300_000,
      method: 'bank_transfer',
    });

    row = await pnl();
    expect(row.received_ugx).toBe(5_000_000);

    await admin.from('documents').delete().eq('id', doc!.id);
  });

  it('ignores cancelled invoices — they were never owed', async () => {
    const before = await pnl();
    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'project',
        related_id: projectId,
        status: 'cancelled',
        subtotal_ugx: 9_000_000,
        total_ugx: 9_000_000,
      })
      .select('id')
      .single();

    const after = await pnl();
    expect(after.invoiced_ugx).toBe(before.invoiced_ugx);

    await admin.from('documents').delete().eq('id', doc!.id);
  });

  it('does not leak another project’s money into this one', async () => {
    const { data: sibling } = await admin
      .from('projects')
      .insert({
        organisation_id: orgId,
        name: `ZZ sibling ${stamp}`,
        contracted_value_ugx: 99_000_000,
      })
      .select('id')
      .single();
    await admin.from('expenses').insert({
      category: 'Travel',
      amount_ugx: 7_000_000,
      incurred_on: '2026-08-06',
      project_id: sibling!.id,
    });

    const row = await pnl();
    // The grouped joins must key on project_id; a missing key would fan the
    // sibling's expenses into every row.
    expect(row.expenses_ugx).toBe(EXPENSE_A + EXPENSE_B);
    expect(row.contracted_value_ugx).toBe(CONTRACTED);

    await admin.from('expenses').delete().eq('project_id', sibling!.id);
    await admin.from('projects').delete().eq('id', sibling!.id);
  });
});

describe('projects: access control', () => {
  it('is invisible to anonymous callers, view included', async () => {
    for (const table of ['projects', 'project_milestones', 'time_entries'] as const) {
      const { data } = await anon.from(table).select('id').limit(1);
      expect(data ?? [], `${table} leaked to anon`).toHaveLength(0);
    }
    const { data, error } = await anon.from('v_project_pnl').select('project_id').limit(1);
    expect(data ?? []).toHaveLength(0);
    expect(error?.message ?? '').toContain('permission denied');
  });

  it('lets any signed-in user read and create projects', async () => {
    const { data, error } = await staffClient
      .from('projects')
      .insert({ organisation_id: orgId, name: `ZZ staff made ${stamp}` })
      .select('id')
      .single();
    expect(error).toBeNull();
    await admin.from('projects').delete().eq('id', data!.id);
  });

  it('refuses a project delete from a non-admin', async () => {
    await staffClient.from('projects').delete().eq('id', projectId);
    const { count } = await admin
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('id', projectId);
    expect(count).toBe(1);
  });

  it('lets you correct your own time but not a colleague’s', async () => {
    const { data: mine } = await staffClient
      .from('time_entries')
      .insert({ project_id: projectId, work_date: '2026-08-07', days: 1, user_id: staff.id })
      .select('id')
      .single();

    const ownEdit = await staffClient
      .from('time_entries')
      .update({ days: 2 })
      .eq('id', mine!.id)
      .select('id');
    expect(ownEdit.data ?? []).toHaveLength(1);

    // Editing someone else's logged days silently changes the profit figure on
    // their project, so RLS matches zero rows rather than erroring.
    const foreignEdit = await otherClient
      .from('time_entries')
      .update({ days: 7 })
      .eq('id', mine!.id)
      .select('id');
    expect(foreignEdit.data ?? []).toHaveLength(0);

    const { data: after } = await admin
      .from('time_entries')
      .select('days')
      .eq('id', mine!.id)
      .single();
    expect(Number(after?.days)).toBe(2);

    await admin.from('time_entries').delete().eq('id', mine!.id);
  });
});

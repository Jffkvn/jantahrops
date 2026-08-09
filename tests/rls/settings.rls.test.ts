import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Settings against the live database — run with `npm run test:rls`.
 *
 * The Settings page is mostly a form, so almost everything that can go wrong
 * here is a permission question: who may rewrite the letterhead that prints on
 * every invoice, and who may hand out admin. The UI disables the controls it
 * knows a staff member cannot use, but that is a courtesy — these tests check
 * the database refuses regardless of what the client sends.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'Settings RLS tests need RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY and ' +
      'RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. They fail rather than ' +
      'skip on purpose — a skipped security test reads as a passing one.',
  );
}

const stamp = Date.now();
const staff = { email: `rls-set-staff-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };
const boss = { email: `rls-set-admin-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let staffClient: SupabaseClient;
let adminClient: SupabaseClient;

/** The real row is the user's own company data; restore it exactly. */
let original: Record<string, unknown> | null = null;

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`);
  return client;
}

beforeAll(async () => {
  const { data } = await admin.from('company_profile').select('*').single();
  original = data;

  for (const u of [staff, boss]) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create ${u.email}: ${error.message}`);
    u.id = created.user.id;
  }
  await admin.from('profiles').update({ role: 'admin' }).eq('id', boss.id);
  staffClient = await signIn(staff.email, staff.password);
  adminClient = await signIn(boss.email, boss.password);
});

afterAll(async () => {
  if (original) await admin.from('company_profile').update(original).eq('id', true);
  for (const u of [staff, boss]) {
    if (u.id) await admin.auth.admin.deleteUser(u.id);
  }
});

describe('company_profile', () => {
  it('is exactly one row, and stays one row', async () => {
    const { data, error } = await admin.from('company_profile').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // The CHECK constraint pins id to true, so a second row is impossible.
    const { error: dupe } = await admin.from('company_profile').insert({ id: false });
    expect(dupe).not.toBeNull();
  });

  it('is readable by any signed-in user — the print view needs it', async () => {
    const { data, error } = await staffClient.from('company_profile').select('legal_name').single();
    expect(error).toBeNull();
    expect(typeof data?.legal_name).toBe('string');
  });

  it('is invisible to anonymous callers', async () => {
    const { data } = await anon.from('company_profile').select('legal_name');
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses a write from a staff member', async () => {
    await staffClient.from('company_profile').update({ tin: 'STAFF-SHOULD-NOT-WRITE' }).eq('id', true);
    const { data } = await admin.from('company_profile').select('tin').single();
    // RLS silently matches zero rows rather than erroring, so assert on the data.
    expect(data?.tin).not.toBe('STAFF-SHOULD-NOT-WRITE');
  });

  it('accepts a write from an admin, including the fields that print', async () => {
    const { error } = await adminClient
      .from('company_profile')
      .update({
        tin: '1000TESTTIN',
        address: 'Plot 1, Test Lane',
        bank_details: 'Test Bank\nAccount 123',
        vat_rate_bp: 1800,
      })
      .eq('id', true);
    expect(error).toBeNull();

    const { data } = await admin.from('company_profile').select('*').single();
    expect(data?.tin).toBe('1000TESTTIN');
    expect(data?.address).toBe('Plot 1, Test Lane');
    expect(data?.bank_details).toContain('Test Bank');
  });

  it('stores rates as basis points, so 18% round-trips exactly', async () => {
    // The form takes percent and converts; a float here would drift the VAT on
    // every invoice. 18 -> 1800 -> 18 must be lossless.
    await adminClient.from('company_profile').update({ vat_rate_bp: 1750 }).eq('id', true);
    const { data } = await admin.from('company_profile').select('vat_rate_bp').single();
    expect(data?.vat_rate_bp).toBe(1750);
    expect(Number.isInteger(data?.vat_rate_bp)).toBe(true);
    expect((data?.vat_rate_bp ?? 0) / 100).toBe(17.5);
  });
});

describe('team management', () => {
  it('lets a staff member rename themselves', async () => {
    const { error } = await staffClient
      .from('profiles')
      .update({ full_name: 'Renamed By Self' })
      .eq('id', staff.id);
    expect(error).toBeNull();
    const { data } = await admin.from('profiles').select('full_name').eq('id', staff.id).single();
    expect(data?.full_name).toBe('Renamed By Self');
  });

  it('refuses a staff self-promotion — the trigger, not just the policy', async () => {
    // profiles_update_own permits a staff member to update their OWN row, so
    // only the column-level trigger stops them making themselves an admin.
    const { error } = await staffClient
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', staff.id);
    expect(error).not.toBeNull();

    const { data } = await admin.from('profiles').select('role').eq('id', staff.id).single();
    expect(data?.role).toBe('staff');
  });

  it('refuses a staff member renaming a colleague', async () => {
    await staffClient.from('profiles').update({ full_name: 'Hijacked' }).eq('id', boss.id);
    const { data } = await admin.from('profiles').select('full_name').eq('id', boss.id).single();
    expect(data?.full_name).not.toBe('Hijacked');
  });

  it('lets an admin change a colleague’s role and deactivate them', async () => {
    const { error: roleError } = await adminClient
      .from('profiles')
      .update({ role: 'intern' })
      .eq('id', staff.id);
    expect(roleError).toBeNull();

    const { error: activeError } = await adminClient
      .from('profiles')
      .update({ is_active: false })
      .eq('id', staff.id);
    expect(activeError).toBeNull();

    const { data } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', staff.id)
      .single();
    expect(data?.role).toBe('intern');
    expect(data?.is_active).toBe(false);

    // Deactivated people must drop out of the shared team list, which every
    // owner and assignee picker reads.
    const { data: team } = await adminClient
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .eq('id', staff.id);
    expect(team ?? []).toHaveLength(0);

    await admin.from('profiles').update({ role: 'staff', is_active: true }).eq('id', staff.id);
  });
});

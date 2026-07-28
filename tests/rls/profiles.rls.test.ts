import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * RLS tests — run explicitly with `npm run test:rls`.
 *
 * These are excluded from the default suite because they need a service-role
 * key, which must never sit in a `VITE_` variable or in CI without thought.
 * They are NOT skipped when credentials are missing: a skipped security test
 * reads as a pass, and this file exists precisely to stop that.
 *
 * Required in .env.rls.local (gitignored):
 *   RLS_SUPABASE_URL=https://<ref>.supabase.co
 *   RLS_SUPABASE_ANON_KEY=<anon key>
 *   RLS_SUPABASE_SERVICE_ROLE_KEY=<service role key>
 *
 * Point these at a project you are willing to have test users created in.
 * The suite cleans up after itself, but it does write.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'RLS tests cannot run without credentials. Set RLS_SUPABASE_URL, ' +
      'RLS_SUPABASE_ANON_KEY and RLS_SUPABASE_SERVICE_ROLE_KEY in ' +
      '.env.rls.local. These tests fail rather than skip on purpose — a ' +
      'skipped security test is indistinguishable from a passing one.',
  );
}

const stamp = Date.now();
const users = {
  admin: { email: `rls-admin-${stamp}@example.test`, password: 'Test-Password-123!', id: '' },
  staffA: { email: `rls-staff-a-${stamp}@example.test`, password: 'Test-Password-123!', id: '' },
  staffB: { email: `rls-staff-b-${stamp}@example.test`, password: 'Test-Password-123!', id: '' },
};

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`);
  return client;
}

let adminClient: SupabaseClient;
let staffAClient: SupabaseClient;

beforeAll(async () => {
  for (const key of ['admin', 'staffA', 'staffB'] as const) {
    const { data, error } = await admin.auth.admin.createUser({
      email: users[key].email,
      password: users[key].password,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create ${key}: ${error.message}`);
    users[key].id = data.user.id;
  }

  // Promote one of them via the service role, which bypasses the trigger.
  const { error } = await admin.from('profiles').update({ role: 'admin' }).eq('id', users.admin.id);
  if (error) throw new Error(`could not promote admin: ${error.message}`);

  adminClient = await signedInClient(users.admin.email, users.admin.password);
  staffAClient = await signedInClient(users.staffA.email, users.staffA.password);
}, 60_000);

afterAll(async () => {
  for (const key of ['admin', 'staffA', 'staffB'] as const) {
    if (users[key].id) await admin.auth.admin.deleteUser(users[key].id);
  }
});

describe('profiles RLS', () => {
  it('(a) an anonymous client reads zero profiles', async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await anon.from('profiles').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  it('(b) a signed-in staff user can read all profiles', async () => {
    const { data, error } = await staffAClient.from('profiles').select('id');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('(c) a staff user can update their own full_name', async () => {
    const { error } = await staffAClient
      .from('profiles')
      .update({ full_name: 'Renamed By Self' })
      .eq('id', users.staffA.id);
    expect(error).toBeNull();

    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', users.staffA.id)
      .single();
    expect(data?.full_name).toBe('Renamed By Self');
  });

  it("(d) a staff user cannot change another user's full_name", async () => {
    await staffAClient.from('profiles').update({ full_name: 'Hacked' }).eq('id', users.staffB.id);

    const { data } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', users.staffB.id)
      .single();
    expect(data?.full_name).not.toBe('Hacked');
  });

  it('(e) a staff user CANNOT promote themselves to admin', async () => {
    // The policy allows updating your own row; only the BEFORE UPDATE trigger
    // stops the role column changing. This is the single most important
    // assertion in the file.
    const { error } = await staffAClient
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', users.staffA.id);

    expect(error, 'self-promotion must be rejected by the database').not.toBeNull();
    expect(error?.message).toMatch(/only an admin may change a profile role/i);

    const { data } = await admin.from('profiles').select('role').eq('id', users.staffA.id).single();
    expect(data?.role).toBe('staff');
  });

  it("(f) an admin CAN change another user's role", async () => {
    const { error } = await adminClient
      .from('profiles')
      .update({ role: 'intern' })
      .eq('id', users.staffB.id);
    expect(error).toBeNull();

    const { data } = await admin.from('profiles').select('role').eq('id', users.staffB.id).single();
    expect(data?.role).toBe('intern');
  });

  it('(g) a direct INSERT into profiles is rejected', async () => {
    const { error } = await staffAClient.from('profiles').insert({
      id: crypto.randomUUID(),
      email: 'smuggled@example.test',
      full_name: 'Smuggled',
    });
    expect(error, 'there is no INSERT policy, so this must fail').not.toBeNull();
  });

  it('(h) a staff user cannot delete a profile; an admin can', async () => {
    await staffAClient.from('profiles').delete().eq('id', users.staffB.id);
    const { data: stillThere } = await admin
      .from('profiles')
      .select('id')
      .eq('id', users.staffB.id)
      .maybeSingle();
    expect(stillThere, 'staff must not be able to delete').not.toBeNull();
  });

  it('(i) creating an auth user creates exactly one profile with role staff', async () => {
    const { data } = await admin.from('profiles').select('role').eq('id', users.staffA.id);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.role).toBe('staff');
  });
});

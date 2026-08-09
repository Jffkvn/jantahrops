import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Tasks against the live database — run with `npm run test:rls`.
 *
 * Two things are checked here that no unit test can reach: the RLS shape the
 * spine migration declares (anyone signed in reads and writes, only an admin
 * deletes, anonymous gets nothing), and the exact PostgREST queries the Tasks
 * UI issues — the embed alias, the null-ordering, and the head-count filters
 * that feed the Day View. A typo in an embed alias type-checks perfectly and
 * fails only at runtime, which is precisely the class of bug this catches.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'Tasks RLS tests need RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY and ' +
      'RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. They fail rather than ' +
      'skip on purpose — a skipped security test reads as a passing one.',
  );
}

const stamp = Date.now();
const staff = { email: `rls-tasks-staff-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };
const boss = { email: `rls-tasks-admin-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let staffClient: SupabaseClient;
let adminClient: SupabaseClient;
const createdTasks: string[] = [];

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`);
  return client;
}

/** Title prefix so cleanup can never touch the user's real tasks. */
const PREFIX = `rls-task-${stamp}`;

beforeAll(async () => {
  for (const u of [staff, boss]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) throw new Error(`could not create ${u.email}: ${error.message}`);
    u.id = data.user.id;
  }
  await admin.from('profiles').update({ role: 'admin' }).eq('id', boss.id);
  staffClient = await signIn(staff.email, staff.password);
  adminClient = await signIn(boss.email, boss.password);
});

afterAll(async () => {
  await admin.from('tasks').delete().like('title', `${PREFIX}%`);
  for (const u of [staff, boss]) {
    if (u.id) await admin.auth.admin.deleteUser(u.id);
  }
});

describe('tasks: row level security', () => {
  it('denies anonymous reads of a task that definitely exists', async () => {
    // Asserting on an empty result is only meaningful if there is something to
    // hide: plant a row first, then confirm the anonymous client cannot see it.
    const { data: planted } = await admin
      .from('tasks')
      .insert({ title: `${PREFIX} secret` })
      .select('id')
      .single();
    createdTasks.push(planted!.id);

    const { data: visibleToAdmin } = await admin.from('tasks').select('id').eq('id', planted!.id);
    expect(visibleToAdmin).toHaveLength(1);

    const { data } = await anon.from('tasks').select('id').eq('id', planted!.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('denies anonymous writes', async () => {
    const { error } = await anon.from('tasks').insert({ title: `${PREFIX} anon` });
    expect(error).not.toBeNull();
  });

  it('lets any signed-in user create and read a task', async () => {
    const { data, error } = await staffClient
      .from('tasks')
      .insert({ title: `${PREFIX} staff created`, created_by: staff.id })
      .select('id, status, priority')
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe('open');
    expect(data?.priority).toBe('medium');
    createdTasks.push(data!.id);

    const { data: readBack } = await adminClient.from('tasks').select('id').eq('id', data!.id);
    // A shared list: the other person must see it, not just its author.
    expect(readBack).toHaveLength(1);
  });

  it('refuses a delete from a non-admin but allows it from an admin', async () => {
    const { data } = await admin
      .from('tasks')
      .insert({ title: `${PREFIX} deletable` })
      .select('id')
      .single();

    await staffClient.from('tasks').delete().eq('id', data!.id);
    const { count: stillThere } = await admin
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('id', data!.id);
    expect(stillThere).toBe(1);

    await adminClient.from('tasks').delete().eq('id', data!.id);
    const { count: gone } = await admin
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('id', data!.id);
    expect(gone).toBe(0);
  });
});

describe('tasks: the queries the UI actually issues', () => {
  it('resolves the assignee embed alias used by the task list', async () => {
    const { data, error } = await staffClient
      .from('tasks')
      .insert({ title: `${PREFIX} assigned`, assignee_id: boss.id })
      .select('id')
      .single();
    expect(error).toBeNull();
    createdTasks.push(data!.id);

    const { data: row, error: selectError } = await staffClient
      .from('tasks')
      .select('*, assignee:profiles!tasks_assignee_id_fkey ( id, full_name )')
      .eq('id', data!.id)
      .single();
    expect(selectError).toBeNull();
    // A wrong alias yields an error; a wrong FK name yields the wrong person.
    expect((row as unknown as { assignee: { id: string } }).assignee.id).toBe(boss.id);
  });

  it('sorts undated tasks last, the way the page groups them', async () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const { data: dated } = await admin
      .from('tasks')
      .insert({ title: `${PREFIX} dated`, due_at: soon })
      .select('id')
      .single();
    const { data: undated } = await admin
      .from('tasks')
      .insert({ title: `${PREFIX} undated` })
      .select('id')
      .single();
    createdTasks.push(dated!.id, undated!.id);

    const { data: rows } = await staffClient
      .from('tasks')
      .select('id, due_at')
      .like('title', `${PREFIX}%`)
      .in('id', [dated!.id, undated!.id])
      .order('due_at', { ascending: true, nullsFirst: false });
    expect(rows?.map((r) => r.id)).toEqual([dated!.id, undated!.id]);
  });

  it('counts overdue and due-today separately for the day view', async () => {
    // Kampala day boundaries, matching kampalaDayEnd() in the app.
    const kampalaDay = (offset: number) => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
      const cursor = new Date(`${today}T00:00:00Z`);
      cursor.setUTCDate(cursor.getUTCDate() + offset);
      return new Date(`${cursor.toISOString().slice(0, 10)}T23:59:59.999+03:00`).toISOString();
    };
    const endYesterday = kampalaDay(-1);
    const endToday = kampalaDay(0);

    const { data: late } = await admin
      .from('tasks')
      .insert({ title: `${PREFIX} late`, due_at: new Date(Date.now() - 3 * 86_400_000).toISOString() })
      .select('id')
      .single();
    const { data: today } = await admin
      .from('tasks')
      .insert({ title: `${PREFIX} today`, due_at: endToday })
      .select('id')
      .single();
    createdTasks.push(late!.id, today!.id);

    const { count: overdue } = await staffClient
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .like('title', `${PREFIX}%`)
      .lte('due_at', endYesterday);
    const { count: dueToday } = await staffClient
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .like('title', `${PREFIX}%`)
      .gt('due_at', endYesterday)
      .lte('due_at', endToday);

    // The buckets must not overlap — a task counted twice inflates both numbers
    // on the day view, and the last instant of today is the classic off-by-one.
    expect(overdue).toBe(1);
    expect(dueToday).toBe(1);
  });

  it('stamps completed_at on done and clears it on reopen', async () => {
    const { data } = await staffClient
      .from('tasks')
      .insert({ title: `${PREFIX} completable` })
      .select('id')
      .single();
    createdTasks.push(data!.id);

    await staffClient
      .from('tasks')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', data!.id);
    const { data: done } = await staffClient
      .from('tasks')
      .select('status, completed_at, updated_at')
      .eq('id', data!.id)
      .single();
    expect(done?.status).toBe('done');
    expect(done?.completed_at).not.toBeNull();

    await staffClient
      .from('tasks')
      .update({ status: 'open', completed_at: null })
      .eq('id', data!.id);
    const { data: reopened } = await staffClient
      .from('tasks')
      .select('status, completed_at')
      .eq('id', data!.id)
      .single();
    expect(reopened?.status).toBe('open');
    expect(reopened?.completed_at).toBeNull();
  });

  it('rejects a priority outside the enum', async () => {
    // Deliberately invalid: this client is untyped, so the enum is the guard.
    const { error } = await staffClient
      .from('tasks')
      .insert({ title: `${PREFIX} bad priority`, priority: 'urgent' });
    expect(error).not.toBeNull();
  });

  it('keeps a task when its assignee is deleted, rather than losing the work', async () => {
    const { data: temp } = await admin.auth.admin.createUser({
      email: `rls-tasks-temp-${stamp}@example.test`,
      password: 'Test-Password-123!',
      email_confirm: true,
    });
    const tempId = temp.user?.id;
    if (!tempId) throw new Error('could not create the temporary assignee');

    const { data: task } = await admin
      .from('tasks')
      .insert({ title: `${PREFIX} orphaned`, assignee_id: tempId })
      .select('id')
      .single();
    createdTasks.push(task!.id);

    await admin.auth.admin.deleteUser(tempId);

    const { data: after } = await admin
      .from('tasks')
      .select('id, assignee_id')
      .eq('id', task!.id)
      .maybeSingle();
    // `on delete set null` — the task survives, unassigned.
    expect(after?.id).toBe(task!.id);
    expect(after?.assignee_id).toBeNull();
  });
});

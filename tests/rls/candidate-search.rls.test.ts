import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Talent Pool search against the live database — run with `npm run test:rls`.
 *
 * This exists because of a bug that every type check and unit test passed: the
 * old search resolved a name to CONTACT ids and then filtered CANDIDATE ids
 * with them. Both are uuids, so nothing complained; the query simply returned
 * zero rows for every name anyone typed. The only thing that could have caught
 * it is asking the real database for a candidate whose name we know.
 *
 * The existing unit test asserted that a query was FIRED with the debounced
 * term. It passed throughout. Asserting on the call and not the answer is how a
 * feature stays broken with a green suite.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'Candidate search tests need RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY and ' +
      'RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. They fail rather than skip.',
  );
}

const stamp = Date.now();
const NAME = `Zzyx Searchtest ${stamp}`;
const HEADLINE = `Zzyxheadline${stamp} payroll specialist`;
const SKILL = `ZzyxSkill${stamp}`;
const EMAIL = `zzyx-${stamp}@example.test`;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const staff = { email: `rls-search-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };
let staffClient: SupabaseClient;

let contactId = '';
let candidateId = '';

beforeAll(async () => {
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email: staff.email,
    password: staff.password,
    email_confirm: true,
  });
  if (userError) throw userError;
  staff.id = user.user.id;

  staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await staffClient.auth.signInWithPassword({
    email: staff.email,
    password: staff.password,
  });
  if (signInError) throw signInError;

  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .insert({ full_name: NAME, email: EMAIL })
    .select('id')
    .single();
  if (contactError) throw contactError;
  contactId = contact.id;

  const { data: candidate, error: candidateError } = await admin
    .from('candidates')
    .insert({ contact_id: contactId, headline: HEADLINE, skills: [SKILL], is_available: true })
    .select('id')
    .single();
  if (candidateError) throw candidateError;
  candidateId = candidate.id;
});

afterAll(async () => {
  if (candidateId) await admin.from('candidates').delete().eq('id', candidateId);
  if (contactId) await admin.from('contacts').delete().eq('id', contactId);
  if (staff.id) await admin.auth.admin.deleteUser(staff.id);
});

/** Mirrors listCandidates() exactly — this is the query the page issues. */
async function search(
  term: string,
  opts: { skills?: string[]; available?: boolean; page?: number; pageSize?: number } = {},
) {
  const { skills = [], available, page = 0, pageSize = 25 } = opts;
  let query = staffClient.from('v_candidate_search').select('id', { count: 'exact' });
  if (available !== undefined) query = query.eq('is_available', available);
  if (skills.length > 0) query = query.contains('skills', skills);
  if (term.trim()) query = query.ilike('search_text', `%${term.trim().toLowerCase()}%`);
  const from = page * pageSize;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return { ids: (data ?? []).map((r) => r.id), total: count ?? 0 };
}

describe('talent pool search', () => {
  it('finds a candidate by their contact name — the case that was silently broken', async () => {
    const { ids, total } = await search('Zzyx Searchtest');
    expect(total).toBeGreaterThanOrEqual(1);
    expect(ids).toContain(candidateId);
  });

  it('finds by a partial name, case-insensitively', async () => {
    const { ids } = await search('zzyx SEARCHTEST');
    expect(ids).toContain(candidateId);
  });

  it('finds by headline', async () => {
    const { ids } = await search(`Zzyxheadline${stamp}`);
    expect(ids).toContain(candidateId);
  });

  it('finds by a skill named in the free-text box', async () => {
    const { ids } = await search(SKILL);
    expect(ids).toContain(candidateId);
  });

  it('finds by email', async () => {
    const { ids } = await search(EMAIL);
    expect(ids).toContain(candidateId);
  });

  it('returns nothing for a term that matches nobody', async () => {
    const { ids, total } = await search(`definitely-no-such-candidate-${stamp}`);
    expect(ids).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('combines the skill filter with a free-text term', async () => {
    const both = await search('Zzyx Searchtest', { skills: [SKILL] });
    expect(both.ids).toContain(candidateId);

    const wrongSkill = await search('Zzyx Searchtest', { skills: [`NotASkill${stamp}`] });
    expect(wrongSkill.ids).not.toContain(candidateId);
  });

  it('respects the availability filter', async () => {
    expect((await search('Zzyx Searchtest', { available: true })).ids).toContain(candidateId);
    expect((await search('Zzyx Searchtest', { available: false })).ids).not.toContain(candidateId);
  });
});

describe('talent pool paging', () => {
  it('reports the whole pool, not the 1,000-row transport cap', async () => {
    const { total } = await search('');
    const { count } = await admin.from('candidates').select('*', { count: 'exact', head: true });
    // The old code path could never see past 1,000 rows; the count must be the
    // real table count however large the pool grows.
    expect(total).toBe(count);
  });

  it('walks pages without repeating or skipping a candidate', async () => {
    const pageSize = 10;
    const first = await search('', { page: 0, pageSize });
    const second = await search('', { page: 1, pageSize });

    expect(first.ids).toHaveLength(pageSize);
    expect(second.ids).toHaveLength(pageSize);
    // Overlap between consecutive pages means the ordering is not total.
    expect(first.ids.filter((id) => second.ids.includes(id))).toEqual([]);

    const flat = await search('', { page: 0, pageSize: pageSize * 2 });
    expect(flat.ids).toEqual([...first.ids, ...second.ids]);
  });

  it('hydrates a page of ids into full rows in the view’s order', async () => {
    const { ids } = await search('', { page: 0, pageSize: 5 });
    const { data } = await staffClient
      .from('candidates')
      .select('id, contact:contacts!candidates_contact_id_fkey ( id, full_name )')
      .in('id', ids);

    const byId = new Map((data ?? []).map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    // `in` returns rows in whatever order it likes; the page must re-impose the
    // view's ordering or the list shuffles on every render.
    expect(ordered.map((r) => (r as { id: string }).id)).toEqual(ids);
  });

});

/**
 * A view runs as its OWNER unless declared `security_invoker`, so RLS on the
 * base tables does not protect it — and Supabase grants default privileges on
 * new objects in `public` to `anon`. Every view added to this schema is a
 * potential open door, and the anon key ships in the browser bundle.
 *
 * This block is deliberately about ALL views, not just the candidate one: the
 * mistake is structural, so the guard has to be too. Add a view, add it here.
 */
describe('views are not readable by anonymous callers', () => {
  const views = ['v_candidate_search', 'v_business_contacts', 'v_invoice_balances'] as const;

  it.each(views)('%s refuses an anonymous read', async (view) => {
    const { data, error } = await anon.from(view).select('*').limit(1);
    expect(data ?? []).toHaveLength(0);
    // A grant-level refusal, not an empty result — an empty result would also
    // occur if the table simply had no rows, which proves nothing.
    expect(error?.message ?? '').toContain('permission denied');
  });

  it.each(views)('%s is still readable by a signed-in user', async (view) => {
    const { error } = await staffClient.from(view).select('*').limit(1);
    expect(error).toBeNull();
  });
});

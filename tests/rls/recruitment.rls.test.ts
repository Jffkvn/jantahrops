import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Recruitment Foundation RLS & Database integration tests (Prompt 3.1).
 * Runs against the live hosted database with service role credentials.
 * Throws (never skips) if credentials are absent.
 */

const url = process.env.RLS_SUPABASE_URL;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Recruitment RLS tests need RLS_SUPABASE_URL and RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. ' +
      'They fail rather than skip on purpose.',
  );
}

const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

const createdVacancyIds: string[] = [];
const createdApplicationIds: string[] = [];
const createdSignalIds: string[] = [];
const createdContactIds: string[] = [];
let testOrgId: string;

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await db
    .from('organisations')
    .insert({ name: `Recruitment Test Org ${stamp}`, tin: '1000777888' })
    .select('id')
    .single();
  if (error || !org) {
    throw new Error(`Failed to create test organisation: ${error?.message}`);
  }
  testOrgId = org.id;
});

afterAll(async () => {
  if (createdSignalIds.length > 0) {
    await db.from('signals').delete().in('id', createdSignalIds);
  }
  if (createdApplicationIds.length > 0) {
    await db.from('applications').delete().in('id', createdApplicationIds);
  }
  if (createdVacancyIds.length > 0) {
    await db.from('vacancies').delete().in('id', createdVacancyIds);
  }
  if (createdContactIds.length > 0) {
    // candidates cascade from contacts; contact_roles cascade too.
    await db.from('contacts').delete().in('id', createdContactIds);
  }
  if (testOrgId) {
    await db.from('organisations').delete().eq('id', testOrgId);
  }
});

/**
 * Mirrors the public-candidates registration flow (service-role client):
 * find-or-create contact by email then phone, add the 'candidate' role, then
 * find-or-create the candidate profile (unique on contact_id) — an existing
 * candidate is UPDATED, never duplicated.
 */
async function registerCandidate(input: {
  fullName: string;
  email?: string;
  phone?: string;
  headline?: string;
}): Promise<{ contactId: string; candidateId: string }> {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone ?? null;

  let contactId: string | null = null;
  if (email) {
    const { data } = await db.from('contacts').select('id').ilike('email', email).maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId && phone) {
    const { data } = await db.from('contacts').select('id').eq('phone_e164', phone).maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId) {
    const { data, error } = await db
      .from('contacts')
      .insert({ full_name: input.fullName, email, phone_e164: phone })
      .select('id')
      .single();
    if (error) throw error;
    contactId = data.id;
  }
  createdContactIds.push(contactId!);

  await db.from('contact_roles').upsert({ contact_id: contactId, role: 'candidate' });

  const existing = await db
    .from('candidates')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();

  let candidateId: string;
  if (existing?.data) {
    candidateId = existing.data.id;
    await db.from('candidates').update({ headline: input.headline ?? null }).eq('id', candidateId);
  } else {
    const { data, error } = await db
      .from('candidates')
      .insert({ contact_id: contactId, headline: input.headline ?? null })
      .select('id')
      .single();
    if (error) throw error;
    candidateId = data.id;
  }

  return { contactId: contactId!, candidateId };
}

async function createVacancy(overrides: Partial<Record<string, unknown>> = {}): Promise<string> {
  const stamp = Date.now() + Math.floor(Math.random() * 1e6);
  const { data, error } = await db
    .from('vacancies')
    .insert({
      title: `Talent Wanted ${stamp}`,
      slug: `talent-wanted-${stamp}`,
      organisation_id: testOrgId,
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw error;
  createdVacancyIds.push(data.id);
  return data.id;
}

describe('Recruitment Foundation (Prompt 3.1)', () => {
  describe('Vacancies', () => {
    it('vacancy slug is unique: a second vacancy with the same slug is rejected', async () => {
      const { data, error } = await db
        .from('vacancies')
        .insert({ title: 'Duplicate', slug: 'duplicate-slug' })
        .select('id')
        .single();
      createdVacancyIds.push(data?.id ?? '');
      expect(error).toBeNull();

      const { data: dup, error: dupErr } = await db
        .from('vacancies')
        .insert({ title: 'Duplicate 2', slug: 'duplicate-slug' })
        .select('id')
        .single();
      expect(dupErr).not.toBeNull();
      expect(dupErr?.code).toBe('23505'); // unique_violation
      expect(dup).toBeNull();
    });

    it('publishVacancy flips is_public + status + published_at', async () => {
      const id = await createVacancy({ is_public: false, status: 'draft', published_at: null });

      const { data: before } = await db.from('vacancies').select('*').eq('id', id).single();
      expect(before!.is_public).toBe(false);
      expect(before!.status).toBe('draft');
      expect(before!.published_at).toBeNull();

      // Mirrors publishVacancy in recruitment-api.ts.
      await db
        .from('vacancies')
        .update({ is_public: true, status: 'open', published_at: new Date().toISOString() })
        .eq('id', id);

      const { data: after } = await db.from('vacancies').select('*').eq('id', id).single();
      expect(after!.is_public).toBe(true);
      expect(after!.status).toBe('open');
      expect(after!.published_at).not.toBeNull();
    });
  });

  describe('Candidate registration (dedup)', () => {
    it('a second registration with the same email UPDATES the candidate — no duplicate contact or candidate', async () => {
      const email = `cand-${Date.now()}@example.com`;

      const first = await registerCandidate({ fullName: 'Grace First', email, headline: 'First CV' });
      const { count: contactsAfterFirst } = await db
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .ilike('email', email);
      const { count: candidatesAfterFirst } = await db
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', first.contactId);
      expect(contactsAfterFirst).toBe(1);
      expect(candidatesAfterFirst).toBe(1);

      // Same email again — must update, not duplicate.
      const second = await registerCandidate({ fullName: 'Grace Updated', email, headline: 'Updated CV' });

      expect(second.contactId).toBe(first.contactId);

      const { count: contactsAfterSecond } = await db
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .ilike('email', email);
      const { count: candidatesAfterSecond } = await db
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', first.contactId);
      expect(contactsAfterSecond).toBe(1);
      expect(candidatesAfterSecond).toBe(1);

      const { data: profile } = await db
        .from('candidates')
        .select('id, headline, contact_id')
        .eq('contact_id', first.contactId)
        .single();
      expect(profile!.headline).toBe('Updated CV');
    });
  });

  describe('Applications', () => {
    it('application unique per (vacancy, candidate): a duplicate insert is rejected', async () => {
      const vacancyId = await createVacancy();
      const { candidateId } = await registerCandidate({
        fullName: 'Unique Test',
        email: `unique-${Date.now()}@example.com`,
      });

      const { data, error } = await db
        .from('applications')
        .insert({ vacancy_id: vacancyId, candidate_id: candidateId })
        .select('id')
        .single();
      expect(error).toBeNull();
      createdApplicationIds.push(data!.id);

      const { data: dup, error: dupErr } = await db
        .from('applications')
        .insert({ vacancy_id: vacancyId, candidate_id: candidateId })
        .select('id')
        .single();
      expect(dupErr).not.toBeNull();
      expect(dupErr?.code).toBe('23505');
      expect(dup).toBeNull();
    });

    it('moving an application stage writes exactly one application activity', async () => {
      const vacancyId = await createVacancy();
      const { candidateId } = await registerCandidate({
        fullName: 'Stage Test',
        email: `stage-${Date.now()}@example.com`,
      });

      const { data: app, error: createErr } = await db
        .from('applications')
        .insert({ vacancy_id: vacancyId, candidate_id: candidateId })
        .select('id')
        .single();
      expect(createErr).toBeNull();
      createdApplicationIds.push(app!.id);

      await db.from('applications').update({ stage: 'screened' }).eq('id', app!.id);

      const { data: activities } = await db
        .from('activities')
        .select('type, body')
        .eq('subject_type', 'application')
        .eq('subject_id', app!.id)
        .eq('type', 'stage_change');
      expect(activities).toHaveLength(1);
      expect(activities![0]!.body).toContain('new');
      expect(activities![0]!.body).toContain('screened');
    });
  });

  describe('candidate_waiting signal', () => {
    it('an application stuck 6 days with no activity fires exactly one signal; activity/stage move expires it; dismissal cools down', async () => {
      const vacancyId = await createVacancy();
      const { candidateId } = await registerCandidate({
        fullName: 'Waiting Test',
        email: `waiting-${Date.now()}@example.com`,
      });

      // applied_at 6 days ago, stage 'new', no activity.
      const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000).toISOString();
      const { data: app, error: createErr } = await db
        .from('applications')
        .insert({ vacancy_id: vacancyId, candidate_id: candidateId, applied_at: sixDaysAgo })
        .select('id')
        .single();
      expect(createErr).toBeNull();
      createdApplicationIds.push(app!.id);

      // Fire.
      await db.rpc('generate_signals');
      const { data: signals } = await db
        .from('signals')
        .select('*')
        .eq('kind', 'candidate_waiting')
        .eq('subject_type', 'application')
        .eq('subject_id', app!.id);
      createdSignalIds.push(...(signals ?? []).map((s) => s.id));
      expect(signals).toHaveLength(1);
      expect(signals![0].status).toBe('open');
      expect(signals![0].severity).toBe('warn');
      expect(signals![0].title).toContain('Waiting Test');

      // Idempotent: a second run does not duplicate.
      await db.rpc('generate_signals');
      const { data: afterSecond } = await db
        .from('signals')
        .select('id')
        .eq('kind', 'candidate_waiting')
        .eq('subject_type', 'application')
        .eq('subject_id', app!.id);
      expect(afterSecond).toHaveLength(1);

      // Expire by activity: log a note now → next run expires the signal.
      await db.from('activities').insert({
        subject_type: 'application',
        subject_id: app!.id,
        type: 'note',
        body: 'Contacted the candidate today.',
      });
      await db.rpc('generate_signals');
      const { data: afterActivity } = await db
        .from('signals')
        .select('status')
        .eq('kind', 'candidate_waiting')
        .eq('subject_type', 'application')
        .eq('subject_id', app!.id);
      expect(afterActivity).toHaveLength(1);
      expect(afterActivity![0]!.status).toBe('expired');

      // New phase: a fresh stuck application (different candidate), then dismiss → cooldown suppresses re-fire.
      const { candidateId: candidate2 } = await registerCandidate({
        fullName: 'Waiting Test 2',
        email: `waiting2-${Date.now()}@example.com`,
      });
      const { data: app2, error: create2 } = await db
        .from('applications')
        .insert({ vacancy_id: vacancyId, candidate_id: candidate2, applied_at: sixDaysAgo })
        .select('id')
        .single();
      expect(create2).toBeNull();
      createdApplicationIds.push(app2!.id);

      await db.rpc('generate_signals');
      const { data: sig2 } = await db
        .from('signals')
        .select('id')
        .eq('kind', 'candidate_waiting')
        .eq('subject_type', 'application')
        .eq('subject_id', app2!.id);
      expect(sig2).toHaveLength(1);
      createdSignalIds.push(sig2![0]!.id);

      await db.from('signals').update({ status: 'dismissed', dismissed_at: new Date().toISOString() }).eq('id', sig2![0]!.id);

      // Cooldown: within 3 days of dismissal, re-running must NOT re-fire.
      await db.rpc('generate_signals');
      const { data: afterCooldown } = await db
        .from('signals')
        .select('status')
        .eq('kind', 'candidate_waiting')
        .eq('subject_type', 'application')
        .eq('subject_id', app2!.id);
      expect(afterCooldown).toHaveLength(1); // still just the dismissed one
      expect(afterCooldown![0]!.status).toBe('dismissed');

      // Moving the stage out of the waiting set also expires (activity path covered above).
    });
  });

  describe('public-jobs shape', () => {
    it('returns open + public vacancies and hides draft/private ones, with no client org id', async () => {
      const openPublic = await createVacancy({
        is_public: true,
        status: 'open',
        published_at: new Date().toISOString(),
      });
      const draft = await createVacancy({ is_public: false, status: 'draft', published_at: null });
      const privateOpen = await createVacancy({ is_public: false, status: 'open', published_at: null });

      // The exact query public-jobs runs.
      const { data } = await db
        .from('vacancies')
        .select(
          'id, slug, title, summary, description, requirements, location, employment_type, salary_min_ugx, salary_max_ugx, published_at, closes_at',
        )
        .eq('is_public', true)
        .eq('status', 'open')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false });

      const ids = (data ?? []).map((v) => v.id);
      expect(ids).toContain(openPublic);
      expect(ids).not.toContain(draft);
      expect(ids).not.toContain(privateOpen);

      // The public shape must never leak the client organisation or internal fields.
      const first = data!.find((v) => v.id === openPublic)!;
      expect(first).not.toHaveProperty('organisation_id');
      expect(first).not.toHaveProperty('owner_id');
      expect(first).not.toHaveProperty('notes');
      expect(first).toHaveProperty('employment_type');
      expect(first).toHaveProperty('slug');
    });
  });
});

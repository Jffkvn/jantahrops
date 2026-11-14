import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * AI Candidate Matching, Talent Pool Discovery & Override RLS / DB tests (Prompt 3.3).
 * Runs against the live hosted database (`npm run test:rls`).
 * Throws (never skips) if credentials are absent.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'AI matching RLS tests need RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY and ' +
      'RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. They fail rather than skip.',
  );
}

const stamp = Date.now();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const staff = {
  email: `rls-aimatch-${stamp}@example.test`,
  password: 'Test-Password-123!',
  id: '',
};
let staffClient: SupabaseClient;

let testOrgId = '';
let vacancyId = '';
const createdContactIds: string[] = [];
const createdCandidateIds: string[] = [];
const createdApplicationIds: string[] = [];

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

  const { data: org, error: orgError } = await admin
    .from('organisations')
    .insert({ name: `AI Match Test Org ${stamp}`, tin: '1000999111' })
    .select('id')
    .single();
  if (orgError || !org) throw new Error(`Failed to create test org: ${orgError?.message}`);
  testOrgId = org.id;

  const { data: vac, error: vacError } = await staffClient
    .from('vacancies')
    .insert({
      title: `Senior EFRIS Payroll Specialist ${stamp}`,
      slug: `senior-efris-payroll-${stamp}`,
      organisation_id: testOrgId,
      summary: 'Lead monthly Uganda payroll and URA statutory filings.',
      requirements: [`EFRIS${stamp}`, `PAYE${stamp}`, 'NSSF compliance'],
      recruiter_context: `SACCO or telecom reconciliation background is welcome (${stamp}).`,
      status: 'open',
      is_public: false,
    })
    .select('id')
    .single();
  if (vacError || !vac) throw new Error(`Failed to create test vacancy: ${vacError?.message}`);
  vacancyId = vac.id;
});

afterAll(async () => {
  if (createdApplicationIds.length > 0) {
    await admin.from('applications').delete().in('id', createdApplicationIds);
  }
  if (createdCandidateIds.length > 0) {
    await admin.from('candidates').delete().in('id', createdCandidateIds);
  }
  if (createdContactIds.length > 0) {
    await admin.from('contacts').delete().in('id', createdContactIds);
  }
  if (vacancyId) {
    await admin.from('vacancies').delete().eq('id', vacancyId);
  }
  if (testOrgId) {
    await admin.from('vacancies').delete().eq('organisation_id', testOrgId);
    await admin.from('organisations').delete().eq('id', testOrgId);
  }
  if (staff.id) {
    await admin.auth.admin.deleteUser(staff.id);
  }
});

async function createPoolCandidate(opts: {
  name: string;
  headline: string;
  skills: string[];
  isAvailable?: boolean;
  yearsExperience?: number;
  cvParsed?: Record<string, unknown>;
}) {
  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      full_name: opts.name,
      email: `pool-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
    })
    .select('id')
    .single();
  if (cErr || !contact) throw cErr;
  createdContactIds.push(contact.id);

  const { data: cand, error: candErr } = await admin
    .from('candidates')
    .insert({
      contact_id: contact.id,
      headline: opts.headline,
      skills: opts.skills,
      is_available: opts.isAvailable ?? true,
      years_experience: opts.yearsExperience ?? 5,
      cv_parsed: opts.cvParsed ?? {},
    })
    .select('id')
    .single();
  if (candErr || !cand) throw candErr;
  createdCandidateIds.push(cand.id);
  return { contactId: contact.id, candidateId: cand.id };
}

describe('Prompt 3.3 — AI Candidate Matching & Talent Pool Discovery', () => {
  it('stores and reads vacancies.recruiter_context for staff while keeping it out of public-jobs shape', async () => {
    const { data, error } = await staffClient
      .from('vacancies')
      .select('id, recruiter_context')
      .eq('id', vacancyId)
      .single();
    expect(error).toBeNull();
    expect(data?.recruiter_context).toContain('SACCO or telecom reconciliation');
  });

  it('enforces applications.match_score 0..100 check constraint and stores match_tier + ai_assessment', async () => {
    const { candidateId } = await createPoolCandidate({
      name: `Applicant Score Test ${stamp}`,
      headline: 'Payroll Accountant',
      skills: [`EFRIS${stamp}`, `PAYE${stamp}`],
    });

    const { data: app, error: appErr } = await staffClient
      .from('applications')
      .insert({
        vacancy_id: vacancyId,
        candidate_id: candidateId,
        match_tier: 'adjacent',
        match_score: 78,
        ai_assessment: {
          version: 1,
          model: 'gpt-4o-mini',
          tier: 'adjacent',
          score: 78,
          summary: 'Strong telecom billing background transferable to payroll.',
          pillars: {
            core_skills: 24,
            transferable_and_industry: 26,
            experience_and_trajectory: 16,
            practical_and_cover_note: 12,
          },
          strengths: ['Led high-volume reconciliations'],
          transferable_skills: ['Telecom billing audit -> payroll control'],
          gaps_or_risks: ['Needs direct EFRIS portal onboarding'],
          interview_questions: [
            {
              id: 'q1',
              question: 'Walk us through how you reconciled monthly tax schedules.',
              why_ask: 'Verify transferable tax compliance depth',
              source: 'ai',
            },
          ],
        },
        ai_evaluated_at: new Date().toISOString(),
      })
      .select('id, match_tier, match_score, ai_assessment')
      .single();

    expect(appErr).toBeNull();
    createdApplicationIds.push(app!.id);
    expect(app!.match_tier).toBe('adjacent');
    expect(app!.match_score).toBe(78);

    // Out-of-range scores (-1 and 101) must be rejected by applications_match_score_range_chk.
    const { error: lowErr } = await staffClient
      .from('applications')
      .update({ match_score: -1 })
      .eq('id', app!.id);
    expect(lowErr).not.toBeNull();
    expect(lowErr?.code).toBe('23514'); // check_violation

    const { error: highErr } = await staffClient
      .from('applications')
      .update({ match_score: 101 })
      .eq('id', app!.id);
    expect(highErr).not.toBeNull();
    expect(highErr?.code).toBe('23514');
  });

  it('indexes cv_parsed summary and industries_text in v_candidate_search', async () => {
    const uniqueToken = `kaweesi-sacco-audit-${stamp}`;
    const { candidateId } = await createPoolCandidate({
      name: `Parsed CV Search ${stamp}`,
      headline: 'Finance Associate',
      skills: ['Excel'],
      cvParsed: {
        version: 1,
        summary: `Managed ${uniqueToken} reconciliations across 12 branches.`,
        industries_text: 'Microfinance SACCO',
      },
    });

    const { data, error } = await staffClient
      .from('v_candidate_search')
      .select('id')
      .ilike('search_text', `%${uniqueToken}%`);
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.id)).toContain(candidateId);
  });

  it('match_talent_pool_for_vacancy surfaces available matching pool candidates, excludes existing applicants, and refuses anon', async () => {
    // 1. Available pool candidate with matching skills (has NOT applied).
    const { candidateId: matchingPoolId } = await createPoolCandidate({
      name: `Pool Match Star ${stamp}`,
      headline: `Senior EFRIS Payroll Specialist ${stamp}`,
      skills: [`EFRIS${stamp}`, `PAYE${stamp}`, 'NSSF compliance'],
      yearsExperience: 6,
      cvParsed: {
        version: 1,
        summary: `SACCO reconciliation specialist (${stamp})`,
        industries_text: 'SACCO Telecom',
      },
    });

    // 2. Unavailable candidate with matching skills (should be excluded).
    const { candidateId: unavailableId } = await createPoolCandidate({
      name: `Pool Unavailable ${stamp}`,
      headline: `Senior EFRIS Payroll Specialist ${stamp}`,
      skills: [`EFRIS${stamp}`, `PAYE${stamp}`],
      isAvailable: false,
    });

    const { data: matches, error: matchErr } = await staffClient.rpc(
      'match_talent_pool_for_vacancy',
      {
        p_vacancy_id: vacancyId,
        p_limit: 25,
      },
    );
    expect(matchErr).toBeNull();
    const matchedIds = (matches ?? []).map((m: { candidate_id: string }) => m.candidate_id);
    expect(matchedIds).toContain(matchingPoolId);
    expect(matchedIds).not.toContain(unavailableId);

    const starMatch = (matches ?? []).find(
      (m: { candidate_id: string }) => m.candidate_id === matchingPoolId,
    );
    expect(starMatch).toBeDefined();
    expect(starMatch.relevance_score).toBeGreaterThanOrEqual(40);
    expect(starMatch.matched_skills).toEqual(
      expect.arrayContaining([`EFRIS${stamp}`, `PAYE${stamp}`]),
    );

    // Anonymous callers must be refused at the privilege level.
    const { error: anonErr } = await anon.rpc('match_talent_pool_for_vacancy', {
      p_vacancy_id: vacancyId,
      p_limit: 5,
    });
    expect(anonErr).not.toBeNull();
    expect(anonErr?.message ?? '').toContain('permission denied');
  });

  it('erase_contact removes the candidate, applications, cv_parsed, and ai_assessment (DPPA 2019)', async () => {
    const { contactId, candidateId } = await createPoolCandidate({
      name: `Erase AI Test ${stamp}`,
      headline: 'HR Officer',
      skills: [`EFRIS${stamp}`],
      cvParsed: { version: 1, summary: 'Sensitive CV data to be erased' },
    });

    const { data: app, error: appErr } = await staffClient
      .from('applications')
      .insert({
        vacancy_id: vacancyId,
        candidate_id: candidateId,
        match_tier: 'strong',
        match_score: 90,
        ai_assessment: { version: 1, summary: 'Sensitive assessment to be erased' },
      })
      .select('id')
      .single();
    expect(appErr).toBeNull();

    // Non-admin staff member cannot erase a person's data.
    const { error: nonAdminErr } = await staffClient.rpc('erase_contact', {
      p_contact_id: contactId,
    });
    expect(nonAdminErr?.message ?? '').toContain('Only an admin');

    // Promote staff user to admin and erase.
    await admin.from('profiles').update({ role: 'admin' }).eq('id', staff.id);
    const { error: eraseErr } = await staffClient.rpc('erase_contact', {
      p_contact_id: contactId,
    });
    expect(eraseErr).toBeNull();

    const { data: candAfter } = await admin
      .from('candidates')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle();
    expect(candAfter).toBeNull();

    const { data: appAfter } = await admin
      .from('applications')
      .select('id')
      .eq('id', app!.id)
      .maybeSingle();
    expect(appAfter).toBeNull();
  });
});

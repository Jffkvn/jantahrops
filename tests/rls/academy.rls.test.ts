import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Academy against the live database — run with `npm run test:rls`.
 *
 * The entitlement chain is why this file exists. "Has this person paid, and may
 * they therefore have the course?" is answered by a trigger watching invoice
 * settlement, three tables away from where anyone would look. It is also the
 * single thing neither classroomio nor frappe/lms models the way JantaHR bills
 * (see ACADEMY_BUILD_VS_FORK.md), so there is no upstream to inherit
 * correctness from.
 */

const url = process.env.RLS_SUPABASE_URL;
const anonKey = process.env.RLS_SUPABASE_ANON_KEY;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'Academy tests need RLS_SUPABASE_URL, RLS_SUPABASE_ANON_KEY and ' +
      'RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. They fail rather than skip.',
  );
}

const stamp = Date.now();
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const staff = { email: `rls-acad-${stamp}@example.test`, password: 'Test-Password-123!', id: '' };
let staffClient: SupabaseClient;

let orgId = '';
let courseId = '';
let cohortId = '';
let contactId = '';

const PRICE = 800_000;
const TOTAL = 944_000; // 800,000 + 18% VAT

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

  const { data: org } = await admin
    .from('organisations')
    .insert({ name: `ZZ Academy Org ${stamp}` })
    .select('id')
    .single();
  orgId = org!.id;

  const { data: contact } = await admin
    .from('contacts')
    .insert({ full_name: `ZZ Student ${stamp}`, email: `zz-acad-${stamp}@example.test` })
    .select('id')
    .single();
  contactId = contact!.id;

  const { data: course, error: courseError } = await admin
    .from('courses')
    .insert({
      title: `ZZ Course ${stamp}`,
      slug: `zz-course-${stamp}`,
      price_ugx: PRICE,
      retake_interval_months: 12,
    })
    .select('id')
    .single();
  if (courseError) throw courseError;
  courseId = course.id;

  const { data: cohort } = await admin
    .from('cohorts')
    .insert({ course_id: courseId, name: 'ZZ Cohort 1', capacity: 10, status: 'open' })
    .select('id')
    .single();
  cohortId = cohort!.id;
});

afterAll(async () => {
  // documents before organisations — a settled invoice generates a receipt that
  // nothing here created, and one surviving document blocks the org delete.
  if (orgId) await admin.from('documents').delete().eq('organisation_id', orgId);
  if (courseId) await admin.from('cohorts').delete().eq('course_id', courseId);
  if (courseId) await admin.from('courses').delete().eq('id', courseId);
  if (contactId) await admin.from('contacts').delete().eq('id', contactId);
  if (orgId) {
    const { error } = await admin.from('organisations').delete().eq('id', orgId);
    if (error) throw new Error(`academy cleanup left an organisation behind: ${error.message}`);
  }
  if (staff.id) await admin.auth.admin.deleteUser(staff.id);
});

/** Fresh enrolment for a test that mutates state, cleaned by the caller. */
async function makeEnrolment(): Promise<string> {
  const { data, error } = await admin
    .from('enrolments')
    .insert({ cohort_id: cohortId, contact_id: contactId, organisation_id: orgId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function enrolmentState(id: string) {
  const { data, error } = await admin
    .from('enrolments')
    .select('status, entitled_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

describe('academy: schema guarantees', () => {
  it('refuses two enrolments for the same person on the same cohort', async () => {
    const id = await makeEnrolment();
    const { error } = await admin
      .from('enrolments')
      .insert({ cohort_id: cohortId, contact_id: contactId });
    // Without this, a double booking becomes a double invoice.
    expect(error).not.toBeNull();
    await admin.from('enrolments').delete().eq('id', id);
  });

  it('gives the person the student role on the shared contacts spine', async () => {
    const id = await makeEnrolment();
    const { data } = await admin
      .from('contact_roles')
      .select('role')
      .eq('contact_id', contactId)
      .eq('role', 'student');
    // The whole reason we did not fork an LMS: one person, many roles.
    expect(data ?? []).toHaveLength(1);
    await admin.from('enrolments').delete().eq('id', id);
  });

  it('refuses a course slug that is already taken', async () => {
    const { error } = await admin
      .from('courses')
      .insert({ title: 'ZZ Duplicate', slug: `zz-course-${stamp}` });
    expect(error).not.toBeNull();
  });

  it('refuses a cohort that ends before it starts', async () => {
    const { error } = await admin.from('cohorts').insert({
      course_id: courseId,
      name: 'ZZ Backwards',
      start_date: '2026-10-01',
      end_date: '2026-09-01',
    });
    expect(error).not.toBeNull();
  });

  it('refuses to delete a course that has been run', async () => {
    // `on delete restrict` — losing a course would orphan every enrolment and
    // attendance record attached to the cohorts under it.
    const { error } = await admin.from('courses').delete().eq('id', courseId);
    expect(error).not.toBeNull();
  });

  it('records attendance once per person per session, correcting on re-mark', async () => {
    const enrolmentId = await makeEnrolment();
    const { data: session } = await admin
      .from('cohort_sessions')
      .insert({ cohort_id: cohortId, title: 'ZZ Day 1' })
      .select('id')
      .single();

    await admin
      .from('attendance')
      .upsert(
        { session_id: session!.id, enrolment_id: enrolmentId, is_present: true },
        { onConflict: 'session_id,enrolment_id' },
      );
    await admin
      .from('attendance')
      .upsert(
        { session_id: session!.id, enrolment_id: enrolmentId, is_present: false },
        { onConflict: 'session_id,enrolment_id' },
      );

    const { data: marks } = await admin
      .from('attendance')
      .select('is_present')
      .eq('session_id', session!.id);
    // A correction, not a second record.
    expect(marks).toHaveLength(1);
    expect(marks?.[0]?.is_present).toBe(false);

    await admin.from('cohort_sessions').delete().eq('id', session!.id);
    await admin.from('enrolments').delete().eq('id', enrolmentId);
  });

  it('cascades sessions and attendance when a cohort is deleted', async () => {
    const { data: cohort } = await admin
      .from('cohorts')
      .insert({ course_id: courseId, name: 'ZZ Doomed' })
      .select('id')
      .single();
    const { data: enrolment } = await admin
      .from('enrolments')
      .insert({ cohort_id: cohort!.id, contact_id: contactId })
      .select('id')
      .single();
    const { data: session } = await admin
      .from('cohort_sessions')
      .insert({ cohort_id: cohort!.id, title: 'ZZ Gone' })
      .select('id')
      .single();
    await admin
      .from('attendance')
      .insert({ session_id: session!.id, enrolment_id: enrolment!.id, is_present: true });

    await admin.from('cohorts').delete().eq('id', cohort!.id);

    for (const [table, column] of [
      ['enrolments', 'cohort_id'],
      ['cohort_sessions', 'cohort_id'],
    ] as const) {
      const { count } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, cohort!.id);
      expect(count, `${table} should have cascaded`).toBe(0);
    }
    const { count: marks } = await admin
      .from('attendance')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session!.id);
    expect(marks).toBe(0);
  });
});

describe('academy: entitlement is earned by a settled invoice', () => {
  it('starts registered, with no entitlement', async () => {
    const id = await makeEnrolment();
    const state = await enrolmentState(id);
    expect(state.status).toBe('registered');
    expect(state.entitled_at).toBeNull();
    await admin.from('enrolments').delete().eq('id', id);
  });

  it('moves to invoiced when an invoice is raised against it', async () => {
    const id = await makeEnrolment();
    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'enrolment',
        related_id: id,
        status: 'draft',
        subtotal_ugx: PRICE,
        total_ugx: TOTAL,
      })
      .select('id')
      .single();

    const state = await enrolmentState(id);
    expect(state.status).toBe('invoiced');
    expect(state.entitled_at).toBeNull();

    await admin.from('documents').delete().eq('id', doc!.id);
    await admin.from('enrolments').delete().eq('id', id);
  });

  it('entitles on settlement under Ugandan WHT — received + withheld', async () => {
    const id = await makeEnrolment();
    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'enrolment',
        related_id: id,
        status: 'issued',
        subtotal_ugx: PRICE,
        total_ugx: TOTAL,
      })
      .select('id')
      .single();

    // A part payment must NOT entitle: the course is not paid for yet.
    const { data: part } = await admin
      .from('payments')
      .insert({
        document_id: doc!.id,
        amount_received_ugx: 400_000,
        wht_withheld_ugx: 0,
        method: 'bank_transfer',
      })
      .select('id')
      .single();
    let state = await enrolmentState(id);
    expect(state.entitled_at, 'a part payment must not grant access').toBeNull();
    expect(state.status).toBe('invoiced');

    // Settle the rest the Ugandan way: the client pays 94% to us and 6% to URA,
    // and the invoice is settled by the sum.
    await admin.from('payments').insert({
      document_id: doc!.id,
      amount_received_ugx: 487_360,
      wht_withheld_ugx: 56_640,
      method: 'bank_transfer',
    });

    const { data: settled } = await admin
      .from('documents')
      .select('status')
      .eq('id', doc!.id)
      .single();
    expect(settled?.status).toBe('paid');

    state = await enrolmentState(id);
    expect(state.status).toBe('paid');
    expect(state.entitled_at).not.toBeNull();

    await admin.from('documents').delete().eq('organisation_id', orgId);
    await admin.from('enrolments').delete().eq('id', id);
    void part;
  });

  it('revokes entitlement when the payment is reversed', async () => {
    const id = await makeEnrolment();
    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'enrolment',
        related_id: id,
        status: 'issued',
        subtotal_ugx: PRICE,
        total_ugx: TOTAL,
      })
      .select('id')
      .single();
    const { data: payment } = await admin
      .from('payments')
      .insert({
        document_id: doc!.id,
        amount_received_ugx: 887_360,
        wht_withheld_ugx: 56_640,
        method: 'bank_transfer',
      })
      .select('id')
      .single();

    expect((await enrolmentState(id)).entitled_at).not.toBeNull();

    await admin.from('payments').delete().eq('id', payment!.id);

    const state = await enrolmentState(id);
    // Leaving someone entitled after their payment was undone would mean the
    // one state the Academy is built around no longer tracks the money.
    expect(state.entitled_at).toBeNull();
    expect(state.status).toBe('invoiced');

    await admin.from('documents').delete().eq('organisation_id', orgId);
    await admin.from('enrolments').delete().eq('id', id);
  });

  it('does not disturb a completed enrolment when a payment is reversed', async () => {
    const id = await makeEnrolment();
    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'enrolment',
        related_id: id,
        status: 'issued',
        subtotal_ugx: PRICE,
        total_ugx: TOTAL,
      })
      .select('id')
      .single();
    const { data: payment } = await admin
      .from('payments')
      .insert({
        document_id: doc!.id,
        amount_received_ugx: 887_360,
        wht_withheld_ugx: 56_640,
        method: 'bank_transfer',
      })
      .select('id')
      .single();

    await admin.from('enrolments').update({ status: 'completed' }).eq('id', id);
    await admin.from('payments').delete().eq('id', payment!.id);

    // Someone who finished the course did finish it, whatever later happens to
    // the invoice. History is not rewritten by a refund.
    expect((await enrolmentState(id)).status).toBe('completed');

    await admin.from('documents').delete().eq('organisation_id', orgId);
    await admin.from('enrolments').delete().eq('id', id);
  });

  it('ignores invoices that belong to something other than an enrolment', async () => {
    const id = await makeEnrolment();
    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'project',
        related_id: id, // same uuid, different related_type
        status: 'issued',
        subtotal_ugx: PRICE,
        total_ugx: TOTAL,
      })
      .select('id')
      .single();
    await admin.from('payments').insert({
      document_id: doc!.id,
      amount_received_ugx: TOTAL,
      wht_withheld_ugx: 0,
      method: 'cash',
    });

    // related_type must be checked, not just related_id — otherwise a project
    // invoice would hand out free training.
    expect((await enrolmentState(id)).entitled_at).toBeNull();

    await admin.from('documents').delete().eq('organisation_id', orgId);
    await admin.from('enrolments').delete().eq('id', id);
  });
});

describe('academy: roster counts', () => {
  it('counts enrolled, entitled, unbilled and seats left', async () => {
    const id = await makeEnrolment();

    let { data: summary } = await admin
      .from('v_cohort_summary')
      .select('*')
      .eq('cohort_id', cohortId)
      .single();
    expect(summary?.enrolled).toBe(1);
    expect(summary?.entitled).toBe(0);
    expect(summary?.unbilled).toBe(1);
    expect(summary?.seats_left).toBe(9); // capacity 10

    const { data: doc } = await admin
      .from('documents')
      .insert({
        type: 'invoice',
        organisation_id: orgId,
        related_type: 'enrolment',
        related_id: id,
        status: 'issued',
        subtotal_ugx: PRICE,
        total_ugx: TOTAL,
      })
      .select('id')
      .single();
    await admin.from('payments').insert({
      document_id: doc!.id,
      amount_received_ugx: TOTAL,
      wht_withheld_ugx: 0,
      method: 'cash',
    });

    ({ data: summary } = await admin
      .from('v_cohort_summary')
      .select('*')
      .eq('cohort_id', cohortId)
      .single());
    expect(summary?.entitled).toBe(1);
    expect(summary?.unbilled).toBe(0);

    await admin.from('documents').delete().eq('organisation_id', orgId);
    await admin.from('enrolments').delete().eq('id', id);
  });

  it('reports uncapped cohorts as null seats rather than zero', async () => {
    const { data: cohort } = await admin
      .from('cohorts')
      .insert({ course_id: courseId, name: 'ZZ Uncapped' })
      .select('id')
      .single();
    const { data: summary } = await admin
      .from('v_cohort_summary')
      .select('seats_left')
      .eq('cohort_id', cohort!.id)
      .single();
    // Zero would render as "full" on a cohort that has no limit at all.
    expect(summary?.seats_left).toBeNull();
    await admin.from('cohorts').delete().eq('id', cohort!.id);
  });
});

describe('academy: access control', () => {
  it('is invisible to anonymous callers, view included', async () => {
    for (const table of ['courses', 'cohorts', 'enrolments', 'cohort_sessions', 'attendance'] as const) {
      const { data } = await anon.from(table).select('id').limit(1);
      expect(data ?? [], `${table} leaked to anon`).toHaveLength(0);
    }
    const { data, error } = await anon.from('v_cohort_summary').select('cohort_id').limit(1);
    expect(data ?? []).toHaveLength(0);
    expect(error?.message ?? '').toContain('permission denied');
  });

  it('lets signed-in staff read and write the academy', async () => {
    const { data, error } = await staffClient.from('courses').select('id').eq('id', courseId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);

    const { error: writeError } = await staffClient
      .from('cohorts')
      .update({ notes: 'staff can write' })
      .eq('id', cohortId);
    expect(writeError).toBeNull();
  });

  it('refuses a course delete from a non-admin', async () => {
    const { data: course } = await admin
      .from('courses')
      .insert({ title: `ZZ Deletable ${stamp}`, slug: `zz-deletable-${stamp}` })
      .select('id')
      .single();

    await staffClient.from('courses').delete().eq('id', course!.id);
    const { count } = await admin
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('id', course!.id);
    expect(count).toBe(1);

    await admin.from('courses').delete().eq('id', course!.id);
  });

  it('is_staff() is true for a signed-in colleague', async () => {
    // Equivalent to `true` today, but it is the boundary the student portal
    // will need, so it must actually work before policies rely on it.
    const { data, error } = await staffClient.rpc('is_staff');
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});

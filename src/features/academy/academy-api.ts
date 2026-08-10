import { getSupabase } from '@/lib/supabase';
import type {
  CourseRow,
  CohortRow,
  CohortSessionRow,
  CohortSummaryViewRow,
  EnrolmentRow,
  EnrolmentStatus,
  CohortStatus,
  DeliveryMode,
} from '@/types/database';

/**
 * Academy — courses, the cohorts they run as, and who is on them.
 *
 * The one thing that makes this more than a spreadsheet: an enrolment is keyed
 * to a CONTACT, and entitlement is a state driven by a real settled invoice.
 * Neither of the open-source LMSes we evaluated models either (see
 * ACADEMY_BUILD_VS_FORK.md), and both are why we did not fork one.
 */

// --- courses ----------------------------------------------------------------

export interface CourseWithStats extends CourseRow {
  cohortCount: number;
  upcomingCohort: { id: string; name: string; start_date: string | null } | null;
}

export async function listCourses(search = ''): Promise<CourseWithStats[]> {
  const supabase = getSupabase();
  let query = supabase.from('courses').select('*');
  const term = search.trim();
  if (term) query = query.ilike('title', `%${term}%`);

  const { data, error } = await query.order('title').limit(200);
  if (error) throw error;
  const courses = data ?? [];
  if (courses.length === 0) return [];

  // Cohort rollups in one grouped round trip rather than one per course.
  const { data: cohorts, error: cohortError } = await supabase
    .from('cohorts')
    .select('id, course_id, name, start_date, status')
    .in(
      'course_id',
      courses.map((c) => c.id),
    );
  if (cohortError) throw cohortError;

  const today = new Date().toISOString().slice(0, 10);
  const byCourse = new Map<string, { count: number; upcoming: CourseWithStats['upcomingCohort'] }>();
  for (const c of cohorts ?? []) {
    const entry = byCourse.get(c.course_id) ?? { count: 0, upcoming: null };
    entry.count += 1;
    // "Upcoming" means the soonest cohort not yet finished — the one you would
    // put a new enquiry into.
    const live = c.status !== 'completed' && c.status !== 'cancelled';
    const notPast = c.start_date === null || c.start_date >= today;
    if (live && notPast) {
      const better =
        entry.upcoming === null ||
        entry.upcoming.start_date === null ||
        (c.start_date !== null && c.start_date < entry.upcoming.start_date);
      if (better) entry.upcoming = { id: c.id, name: c.name, start_date: c.start_date };
    }
    byCourse.set(c.course_id, entry);
  }

  return courses.map((c) => {
    const stats = byCourse.get(c.id);
    return { ...c, cohortCount: stats?.count ?? 0, upcomingCohort: stats?.upcoming ?? null };
  });
}

export async function getCourse(id: string): Promise<CourseRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('courses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpsertCourseInput {
  title: string;
  slug?: string;
  summary?: string | null;
  description?: string | null;
  price_ugx?: number;
  corporate_price_ugx?: number | null;
  duration_label?: string | null;
  retake_interval_months?: number | null;
  is_public?: boolean;
}

/** URL-safe slug; the column is unique so a clash surfaces as 23505. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export async function createCourse(input: UpsertCourseInput): Promise<CourseRow> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('courses')
    .insert({
      ...input,
      title: input.title.trim(),
      slug: input.slug?.trim() || slugify(input.title),
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCourse(id: string, patch: Partial<UpsertCourseInput>): Promise<void> {
  const supabase = getSupabase();
  const clean = { ...patch };
  if (typeof clean.title === 'string') clean.title = clean.title.trim();
  const { error } = await supabase.from('courses').update(clean).eq('id', id);
  if (error) throw error;
}

// --- cohorts ----------------------------------------------------------------

export interface CohortWithRelations extends CohortRow {
  course: { id: string; title: string; price_ugx: number } | null;
  facilitator: { id: string; full_name: string } | null;
  summary: CohortSummaryViewRow | null;
}

const COHORT_SELECT = `
  *,
  course:courses!cohorts_course_id_fkey ( id, title, price_ugx ),
  facilitator:profiles!cohorts_facilitator_id_fkey ( id, full_name )
`;

export interface ListCohortsParams {
  /** 'live' = everything except completed and cancelled. */
  scope?: 'live' | 'all' | CohortStatus;
  courseId?: string;
}

export async function listCohorts(params: ListCohortsParams = {}): Promise<CohortWithRelations[]> {
  const supabase = getSupabase();
  const { scope = 'live', courseId } = params;

  let query = supabase.from('cohorts').select(COHORT_SELECT);
  if (scope === 'live') query = query.not('status', 'in', '("completed","cancelled")');
  else if (scope !== 'all') query = query.eq('status', scope);
  if (courseId) query = query.eq('course_id', courseId);

  const { data, error } = await query
    .order('start_date', { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw error;

  const cohorts = (data ?? []) as unknown as CohortWithRelations[];
  if (cohorts.length === 0) return [];

  const { data: summaries, error: summaryError } = await supabase
    .from('v_cohort_summary')
    .select('*')
    .in(
      'cohort_id',
      cohorts.map((c) => c.id),
    );
  if (summaryError) throw summaryError;
  const byId = new Map((summaries ?? []).map((s) => [s.cohort_id, s]));

  return cohorts.map((c) => ({ ...c, summary: byId.get(c.id) ?? null }));
}

export async function getCohort(id: string): Promise<CohortWithRelations | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cohorts')
    .select(COHORT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: summary } = await supabase
    .from('v_cohort_summary')
    .select('*')
    .eq('cohort_id', id)
    .maybeSingle();
  return { ...(data as unknown as CohortWithRelations), summary: summary ?? null };
}

export interface UpsertCohortInput {
  course_id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  delivery_mode?: DeliveryMode;
  capacity?: number | null;
  location?: string | null;
  meeting_url?: string | null;
  facilitator_id?: string | null;
  status?: CohortStatus;
  notes?: string | null;
}

export async function createCohort(input: UpsertCohortInput): Promise<CohortRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cohorts')
    .insert({ ...input, name: input.name.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCohort(id: string, patch: Partial<UpsertCohortInput>): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('cohorts').update(patch).eq('id', id);
  if (error) throw error;
}

// --- enrolments -------------------------------------------------------------

export interface EnrolmentWithContact extends EnrolmentRow {
  contact: { id: string; full_name: string; email: string | null; phone_e164: string | null } | null;
  organisation: { id: string; name: string } | null;
}

const ENROLMENT_SELECT = `
  *,
  contact:contacts!enrolments_contact_id_fkey ( id, full_name, email, phone_e164 ),
  organisation:organisations!enrolments_organisation_id_fkey ( id, name )
`;

export async function listEnrolments(cohortId: string): Promise<EnrolmentWithContact[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('enrolments')
    .select(ENROLMENT_SELECT)
    .eq('cohort_id', cohortId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as EnrolmentWithContact[];
}

export async function enrol(input: {
  cohort_id: string;
  contact_id: string;
  organisation_id?: string | null;
  source?: string | null;
}): Promise<EnrolmentRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('enrolments').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

/**
 * Manual status moves only. `paid` and the clearing of `entitled_at` are owned
 * by the database trigger that watches invoice settlement — setting them by
 * hand here would let the roster disagree with the money.
 */
export async function setEnrolmentStatus(
  id: string,
  status: Exclude<EnrolmentStatus, 'paid'>,
): Promise<void> {
  const supabase = getSupabase();
  const patch: { status: EnrolmentStatus; completed_at?: string | null } = { status };
  if (status === 'completed') patch.completed_at = new Date().toISOString();
  if (status === 'active' || status === 'registered') patch.completed_at = null;
  const { error } = await supabase.from('enrolments').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeEnrolment(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('enrolments').delete().eq('id', id);
  if (error) throw error;
}

// --- sessions and attendance ------------------------------------------------

export interface SessionWithAttendance extends CohortSessionRow {
  present: number;
  marked: number;
}

export async function listSessions(cohortId: string): Promise<SessionWithAttendance[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cohort_sessions')
    .select('*')
    .eq('cohort_id', cohortId)
    .order('position')
    .order('session_date');
  if (error) throw error;
  const sessions = data ?? [];
  if (sessions.length === 0) return [];

  const { data: marks, error: markError } = await supabase
    .from('attendance')
    .select('session_id, is_present')
    .in(
      'session_id',
      sessions.map((s) => s.id),
    );
  if (markError) throw markError;

  const tally = new Map<string, { present: number; marked: number }>();
  for (const m of marks ?? []) {
    const t = tally.get(m.session_id) ?? { present: 0, marked: 0 };
    t.marked += 1;
    if (m.is_present) t.present += 1;
    tally.set(m.session_id, t);
  }
  return sessions.map((s) => ({ ...s, ...(tally.get(s.id) ?? { present: 0, marked: 0 }) }));
}

export async function createSession(input: {
  cohort_id: string;
  title: string;
  session_date?: string | null;
  position?: number;
}): Promise<CohortSessionRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cohort_sessions')
    .insert({ ...input, title: input.title.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('cohort_sessions').delete().eq('id', id);
  if (error) throw error;
}

export async function listAttendance(
  sessionId: string,
): Promise<Record<string, boolean>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('attendance')
    .select('enrolment_id, is_present')
    .eq('session_id', sessionId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((a) => [a.enrolment_id, a.is_present]));
}

/**
 * Upsert on (session_id, enrolment_id) — marking twice is a correction, not a
 * second record, and the unique constraint says so.
 */
export async function markAttendance(input: {
  session_id: string;
  enrolment_id: string;
  is_present: boolean;
}): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('attendance').upsert(
    { ...input, noted_at: new Date().toISOString(), noted_by: user?.id ?? null },
    { onConflict: 'session_id,enrolment_id' },
  );
  if (error) throw error;
}

// --- money linked to an enrolment -------------------------------------------

export interface EnrolmentDocument {
  id: string;
  type: string;
  number: string | null;
  total_ugx: number;
  status: string;
  related_id: string | null;
}

export async function listEnrolmentDocuments(
  enrolmentIds: string[],
): Promise<Map<string, EnrolmentDocument[]>> {
  const out = new Map<string, EnrolmentDocument[]>();
  if (enrolmentIds.length === 0) return out;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select('id, type, number, total_ugx, status, related_id')
    .eq('related_type', 'enrolment')
    .in('related_id', enrolmentIds);
  if (error) throw error;
  for (const d of data ?? []) {
    if (!d.related_id) continue;
    const list = out.get(d.related_id) ?? [];
    list.push(d);
    out.set(d.related_id, list);
  }
  return out;
}

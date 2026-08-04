import { getSupabase } from '@/lib/supabase';
import { normalizeUgandanPhone } from '@/lib/phone';
import type {
  VacancyRow,
  CandidateRow,
  ApplicationRow,
  InterviewRow,
  ContactRow,
  OrganisationRow,
  ActivityRow,
  VacancyStatus,
  EmploymentType,
  ApplicationStage,
} from '@/types/database';

// --- vacancies --------------------------------------------------------------

export interface VacancyWithRelations extends VacancyRow {
  organisation: Pick<OrganisationRow, 'id' | 'name'> | null;
  owner: { id: string; full_name: string } | null;
}

const VACANCY_SELECT = `
  *,
  organisation:organisations!vacancies_organisation_id_fkey ( id, name ),
  owner:profiles!vacancies_owner_id_fkey ( id, full_name )
`;

export interface ListVacanciesParams {
  search?: string;
  status?: VacancyStatus | 'all';
  page?: number;
  pageSize?: number;
}

export interface ListVacanciesResult {
  rows: VacancyWithRelations[];
  total: number;
}

export async function listVacancies(params: ListVacanciesParams = {}): Promise<ListVacanciesResult> {
  const supabase = getSupabase();
  const { search = '', status = 'all', page = 0, pageSize = 25 } = params;

  let query = supabase.from('vacancies').select(VACANCY_SELECT, { count: 'exact' });

  if (status !== 'all') query = query.eq('status', status);

  const term = search.trim();
  if (term) {
    const like = `%${term}%`;
    const [{ data: contacts }, { data: orgs }] = await Promise.all([
      supabase.from('contacts').select('id').or(`full_name.ilike.${like},email.ilike.${like}`),
      supabase.from('organisations').select('id').ilike('name', like),
    ]);
    const contactIds = (contacts ?? []).map((c) => c.id);
    const orgIds = (orgs ?? []).map((o) => o.id);
    const filters: string[] = [];
    if (contactIds.length) filters.push(`contact_id.in.(${contactIds.join(',')})`);
    if (orgIds.length) filters.push(`organisation_id.in.(${orgIds.join(',')})`);
    if (filters.length === 0) return { rows: [], total: 0 };
    query = query.or(filters.join(','));
  }

  const from = page * pageSize;
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as VacancyWithRelations[], total: count ?? 0 };
}

export async function getVacancy(idOrSlug: string): Promise<VacancyWithRelations | null> {
  const supabase = getSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  let query = supabase.from('vacancies').select(VACANCY_SELECT);
  query = isUuid ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as unknown as VacancyWithRelations) ?? null;
}

export interface CreateVacancyInput {
  title: string;
  slug?: string;
  organisationId?: string | null;
  summary?: string | null;
  description?: string | null;
  requirements?: string | null;
  location?: string | null;
  employmentType?: EmploymentType | null;
  salaryMinUgx?: number | null;
  salaryMaxUgx?: number | null;
  closesAt?: string | null;
  ownerId?: string | null;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function createVacancy(input: CreateVacancyInput): Promise<VacancyRow> {
  const supabase = getSupabase();
  const baseSlug = input.slug?.trim() || slugify(input.title);
  // Guarantee uniqueness: append a short suffix on collision.
  let slug = baseSlug;
  const { data: existing } = await supabase.from('vacancies').select('id').eq('slug', slug).maybeSingle();
  if (existing) slug = `${baseSlug}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from('vacancies')
    .insert({
      title: input.title.trim(),
      slug,
      organisation_id: input.organisationId ?? null,
      summary: input.summary ?? null,
      description: input.description ?? null,
      requirements: input.requirements ?? null,
      location: input.location ?? null,
      employment_type: input.employmentType ?? null,
      salary_min_ugx: input.salaryMinUgx ?? null,
      salary_max_ugx: input.salaryMaxUgx ?? null,
      closes_at: input.closesAt ?? null,
      owner_id: input.ownerId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface UpdateVacancyInput {
  title?: string;
  summary?: string | null;
  description?: string | null;
  requirements?: string | null;
  location?: string | null;
  employment_type?: EmploymentType | null;
  salary_min_ugx?: number | null;
  salary_max_ugx?: number | null;
  closes_at?: string | null;
  organisation_id?: string | null;
  owner_id?: string | null;
}

export async function updateVacancy(id: string, patch: UpdateVacancyInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('vacancies').update(patch).eq('id', id);
  if (error) throw error;
}

/** Publish: makes the vacancy visible on the public job board. */
export async function publishVacancy(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('vacancies')
    .update({ is_public: true, status: 'open', published_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function closeVacancy(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('vacancies').update({ status: 'closed' }).eq('id', id);
  if (error) throw error;
}

// --- candidates -------------------------------------------------------------

export interface CandidateWithRelations extends CandidateRow {
  contact: Pick<ContactRow, 'id' | 'full_name' | 'email' | 'phone_e164' | 'location'> | null;
  owner: { id: string; full_name: string } | null;
}

const CANDIDATE_SELECT = `
  *,
  contact:contacts!candidates_contact_id_fkey ( id, full_name, email, phone_e164, location ),
  owner:profiles!candidates_owner_id_fkey ( id, full_name )
`;

export interface ListCandidatesParams {
  search?: string;
  skills?: string[];
  available?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListCandidatesResult {
  rows: CandidateWithRelations[];
  total: number;
}

/**
 * Server-side list: search over headline/skills via the FTS tsvector, plus the
 * contact's name resolved through a contacts id-list lookup (PostgREST cannot
 * filter an embedded resource directly).
 */
export async function listCandidates(
  params: ListCandidatesParams = {},
): Promise<ListCandidatesResult> {
  const supabase = getSupabase();
  const { search = '', skills = [], available, page = 0, pageSize = 25 } = params;

  let query = supabase.from('candidates').select(CANDIDATE_SELECT, { count: 'exact' });

  if (available !== undefined) query = query.eq('is_available', available);
  if (skills.length > 0) query = query.contains('skills', skills);

  const term = search.trim();
  if (term) {
    const [{ data: nameMatches }, { data: ownMatches }] = await Promise.all([
      supabase.from('contacts').select('id').ilike('full_name', `%${term}%`),
      supabase.from('candidates').select('id').textSearch('search_tsv', term, {
        type: 'plain',
        config: 'simple',
      }),
    ]);
    const contactIds = (nameMatches ?? []).map((c) => c.id);
    const ownIds = (ownMatches ?? []).map((c) => c.id);
    const ids = new Set([...contactIds, ...ownIds]);
    if (ids.size === 0) return { rows: [], total: 0 };
    query = query.in('id', [...ids]);
  }

  const from = page * pageSize;
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as CandidateWithRelations[], total: count ?? 0 };
}

export async function getCandidate(id: string): Promise<CandidateWithRelations | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('candidates')
    .select(CANDIDATE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CandidateWithRelations) ?? null;
}

export interface UpdateCandidateInput {
  headline?: string | null;
  years_experience?: number | null;
  skills?: string[];
  education?: unknown[];
  work_history?: unknown[];
  salary_expectation_ugx?: number | null;
  availability?: CandidateRow['availability'];
  rating?: number | null;
  is_available?: boolean;
  notes?: string | null;
  owner_id?: string | null;
}

export async function updateCandidate(id: string, patch: UpdateCandidateInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('candidates').update(patch).eq('id', id);
  if (error) throw error;
}

/** Signed URL for the candidate's CV (private bucket — signed-URL only). */
export async function cvSignedUrl(
  candidateId: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const supabase = getSupabase();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('cv_file_id')
    .eq('id', candidateId)
    .maybeSingle();
  if (!candidate?.cv_file_id) return null;
  const { data: meta } = await supabase
    .from('candidate_files')
    .select('bucket, path')
    .eq('id', candidate.cv_file_id)
    .maybeSingle();
  if (!meta) return null;
  const { data } = await supabase.storage
    .from(meta.bucket)
    .createSignedUrl(meta.path, expiresInSeconds);
  return data?.signedUrl ?? null;
}

// --- applications -----------------------------------------------------------

export interface ApplicationWithRelations extends ApplicationRow {
  vacancy: Pick<VacancyRow, 'id' | 'title' | 'slug' | 'status'> | null;
  candidate: Pick<CandidateRow, 'id' | 'headline' | 'skills'> | null;
  candidateContact: Pick<ContactRow, 'id' | 'full_name' | 'email' | 'phone_e164'> | null;
}

const APPLICATION_SELECT = `
  *,
  vacancy:vacancies!applications_vacancy_id_fkey ( id, title, slug, status ),
  candidate:candidates!applications_candidate_id_fkey ( id, headline, skills ),
  candidateContact:candidates!applications_candidate_id_fkey ( contact:contacts!candidates_contact_id_fkey ( id, full_name, email, phone_e164 ) )
`;

export interface ListApplicationsResult {
  rows: ApplicationWithRelations[];
  total: number;
}

export async function listApplications(vacancyId: string): Promise<ApplicationWithRelations[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('applications')
    .select(APPLICATION_SELECT)
    .eq('vacancy_id', vacancyId)
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ApplicationWithRelations[];
}

/** Move an application to a new stage. The DB trigger logs the 'application' activity. */
export async function moveStage(
  id: string,
  stage: ApplicationStage,
  reason?: string,
): Promise<void> {
  const supabase = getSupabase();
  const patch: { stage: ApplicationStage; rejected_reason?: string | null } = { stage };
  if (stage === 'rejected') patch.rejected_reason = reason ?? null;
  const { error } = await supabase.from('applications').update(patch).eq('id', id);
  if (error) throw error;
}

export async function addApplicationNote(id: string, body: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('activities').insert({
    subject_type: 'application',
    subject_id: id,
    type: 'note',
    body,
    user_id: user?.id ?? null,
  });
  if (error) throw error;
}

/** Create an application; a duplicate (vacancy, candidate) is a no-op. */
export async function createApplication(vacancyId: string, candidateId: string): Promise<ApplicationRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('applications')
    .insert({ vacancy_id: vacancyId, candidate_id: candidateId, source: 'manual' })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }
  return data;
}

export async function getApplicationTimeline(id: string): Promise<ActivityRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('subject_type', 'application')
    .eq('subject_id', id)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// --- interviews -------------------------------------------------------------

export interface ScheduleInterviewInput {
  applicationId: string;
  scheduledAt?: string | null;
  mode?: string | null;
  panel?: string[];
}

export async function scheduleInterview(input: ScheduleInterviewInput): Promise<InterviewRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('interviews')
    .insert({
      application_id: input.applicationId,
      scheduled_at: input.scheduledAt ?? null,
      mode: input.mode ?? null,
      panel: input.panel ?? [],
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface RecordInterviewFeedbackInput {
  interviewId: string;
  feedback?: string | null;
  rating?: number | null;
  outcome?: string | null;
}

export async function recordInterviewFeedback(
  input: RecordInterviewFeedbackInput,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('interviews')
    .update({
      feedback: input.feedback ?? null,
      rating: input.rating ?? null,
      outcome: input.outcome ?? null,
    })
    .eq('id', input.interviewId);
  if (error) throw error;
}

// --- contacts helper (find-or-create used by tests and future UI) -----------

/** Find-or-create a contact by email then phone; ensure the 'candidate' role. */
export async function findOrCreateCandidateContact(input: {
  fullName: string;
  email?: string | null;
  phone?: string | null;
}): Promise<string> {
  const supabase = getSupabase();
  const email = input.email?.trim()?.toLowerCase() || null;
  const phone = input.phone ? normalizeUgandanPhone(input.phone) : null;

  let contactId: string | null = null;
  if (email) {
    const { data } = await supabase.from('contacts').select('id').ilike('email', email).maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId && phone) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone_e164', phone)
      .maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId) {
    const { data, error } = await supabase
      .from('contacts')
      .insert({ full_name: input.fullName.trim(), email, phone_e164: phone })
      .select('id')
      .single();
    if (error) throw error;
    contactId = data.id;
  }
  await supabase.from('contact_roles').upsert({ contact_id: contactId, role: 'candidate' });
  return contactId;
}

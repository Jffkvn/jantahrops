import { getSupabase } from '@/lib/supabase';
import { normalizeUgandanPhone } from '@/lib/phone';
import type {
  ContactRow,
  OrganisationRow,
  ActivityRow,
  ContactRole,
  LeadStage,
} from '@/types/database';

/**
 * Contacts and Organisations — the spine of the whole product.
 *
 * A person exists ONCE in `contacts` and picks up roles (lead, candidate,
 * client contact…) through the `contact_roles` junction. This module is the
 * only place that browses that spine directly; leads, candidates and finance
 * all reach people through their own feature APIs.
 */

export interface ContactWithMeta extends ContactRow {
  organisation: Pick<OrganisationRow, 'id' | 'name'> | null;
  roles: ContactRole[];
}

export interface OrganisationWithMeta extends OrganisationRow {
  contactCount: number;
}

const CONTACT_SELECT = `
  *,
  organisation:organisations!contacts_organisation_id_fkey ( id, name ),
  contact_roles ( role )
`;

/** Flattens the nested `contact_roles` rows into a plain string[] of roles. */
function toContactWithMeta(rows: unknown[]): ContactWithMeta[] {
  return rows.map((row) => {
    const r = row as ContactRow & {
      organisation: { id: string; name: string } | null;
      contact_roles?: { role: ContactRole }[];
    };
    const { contact_roles, ...rest } = r;
    return { ...rest, roles: (contact_roles ?? []).map((x) => x.role) };
  });
}

/**
 * `business` = everyone EXCEPT people who are only candidates.
 *
 * This is the default view, and the reason is a real distinction in recruitment:
 * candidates are people you PLACE (searched by skill, moved through a pipeline,
 * shortlisted) while contacts are people you SELL TO (an HR manager who signs an
 * invoice). They need different tooling, which is why the Talent Pool exists
 * separately. Without this filter, Contacts is just a worse Talent Pool —
 * ~2,000 imported CVs drown the handful of people you actually do business with.
 *
 * Someone who is BOTH a candidate and a client contact still appears here: the
 * exclusion is only for people whose sole role is `candidate`.
 */
export type ContactScope = ContactRole | 'all' | 'business';

export interface ListContactsParams {
  search?: string;
  role?: ContactScope;
  organisationId?: string;
  page?: number;
  pageSize?: number;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

/**
 * Server-side list. With ~2,000 contacts from the CV import, this must never
 * pull the whole table: filtering, searching and paging all happen in Postgres.
 */
export async function listContacts(
  params: ListContactsParams = {},
): Promise<ListResult<ContactWithMeta>> {
  const supabase = getSupabase();
  const { search = '', role = 'all', organisationId, page = 0, pageSize = 25 } = params;

  let query = supabase.from('contacts').select(CONTACT_SELECT, { count: 'exact' });

  if (organisationId) query = query.eq('organisation_id', organisationId);

  // Role lives in a junction table; resolve to ids first (PostgREST cannot
  // filter the parent by an embedded resource).
  if (role === 'business') {
    // v_business_contacts does the exclusion in SQL — see the migration. Doing
    // it client-side meant sending thousands of ids in a URL, which breaks.
    const { data: businessIds } = await supabase.from('v_business_contacts').select('id');
    const ids = (businessIds ?? []).map((r) => r.id);
    if (ids.length === 0) return { rows: [], total: 0 };
    query = query.in('id', ids);
  } else if (role !== 'all') {
    const { data: withRole } = await supabase
      .from('contact_roles')
      .select('contact_id')
      .eq('role', role)
      .limit(5000);
    const ids = (withRole ?? []).map((r) => r.contact_id);
    if (ids.length === 0) return { rows: [], total: 0 };
    query = query.in('id', ids);
  }

  const term = search.trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(`full_name.ilike.${like},email.ilike.${like},phone_e164.ilike.${like}`);
  }

  const from = page * pageSize;
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: toContactWithMeta(data ?? []), total: count ?? 0 };
}

export async function getContact(id: string): Promise<ContactWithMeta | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('contacts').select(CONTACT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toContactWithMeta([data])[0] ?? null;
}

/** Everything this person is, across the app — the point of a single spine. */
export interface ContactFootprint {
  leads: { id: string; stage: LeadStage; value_ugx: number; service_interest: string | null }[];
  candidateId: string | null;
  applications: { id: string; stage: string; vacancyTitle: string | null }[];
  documents: { id: string; type: string; number: string | null; total_ugx: number; status: string }[];
}

export async function getContactFootprint(contactId: string): Promise<ContactFootprint> {
  const supabase = getSupabase();

  const [leadsRes, candRes, docsRes] = await Promise.all([
    supabase.from('leads').select('id, stage, value_ugx, service_interest').eq('contact_id', contactId),
    supabase.from('candidates').select('id').eq('contact_id', contactId).maybeSingle(),
    supabase
      .from('documents')
      .select('id, type, number, total_ugx, status')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  let applications: ContactFootprint['applications'] = [];
  const candidateId = candRes.data?.id ?? null;
  if (candidateId) {
    const { data } = await supabase
      .from('applications')
      .select('id, stage, vacancy:vacancies!applications_vacancy_id_fkey ( title )')
      .eq('candidate_id', candidateId);
    applications = (data ?? []).map((a) => {
      const r = a as unknown as { id: string; stage: string; vacancy: { title: string } | null };
      return { id: r.id, stage: r.stage, vacancyTitle: r.vacancy?.title ?? null };
    });
  }

  return {
    leads: leadsRes.data ?? [],
    candidateId,
    applications,
    documents: docsRes.data ?? [],
  };
}

export async function getContactTimeline(contactId: string): Promise<ActivityRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('subject_type', 'contact')
    .eq('subject_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function addContactNote(contactId: string, body: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('activities').insert({
    subject_type: 'contact',
    subject_id: contactId,
    type: 'note',
    body,
    user_id: user?.id ?? null,
  });
  if (error) throw error;
}

export interface UpdateContactInput {
  full_name?: string;
  email?: string | null;
  phone_e164?: string | null;
  job_title?: string | null;
  location?: string | null;
  organisation_id?: string | null;
  notes?: string | null;
}

export async function updateContact(id: string, patch: UpdateContactInput): Promise<void> {
  const supabase = getSupabase();
  const clean: UpdateContactInput = { ...patch };
  // Phones are normalised before every write — contacts.phone_e164 is uniquely
  // indexed, and an unnormalised number would create a duplicate person.
  if (clean.phone_e164) {
    const n = normalizeUgandanPhone(clean.phone_e164);
    clean.phone_e164 = n ?? clean.phone_e164;
  }
  const { error } = await supabase.from('contacts').update(clean).eq('id', id);
  if (error) throw error;
}

/**
 * Clearing a review flag from the contact side. The CV import leaves ~300
 * candidates whose name it could not resolve; fixing the name here is the
 * natural place to also mark them reviewed.
 */
export async function resolveCandidateReview(contactId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('candidates')
    .update({ needs_review: false, review_reason: null })
    .eq('contact_id', contactId);
}

// --- organisations ----------------------------------------------------------

export interface ListOrganisationsParams {
  search?: string;
  clientsOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listOrganisations(
  params: ListOrganisationsParams = {},
): Promise<ListResult<OrganisationWithMeta>> {
  const supabase = getSupabase();
  const { search = '', clientsOnly = false, page = 0, pageSize = 25 } = params;

  let query = supabase.from('organisations').select('*', { count: 'exact' });
  if (clientsOnly) query = query.eq('is_client', true);
  const term = search.trim();
  if (term) query = query.ilike('name', `%${term}%`);

  const from = page * pageSize;
  query = query.order('name', { ascending: true }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // Contact counts in one grouped round trip rather than N queries.
  const ids = (data ?? []).map((o) => o.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('organisation_id')
      .in('organisation_id', ids);
    for (const c of contacts ?? []) {
      if (c.organisation_id) counts.set(c.organisation_id, (counts.get(c.organisation_id) ?? 0) + 1);
    }
  }

  return {
    rows: (data ?? []).map((o) => ({ ...o, contactCount: counts.get(o.id) ?? 0 })),
    total: count ?? 0,
  };
}

export async function getOrganisation(id: string): Promise<OrganisationRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('organisations').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpsertOrganisationInput {
  name: string;
  industry?: string | null;
  tin?: string | null;
  district?: string | null;
  address?: string | null;
  website?: string | null;
  is_client?: boolean;
  notes?: string | null;
}

export async function createOrganisation(input: UpsertOrganisationInput): Promise<OrganisationRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('organisations').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateOrganisation(
  id: string,
  patch: Partial<UpsertOrganisationInput>,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('organisations').update(patch).eq('id', id);
  if (error) throw error;
}

export async function createContact(input: {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  organisation_id?: string | null;
}): Promise<ContactRow> {
  const supabase = getSupabase();
  const phone = input.phone ? normalizeUgandanPhone(input.phone) : null;
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      full_name: input.full_name.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone_e164: phone,
      job_title: input.job_title ?? null,
      organisation_id: input.organisation_id ?? null,
      source: 'Manual entry',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

import { getSupabase } from '@/lib/supabase';
import { normalizeUgandanPhone } from '@/lib/phone';
import type { LeadRow, LeadStage, ContactRow, OrganisationRow, ActivityRow } from '@/types/database';

/** A lead joined with the bits of contact and organisation the UI shows. */
export interface LeadWithRelations extends LeadRow {
  contact: Pick<ContactRow, 'id' | 'full_name' | 'email' | 'phone_e164'> | null;
  organisation: Pick<OrganisationRow, 'id' | 'name'> | null;
  owner: { id: string; full_name: string } | null;
}

const LEAD_SELECT = `
  *,
  contact:contacts!leads_contact_id_fkey ( id, full_name, email, phone_e164 ),
  organisation:organisations!leads_organisation_id_fkey ( id, name ),
  owner:profiles!leads_owner_id_fkey ( id, full_name )
`;

export interface ListLeadsParams {
  search?: string;
  stage?: LeadStage | 'all';
  ownerId?: string;  // a profile id, or 'all'
  page?: number;
  pageSize?: number;
}

export interface ListLeadsResult {
  rows: LeadWithRelations[];
  total: number;
}

/**
 * Server-side list: filtering, search and pagination all happen in Postgres.
 * We never pull the whole table into the browser.
 *
 * Search spans the contact's name/email and the organisation name. PostgREST
 * cannot filter on an embedded resource with a plain `.or`, so the contact and
 * organisation name matches are resolved to id lists first, then applied.
 */
export async function listLeads(params: ListLeadsParams = {}): Promise<ListLeadsResult> {
  const supabase = getSupabase();
  const { search = '', stage = 'all', ownerId = 'all', page = 0, pageSize = 25 } = params;

  let query = supabase.from('leads').select(LEAD_SELECT, { count: 'exact' });

  if (stage !== 'all') query = query.eq('stage', stage);
  if (ownerId !== 'all') query = query.eq('owner_id', ownerId);

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
  return { rows: (data ?? []) as unknown as LeadWithRelations[], total: count ?? 0 };
}

/** Board data: active-stage leads only, grouped in memory by the caller. */
export async function listBoardLeads(): Promise<LeadWithRelations[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT)
    .in('stage', ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LeadWithRelations[];
}

export async function getLead(id: string): Promise<LeadWithRelations | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('leads').select(LEAD_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as LeadWithRelations) ?? null;
}

export async function getLeadTimeline(id: string): Promise<ActivityRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('subject_type', 'lead')
    .eq('subject_id', id)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CreateLeadInput {
  contactName: string;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  organisationName?: string | undefined;
  serviceInterest?: string | undefined;
  valueUgx: number;
  ownerId: string | null;
  source?: string | undefined;
}

/**
 * Creating a lead find-or-creates the contact (and organisation) so the spine
 * stays clean — no duplicate people. Matching is by normalised email, then
 * phone, mirroring the public capture endpoint's rule.
 */
export async function createLead(input: CreateLeadInput): Promise<LeadRow> {
  const supabase = getSupabase();

  // Organisation: find-or-create by name.
  let organisationId: string | null = null;
  const orgName = input.organisationName?.trim();
  if (orgName) {
    const { data: existing } = await supabase
      .from('organisations')
      .select('id')
      .ilike('name', orgName)
      .maybeSingle();
    if (existing) {
      organisationId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from('organisations')
        .insert({ name: orgName })
        .select('id')
        .single();
      if (error) throw error;
      organisationId = created.id;
    }
  }

  // Contact: find-or-create by email, then phone.
  const email = input.contactEmail?.trim() || null;
  const phone = input.contactPhone ? normalizeUgandanPhone(input.contactPhone) : null;

  let contactId: string | null = null;
  if (email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId && phone) {
    const { data } = await supabase.from('contacts').select('id').eq('phone_e164', phone).maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId) {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        full_name: input.contactName.trim(),
        email,
        phone_e164: phone,
        organisation_id: organisationId,
        source: input.source ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    contactId = data.id;
  }

  // Ensure the 'lead' role exists (idempotent — PK is (contact_id, role)).
  await supabase.from('contact_roles').upsert({ contact_id: contactId, role: 'lead' });

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      contact_id: contactId,
      organisation_id: organisationId,
      service_interest: input.serviceInterest ?? null,
      value_ugx: input.valueUgx,
      owner_id: input.ownerId,
      source: input.source ?? null,
      stage: 'new',
    })
    .select('*')
    .single();
  if (leadError) throw leadError;
  return lead;
}

export async function updateLeadStage(id: string, stage: LeadStage, lostReason?: string): Promise<void> {
  const supabase = getSupabase();
  const patch: { stage: LeadStage; lost_reason?: string | null } = { stage };
  if (stage === 'lost') patch.lost_reason = lostReason ?? null;
  const { error } = await supabase.from('leads').update(patch).eq('id', id);
  if (error) throw error;
}

export interface UpdateLeadInput {
  value_ugx?: number;
  service_interest?: string | null;
  owner_id?: string | null;
  next_action_at?: string | null;
  next_action_note?: string | null;
  source?: string | null;
}

export async function updateLead(id: string, patch: UpdateLeadInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('leads').update(patch).eq('id', id);
  if (error) throw error;
}

export async function addLeadNote(id: string, body: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from('activities').insert({
    subject_type: 'lead',
    subject_id: id,
    type: 'note',
    body,
    user_id: user?.id ?? null,
  });
  if (error) throw error;
}

import { getSupabase } from '@/lib/supabase';
import type {
  ProjectRow,
  ProjectMilestoneRow,
  ProjectPnlViewRow,
  TimeEntryRow,
  ProjectStage,
  MilestoneStatus,
} from '@/types/database';

/**
 * Projects — the delivery side.
 *
 * A project is an engagement you have been contracted to do. It carries what
 * you promised (contracted value, milestones), what it has cost (expenses,
 * days logged) and what has actually been billed and paid. The profit figure
 * is an ESTIMATE and every surface that shows it says so.
 */

export interface ProjectWithRelations extends ProjectRow {
  organisation: { id: string; name: string } | null;
  contact: { id: string; full_name: string } | null;
  owner: { id: string; full_name: string } | null;
}

export interface ProjectListItem extends ProjectWithRelations {
  pnl: ProjectPnlViewRow | null;
  openMilestones: number;
  nextDueDate: string | null;
}

const PROJECT_SELECT = `
  *,
  organisation:organisations!projects_organisation_id_fkey ( id, name ),
  contact:contacts!projects_contact_id_fkey ( id, full_name ),
  owner:profiles!projects_owner_id_fkey ( id, full_name )
`;

/** Stages that count as live work, in the order the board shows them. */
export const ACTIVE_STAGES: ProjectStage[] = [
  'planned',
  'active',
  'waiting_on_client',
  'under_review',
];

export interface ListProjectsParams {
  /** 'open' = everything except completed/archived. */
  scope?: 'open' | 'all' | ProjectStage;
  ownerId?: string;
  organisationId?: string;
  search?: string;
}

export async function listProjects(params: ListProjectsParams = {}): Promise<ProjectListItem[]> {
  const supabase = getSupabase();
  const { scope = 'open', ownerId, organisationId, search } = params;

  let query = supabase.from('projects').select(PROJECT_SELECT);
  if (scope === 'open') query = query.in('stage', ACTIVE_STAGES);
  else if (scope !== 'all') query = query.eq('stage', scope);
  if (ownerId && ownerId !== 'anyone') query = query.eq('owner_id', ownerId);
  if (organisationId) query = query.eq('organisation_id', organisationId);
  const term = search?.trim();
  if (term) query = query.ilike('name', `%${term}%`);

  const { data, error } = await query
    .order('end_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const projects = (data ?? []) as unknown as ProjectWithRelations[];
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);

  // P&L and milestone rollups in two grouped round trips rather than 2N.
  const [pnlRes, milestoneRes] = await Promise.all([
    supabase.from('v_project_pnl').select('*').in('project_id', ids),
    supabase
      .from('project_milestones')
      .select('project_id, due_date, status')
      .in('project_id', ids)
      .neq('status', 'done'),
  ]);
  if (pnlRes.error) throw pnlRes.error;
  if (milestoneRes.error) throw milestoneRes.error;

  const pnlById = new Map((pnlRes.data ?? []).map((r) => [r.project_id, r]));
  const openByProject = new Map<string, { count: number; nextDue: string | null }>();
  for (const m of milestoneRes.data ?? []) {
    const current = openByProject.get(m.project_id) ?? { count: 0, nextDue: null };
    current.count += 1;
    // Earliest upcoming due date wins; undated milestones never become "next".
    if (m.due_date && (current.nextDue === null || m.due_date < current.nextDue)) {
      current.nextDue = m.due_date;
    }
    openByProject.set(m.project_id, current);
  }

  return projects.map((p) => {
    const open = openByProject.get(p.id);
    return {
      ...p,
      pnl: pnlById.get(p.id) ?? null,
      openMilestones: open?.count ?? 0,
      nextDueDate: open?.nextDue ?? null,
    };
  });
}

export async function getProject(id: string): Promise<ProjectWithRelations | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProjectWithRelations) ?? null;
}

export async function getProjectPnl(id: string): Promise<ProjectPnlViewRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('v_project_pnl')
    .select('*')
    .eq('project_id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpsertProjectInput {
  organisation_id: string;
  name: string;
  contact_id?: string | null;
  project_type?: string | null;
  owner_id?: string | null;
  stage?: ProjectStage;
  start_date?: string | null;
  end_date?: string | null;
  contracted_value_ugx?: number;
  description?: string | null;
}

export async function createProject(input: UpsertProjectInput): Promise<ProjectRow> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...input, name: input.name.trim(), created_by: user?.id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(
  id: string,
  patch: Partial<UpsertProjectInput>,
): Promise<void> {
  const supabase = getSupabase();
  const clean = { ...patch };
  if (typeof clean.name === 'string') clean.name = clean.name.trim();
  const { error } = await supabase.from('projects').update(clean).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// --- milestones -------------------------------------------------------------

export async function listMilestones(projectId: string): Promise<ProjectMilestoneRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createMilestone(input: {
  project_id: string;
  title: string;
  due_date?: string | null;
  position?: number;
}): Promise<ProjectMilestoneRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_milestones')
    .insert({ ...input, title: input.title.trim() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * `completed_at` is NOT sent: a database trigger keeps it in step with status,
 * so it stays correct however the row is changed — including from SQL.
 */
export async function setMilestoneStatus(id: string, status: MilestoneStatus): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('project_milestones').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function updateMilestone(
  id: string,
  patch: { title?: string; due_date?: string | null; status?: MilestoneStatus },
): Promise<void> {
  const supabase = getSupabase();
  const clean = { ...patch };
  if (typeof clean.title === 'string') clean.title = clean.title.trim();
  const { error } = await supabase.from('project_milestones').update(clean).eq('id', id);
  if (error) throw error;
}

export async function deleteMilestone(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('project_milestones').delete().eq('id', id);
  if (error) throw error;
}

// --- time -------------------------------------------------------------------

export interface TimeEntryWithUser extends TimeEntryRow {
  user: { id: string; full_name: string } | null;
}

export async function listTimeEntries(projectId: string): Promise<TimeEntryWithUser[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('time_entries')
    .select('*, user:profiles!time_entries_user_id_fkey ( id, full_name )')
    .eq('project_id', projectId)
    .order('work_date', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as TimeEntryWithUser[];
}

export async function logTime(input: {
  project_id: string;
  work_date: string;
  days: number;
  note?: string | null;
}): Promise<TimeEntryRow> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('time_entries')
    .insert({ ...input, user_id: user?.id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('time_entries').delete().eq('id', id);
  if (error) throw error;
}

// --- linked money -----------------------------------------------------------

export interface ProjectDocument {
  id: string;
  type: string;
  number: string | null;
  total_ugx: number;
  status: string;
  issue_date: string | null;
}

export interface ProjectExpense {
  id: string;
  category: string;
  description: string | null;
  amount_ugx: number;
  incurred_on: string;
  vendor: string | null;
}

export async function listProjectMoney(
  projectId: string,
): Promise<{ documents: ProjectDocument[]; expenses: ProjectExpense[] }> {
  const supabase = getSupabase();
  const [docsRes, expensesRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id, type, number, total_ugx, status, issue_date')
      .eq('related_type', 'project')
      .eq('related_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, category, description, amount_ugx, incurred_on, vendor')
      .eq('project_id', projectId)
      .order('incurred_on', { ascending: false }),
  ]);
  if (docsRes.error) throw docsRes.error;
  if (expensesRes.error) throw expensesRes.error;
  return { documents: docsRes.data ?? [], expenses: expensesRes.data ?? [] };
}

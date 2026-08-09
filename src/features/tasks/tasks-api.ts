import { getSupabase } from '@/lib/supabase';
import { kampalaDayEnd } from './task-buckets';
import type { TaskRow, TaskPriority, TaskStatus } from '@/types/database';

/**
 * Tasks — the shared to-do list.
 *
 * Two things make this more than a notes app. First, a task can point at any
 * record in the product (`related_type` + `related_id`), so "chase the LPO" is
 * attached to the invoice rather than floating loose. Second, everything open
 * and due surfaces on the Day View, which is the page this business actually
 * starts from.
 */

export interface TaskWithAssignee extends TaskRow {
  assignee: { id: string; full_name: string } | null;
}

const TASK_SELECT = `
  *,
  assignee:profiles!tasks_assignee_id_fkey ( id, full_name )
`;

/** What a task can be attached to, and where clicking it should go. */
export const RELATED_LABELS: Record<string, string> = {
  lead: 'Lead',
  contact: 'Contact',
  organisation: 'Organisation',
  document: 'Document',
  vacancy: 'Vacancy',
  application: 'Application',
  candidate: 'Candidate',
};

/**
 * Only routes that actually accept a deep link are listed. A chip that looks
 * clickable and then lands you on an unfiltered index is worse than a chip that
 * is plainly just a label — `application` needs its vacancy id to open, and
 * organisations have no detail route yet, so both stay unlinked.
 */
export function relatedHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case 'lead':
      return `/leads?lead=${id}`;
    case 'contact':
      return `/contacts?contact=${id}`;
    case 'candidate':
      return `/talent?candidate=${id}`;
    case 'document':
      return `/finance/${id}`;
    case 'vacancy':
      return `/recruitment/${id}`;
    default:
      return null;
  }
}

export interface ListTasksParams {
  status?: TaskStatus | 'all';
  /** A profile id, or 'anyone'. 'unassigned' matches tasks with no assignee. */
  assigneeId?: string;
  relatedType?: string;
  relatedId?: string;
  search?: string;
}

export async function listTasks(params: ListTasksParams = {}): Promise<TaskWithAssignee[]> {
  const supabase = getSupabase();
  const { status = 'open', assigneeId, relatedType, relatedId, search } = params;

  let query = supabase.from('tasks').select(TASK_SELECT);
  if (status !== 'all') query = query.eq('status', status);
  if (assigneeId === 'unassigned') query = query.is('assignee_id', null);
  else if (assigneeId && assigneeId !== 'anyone') query = query.eq('assignee_id', assigneeId);
  if (relatedType && relatedId) {
    query = query.eq('related_type', relatedType).eq('related_id', relatedId);
  }
  const term = search?.trim();
  if (term) query = query.ilike('title', `%${term}%`);

  // Nulls last so undated "someday" work sinks below anything with a date.
  const { data, error } = await query
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as TaskWithAssignee[];
}

/** Counts for the Day View strip — head requests, no rows pulled. */
export interface TaskCounts {
  open: number;
  dueToday: number;
  overdue: number;
}

export async function countOpenTasks(): Promise<TaskCounts> {
  const supabase = getSupabase();
  const endYesterday = kampalaDayEnd(-1).toISOString();
  const endToday = kampalaDayEnd(0).toISOString();

  const [openRes, todayRes, overdueRes] = await Promise.all([
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .gt('due_at', endYesterday)
      .lte('due_at', endToday),
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
      .lte('due_at', endYesterday),
  ]);

  const firstError = openRes.error ?? todayRes.error ?? overdueRes.error;
  if (firstError) throw firstError;

  return {
    open: openRes.count ?? 0,
    dueToday: todayRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
  };
}

/** Open tasks that are due today or already late — the Day View list. */
export async function listDueTasks(limit = 8): Promise<TaskWithAssignee[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('status', 'open')
    .lte('due_at', kampalaDayEnd(0).toISOString())
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as TaskWithAssignee[];
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  due_at?: string | null;
  assignee_id?: string | null;
  priority?: TaskPriority;
  related_type?: string | null;
  related_id?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRow> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, title: input.title.trim(), created_by: user?.id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;

export async function updateTask(id: string, patch: UpdateTaskInput): Promise<void> {
  const supabase = getSupabase();
  const clean: UpdateTaskInput = { ...patch };
  if (typeof clean.title === 'string') clean.title = clean.title.trim();
  const { error } = await supabase.from('tasks').update(clean).eq('id', id);
  if (error) throw error;
}

/**
 * Completing stamps completed_at; reopening clears it. Keeping the timestamp in
 * step with the status is what makes "how much did we get through last month?"
 * answerable later — a `done` row with no date is a row you cannot report on.
 */
export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('tasks')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  listTasks,
  listDueTasks,
  countOpenTasks,
  createTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  type ListTasksParams,
  type CreateTaskInput,
  type UpdateTaskInput,
  type TaskWithAssignee,
} from './tasks-api';
import type { TaskStatus } from '@/types/database';

const keys = {
  all: ['tasks'] as const,
  list: (p: ListTasksParams) => ['tasks', 'list', p] as const,
  due: ['tasks', 'due'] as const,
  counts: ['tasks', 'counts'] as const,
};

/** Anything that changes a task also changes the Day View. */
function invalidateAll(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.all });
  void qc.invalidateQueries({ queryKey: ['day-view'] });
}

export function useTasks(params: ListTasksParams = {}) {
  return useQuery({ queryKey: keys.list(params), queryFn: () => listTasks(params) });
}

export function useDueTasks() {
  return useQuery({ queryKey: keys.due, queryFn: () => listDueTasks(), staleTime: 15_000 });
}

export function useTaskCounts() {
  return useQuery({ queryKey: keys.counts, queryFn: countOpenTasks, staleTime: 15_000 });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateTaskInput }) => updateTask(vars.id, vars.patch),
    onSuccess: () => invalidateAll(qc),
  });
}

/**
 * Ticking a checkbox has to feel instantaneous, so the row flips locally before
 * the round trip and rolls back if the write fails. Every cached task list is
 * patched, not just the one on screen — the same task can be visible in the Day
 * View and on /tasks at once, and seeing one tick while the other lags is the
 * kind of small wrongness that makes an app feel unreliable.
 */
export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: TaskStatus }) => setTaskStatus(vars.id, vars.status),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: keys.all });
      const snapshots = qc.getQueriesData<TaskWithAssignee[]>({ queryKey: keys.all });
      for (const [key, rows] of snapshots) {
        if (!Array.isArray(rows)) continue;
        qc.setQueryData(
          key,
          rows.map((t) => (t.id === vars.id ? { ...t, status: vars.status } : t)),
        );
      }
      return { snapshots };
    },
    onError: (_error, _vars, ctx) => {
      for (const [key, rows] of ctx?.snapshots ?? []) qc.setQueryData(key, rows);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => invalidateAll(qc),
  });
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  listProjects,
  getProject,
  getProjectPnl,
  createProject,
  updateProject,
  deleteProject,
  listMilestones,
  createMilestone,
  setMilestoneStatus,
  updateMilestone,
  deleteMilestone,
  listTimeEntries,
  logTime,
  deleteTimeEntry,
  listProjectMoney,
  type ListProjectsParams,
  type UpsertProjectInput,
} from './projects-api';
import type { MilestoneStatus } from '@/types/database';

const keys = {
  all: ['projects'] as const,
  list: (p: ListProjectsParams) => ['projects', 'list', p] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  pnl: (id: string) => ['projects', 'pnl', id] as const,
  milestones: (id: string) => ['projects', 'milestones', id] as const,
  time: (id: string) => ['projects', 'time', id] as const,
  money: (id: string) => ['projects', 'money', id] as const,
};

/**
 * Milestones and time both move the P&L and the list rollups, so anything that
 * touches a project invalidates the whole subtree rather than one key. These
 * are small lists; correctness beats shaving a refetch.
 */
function invalidateProject(qc: QueryClient, projectId?: string) {
  void qc.invalidateQueries({ queryKey: keys.all });
  if (projectId) void qc.invalidateQueries({ queryKey: keys.pnl(projectId) });
}

export function useProjects(params: ListProjectsParams = {}) {
  return useQuery({ queryKey: keys.list(params), queryFn: () => listProjects(params) });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => getProject(id!),
    enabled: Boolean(id),
  });
}

export function useProjectPnl(id: string | null) {
  return useQuery({
    queryKey: keys.pnl(id ?? ''),
    queryFn: () => getProjectPnl(id!),
    enabled: Boolean(id),
  });
}

export function useMilestones(projectId: string | null) {
  return useQuery({
    queryKey: keys.milestones(projectId ?? ''),
    queryFn: () => listMilestones(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useTimeEntries(projectId: string | null) {
  return useQuery({
    queryKey: keys.time(projectId ?? ''),
    queryFn: () => listTimeEntries(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useProjectMoney(projectId: string | null) {
  return useQuery({
    queryKey: keys.money(projectId ?? ''),
    queryFn: () => listProjectMoney(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProjectInput) => createProject(input),
    onSuccess: () => invalidateProject(qc),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: Partial<UpsertProjectInput> }) =>
      updateProject(vars.id, vars.patch),
    onSuccess: (_d, vars) => invalidateProject(qc, vars.id),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => invalidateProject(qc),
  });
}

export function useCreateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { project_id: string; title: string; due_date?: string | null }) =>
      createMilestone(input),
    onSuccess: (_d, vars) => invalidateProject(qc, vars.project_id),
  });
}

export function useSetMilestoneStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: MilestoneStatus; projectId: string }) =>
      setMilestoneStatus(vars.id, vars.status),
    onSuccess: (_d, vars) => invalidateProject(qc, vars.projectId),
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      projectId: string;
      patch: { title?: string; due_date?: string | null; status?: MilestoneStatus };
    }) => updateMilestone(vars.id, vars.patch),
    onSuccess: (_d, vars) => invalidateProject(qc, vars.projectId),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; projectId: string }) => deleteMilestone(vars.id),
    onSuccess: (_d, vars) => invalidateProject(qc, vars.projectId),
  });
}

export function useLogTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      project_id: string;
      work_date: string;
      days: number;
      note?: string | null;
    }) => logTime(input),
    onSuccess: (_d, vars) => invalidateProject(qc, vars.project_id),
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; projectId: string }) => deleteTimeEntry(vars.id),
    onSuccess: (_d, vars) => invalidateProject(qc, vars.projectId),
  });
}

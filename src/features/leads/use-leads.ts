import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import {
  listLeads,
  listBoardLeads,
  getLead,
  getLeadTimeline,
  createLead,
  updateLead,
  updateLeadStage,
  addLeadNote,
  type ListLeadsParams,
  type CreateLeadInput,
  type UpdateLeadInput,
} from './leads-api';
import type { LeadStage } from '@/types/database';

const keys = {
  all: ['leads'] as const,
  list: (p: ListLeadsParams) => ['leads', 'list', p] as const,
  board: ['leads', 'board'] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
  timeline: (id: string) => ['leads', 'timeline', id] as const,
};

/** Team members, for the owner picker and filter. */
export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });
}

export function useLeadsList(params: ListLeadsParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => listLeads(params),
  });
}

export function useBoardLeads() {
  return useQuery({ queryKey: keys.board, queryFn: listBoardLeads });
}

export function useLead(id: string) {
  return useQuery({ queryKey: keys.detail(id), queryFn: () => getLead(id), enabled: Boolean(id) });
}

export function useLeadTimeline(id: string) {
  return useQuery({
    queryKey: keys.timeline(id),
    queryFn: () => getLeadTimeline(id),
    enabled: Boolean(id),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) => createLead(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; stage: LeadStage; lostReason?: string }) =>
      updateLeadStage(vars.id, vars.stage, vars.lostReason),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.all });
      void qc.invalidateQueries({ queryKey: keys.timeline(vars.id) });
    },
  });
}

export function useUpdateLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateLeadInput) => updateLead(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all });
      void qc.invalidateQueries({ queryKey: keys.detail(id) });
      // A changed next_action_at moves this lead in or out of the Day View.
      void qc.invalidateQueries({ queryKey: ['day-view'] });
    },
  });
}

export function useAddLeadNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addLeadNote(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.timeline(id) }),
  });
}

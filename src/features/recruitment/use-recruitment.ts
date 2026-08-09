import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import {
  listVacancies,
  getVacancy,
  createVacancy,
  updateVacancy,
  publishVacancy,
  closeVacancy,
  listApplications,
  getApplicationTimeline,
  getCandidate,
  updateCandidate,
  moveStage,
  addApplicationNote,
  createApplication,
  scheduleInterview,
  recordInterviewFeedback,
  listCandidates,
  listDistinctSkills,
  listApplicationsByStage,
  listApplicationsByCandidate,
  type ListVacanciesParams,
  type CreateVacancyInput,
  type UpdateVacancyInput,
  type ListCandidatesParams,
  type ScheduleInterviewInput,
  type RecordInterviewFeedbackInput,
} from './recruitment-api';
import type { ApplicationStage, VacancyStatus } from '@/types/database';

const keys = {
  all: ['recruitment'] as const,
  vacancies: (p: ListVacanciesParams) => ['recruitment', 'vacancies', p] as const,
  vacancy: (id: string) => ['recruitment', 'vacancy', id] as const,
  applications: (vacancyId: string) => ['recruitment', 'applications', vacancyId] as const,
  timeline: (id: string) => ['recruitment', 'timeline', id] as const,
  shortlist: (vacancyId: string, stage: ApplicationStage) =>
    ['recruitment', 'shortlist', vacancyId, stage] as const,
  candidates: (p: ListCandidatesParams) => ['recruitment', 'candidates', p] as const,
  candidate: (id: string) => ['recruitment', 'candidate', id] as const,
  candidateApplications: (id: string) => ['recruitment', 'candidate-apps', id] as const,
  skills: ['recruitment', 'skills'] as const,
  interviews: (applicationId: string) => ['recruitment', 'interviews', applicationId] as const,
  vacanciesPrefix: ['recruitment', 'vacancies'] as const,
  candidatesPrefix: ['recruitment', 'candidates'] as const,
};

export { useTeam } from '@/features/team/use-team';

export function useVacanciesList(params: ListVacanciesParams) {
  return useQuery({ queryKey: keys.vacancies(params), queryFn: () => listVacancies(params) });
}

export function useVacancy(id: string) {
  return useQuery({
    queryKey: keys.vacancy(id),
    queryFn: () => getVacancy(id),
    enabled: Boolean(id),
  });
}

export function useApplications(vacancyId: string) {
  return useQuery({
    queryKey: keys.applications(vacancyId),
    queryFn: () => listApplications(vacancyId),
    enabled: Boolean(vacancyId),
  });
}

export function useApplicationTimeline(id: string) {
  return useQuery({
    queryKey: keys.timeline(id),
    queryFn: () => getApplicationTimeline(id),
    enabled: Boolean(id),
  });
}

export function useInterviews(applicationId: string) {
  return useQuery({
    queryKey: keys.interviews(applicationId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('interviews')
        .select('*')
        .eq('application_id', applicationId)
        .order('scheduled_at', { ascending: true, nullsFirst: true });
      if (error) throw error;
      return data;
    },
    enabled: Boolean(applicationId),
  });
}

export function useShortlist(vacancyId: string, stage: ApplicationStage) {
  return useQuery({
    queryKey: keys.shortlist(vacancyId, stage),
    queryFn: () => listApplicationsByStage(vacancyId, stage),
    enabled: Boolean(vacancyId),
  });
}

export function useCandidatesList(params: ListCandidatesParams) {
  return useQuery({ queryKey: keys.candidates(params), queryFn: () => listCandidates(params) });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: keys.candidate(id),
    queryFn: () => getCandidate(id),
    enabled: Boolean(id),
  });
}

export function useCandidateApplications(id: string) {
  return useQuery({
    queryKey: keys.candidateApplications(id),
    queryFn: () => listApplicationsByCandidate(id),
    enabled: Boolean(id),
  });
}

export function useUpdateCandidate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateCandidate>[1]) => updateCandidate(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.candidate(id) });
      void qc.invalidateQueries({ queryKey: keys.candidatesPrefix });
    },
  });
}

export function useDistinctSkills() {
  return useQuery({ queryKey: keys.skills, queryFn: () => listDistinctSkills(), staleTime: 5 * 60_000 });
}

export function useCreateVacancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVacancyInput) => createVacancy(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateVacancy(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateVacancyInput) => updateVacancy(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.vacancy(id) });
      void qc.invalidateQueries({ queryKey: keys.vacanciesPrefix });
    },
  });
}

export function usePublishVacancy(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => publishVacancy(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.vacancy(id) });
      void qc.invalidateQueries({ queryKey: keys.vacanciesPrefix });
    },
  });
}

export function useCloseVacancy(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => closeVacancy(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.vacancy(id) });
      void qc.invalidateQueries({ queryKey: keys.vacanciesPrefix });
    },
  });
}

export function useMoveStage(vacancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; stage: ApplicationStage; reason?: string }) =>
      moveStage(vars.id, vars.stage, vars.reason),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.applications(vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.timeline(vars.id) });
      void qc.invalidateQueries({ queryKey: ['day-view'] });
    },
  });
}

export function useAddApplicationNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addApplicationNote(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.timeline(id) }),
  });
}

export function useCreateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { vacancyId: string; candidateId: string }) =>
      createApplication(vars.vacancyId, vars.candidateId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.applications(vars.vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.vacancy(vars.vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.candidatesPrefix });
      void qc.invalidateQueries({ queryKey: keys.candidate(vars.candidateId) });
      void qc.invalidateQueries({ queryKey: keys.candidateApplications(vars.candidateId) });
    },
  });
}

export function useScheduleInterview(vacancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleInterviewInput) => scheduleInterview(input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.interviews(vars.applicationId) });
      void qc.invalidateQueries({ queryKey: keys.timeline(vars.applicationId) });
      void qc.invalidateQueries({ queryKey: keys.applications(vacancyId) });
    },
  });
}

export function useRecordInterviewFeedback(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordInterviewFeedbackInput) => recordInterviewFeedback(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.interviews(applicationId) });
      void qc.invalidateQueries({ queryKey: keys.timeline(applicationId) });
    },
  });
}

export type { VacancyStatus };

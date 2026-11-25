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
  resolveApplicationDocumentUrls,
  getApplicationTimeline,
  getCandidateTimeline,
  getCandidate,
  updateCandidate,
  moveStage,
  addApplicationNote,
  addContactToVacancy,
  createApplication,
  scheduleInterview,
  recordInterviewFeedback,
  listCandidates,
  listDistinctSkills,
  listApplicationsByStage,
  listApplicationsByCandidate,
  evaluateApplicationWithAi,
  parseCandidateCvWithAi,
  saveApplicationAssessmentOverride,
  updateApplicationInterviewQuestions,
  matchTalentPoolForVacancy,
  type ListVacanciesParams,
  type CreateVacancyInput,
  type UpdateVacancyInput,
  type ListCandidatesParams,
  type ScheduleInterviewInput,
  type RecordInterviewFeedbackInput,
  type ApplicationWithRelations,
} from './recruitment-api';
import type { ApplicationAiAssessment, InterviewPrepQuestion, OverrideAssessmentInput } from './ai-matching-schema';
import type { ApplicationStage, VacancyStatus } from '@/types/database';

const keys = {
  all: ['recruitment'] as const,
  vacancies: (p: ListVacanciesParams) => ['recruitment', 'vacancies', p] as const,
  vacancy: (id: string) => ['recruitment', 'vacancy', id] as const,
  applications: (vacancyId: string) => ['recruitment', 'applications', vacancyId] as const,
  applicationDocuments: (vacancyId: string, count: number, expiresInSeconds: number) =>
    ['recruitment', 'application-documents', vacancyId, count, expiresInSeconds] as const,
  talentPoolMatches: (vacancyId: string) => ['recruitment', 'talent-matches', vacancyId] as const,
  timeline: (id: string) => ['recruitment', 'timeline', id] as const,
  candidateTimeline: (id: string) => ['recruitment', 'candidate-timeline', id] as const,
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

export function useApplicationDocuments(
  vacancyId: string,
  applications: ApplicationWithRelations[] | undefined,
  expiresInSeconds = 14 * 24 * 60 * 60,
) {
  const count = applications?.length ?? 0;
  return useQuery({
    queryKey: keys.applicationDocuments(vacancyId, count, expiresInSeconds),
    queryFn: () => resolveApplicationDocumentUrls(applications ?? [], expiresInSeconds),
    enabled: Boolean(vacancyId) && count > 0,
    staleTime: Math.min(expiresInSeconds * 500, 30 * 60_000),
  });
}

export function useApplicationTimeline(id: string) {
  return useQuery({
    queryKey: keys.timeline(id),
    queryFn: () => getApplicationTimeline(id),
    enabled: Boolean(id),
  });
}

export function useCandidateTimeline(id: string) {
  return useQuery({
    queryKey: keys.candidateTimeline(id),
    queryFn: () => getCandidateTimeline(id),
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
    mutationFn: (vars: {
      vacancyId: string;
      candidateId: string;
      source?: string | undefined;
      notes?: string | null | undefined;
    }) =>
      createApplication(vars.vacancyId, vars.candidateId, {
        source: vars.source,
        notes: vars.notes,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.applications(vars.vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.talentPoolMatches(vars.vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.vacancy(vars.vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.vacanciesPrefix });
      void qc.invalidateQueries({ queryKey: keys.candidatesPrefix });
      void qc.invalidateQueries({ queryKey: keys.candidate(vars.candidateId) });
      void qc.invalidateQueries({ queryKey: keys.candidateApplications(vars.candidateId) });
    },
  });
}

export function useAddContactToVacancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      contactId: string;
      vacancyId: string;
      source?: string | undefined;
      notes?: string | null | undefined;
    }) => addContactToVacancy(vars),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.all });
      void qc.invalidateQueries({ queryKey: ['directory', 'footprint', vars.contactId] });
      void qc.invalidateQueries({ queryKey: ['directory'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useTalentPoolMatches(vacancyId: string, enabled = true) {
  return useQuery({
    queryKey: keys.talentPoolMatches(vacancyId),
    queryFn: () => matchTalentPoolForVacancy(vacancyId, 20),
    enabled: Boolean(vacancyId) && enabled,
  });
}

export function useEvaluateApplication(vacancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { applicationId: string; forceReparseCv?: boolean }) =>
      evaluateApplicationWithAi(vars.applicationId, vars.forceReparseCv),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.applications(vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.timeline(vars.applicationId) });
      void qc.invalidateQueries({ queryKey: keys.candidatesPrefix });
      void qc.invalidateQueries({ queryKey: ['new-arrivals'] });
    },
  });
}

export function useParseCandidateCv(candidateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (forceReparseCv?: boolean | void) =>
      parseCandidateCvWithAi(candidateId, typeof forceReparseCv === 'boolean' ? forceReparseCv : true),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.candidate(candidateId) });
      void qc.invalidateQueries({ queryKey: keys.candidatesPrefix });
    },
  });
}

export function useSaveAssessmentOverride(vacancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      applicationId: string;
      override: Omit<OverrideAssessmentInput, 'userId' | 'userName'>;
    }) => saveApplicationAssessmentOverride(vars.applicationId, vars.override),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: keys.applications(vacancyId) });
      void qc.invalidateQueries({ queryKey: keys.timeline(vars.applicationId) });
      void qc.invalidateQueries({ queryKey: ['new-arrivals'] });
    },
  });
}

export function useUpdateInterviewQuestions(vacancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      applicationId: string;
      currentAssessment: ApplicationAiAssessment | null;
      questions: InterviewPrepQuestion[];
    }) => updateApplicationInterviewQuestions(vars.applicationId, vars.currentAssessment, vars.questions),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.applications(vacancyId) });
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

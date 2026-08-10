import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  listCohorts,
  getCohort,
  createCohort,
  updateCohort,
  listEnrolments,
  enrol,
  setEnrolmentStatus,
  removeEnrolment,
  listSessions,
  createSession,
  deleteSession,
  listAttendance,
  markAttendance,
  listEnrolmentDocuments,
  type ListCohortsParams,
  type UpsertCourseInput,
  type UpsertCohortInput,
} from './academy-api';
import type { EnrolmentStatus } from '@/types/database';

const keys = {
  all: ['academy'] as const,
  courses: (search: string) => ['academy', 'courses', search] as const,
  course: (id: string) => ['academy', 'course', id] as const,
  cohorts: (p: ListCohortsParams) => ['academy', 'cohorts', p] as const,
  cohort: (id: string) => ['academy', 'cohort', id] as const,
  enrolments: (id: string) => ['academy', 'enrolments', id] as const,
  sessions: (id: string) => ['academy', 'sessions', id] as const,
  attendance: (id: string) => ['academy', 'attendance', id] as const,
  enrolmentDocs: (ids: string[]) => ['academy', 'enrolment-docs', ids] as const,
};

/** Enrolling changes the roster, the cohort counts and the course rollups. */
function invalidateAcademy(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.all });
}

export function useCourses(search = '') {
  return useQuery({ queryKey: keys.courses(search), queryFn: () => listCourses(search) });
}

export function useCourse(id: string | null) {
  return useQuery({
    queryKey: keys.course(id ?? ''),
    queryFn: () => getCourse(id!),
    enabled: Boolean(id),
  });
}

export function useCohorts(params: ListCohortsParams = {}) {
  return useQuery({ queryKey: keys.cohorts(params), queryFn: () => listCohorts(params) });
}

export function useCohort(id: string | null) {
  return useQuery({
    queryKey: keys.cohort(id ?? ''),
    queryFn: () => getCohort(id!),
    enabled: Boolean(id),
  });
}

export function useEnrolments(cohortId: string | null) {
  return useQuery({
    queryKey: keys.enrolments(cohortId ?? ''),
    queryFn: () => listEnrolments(cohortId!),
    enabled: Boolean(cohortId),
  });
}

export function useSessions(cohortId: string | null) {
  return useQuery({
    queryKey: keys.sessions(cohortId ?? ''),
    queryFn: () => listSessions(cohortId!),
    enabled: Boolean(cohortId),
  });
}

export function useAttendance(sessionId: string | null) {
  return useQuery({
    queryKey: keys.attendance(sessionId ?? ''),
    queryFn: () => listAttendance(sessionId!),
    enabled: Boolean(sessionId),
  });
}

export function useEnrolmentDocuments(enrolmentIds: string[]) {
  return useQuery({
    queryKey: keys.enrolmentDocs(enrolmentIds),
    queryFn: () => listEnrolmentDocuments(enrolmentIds),
    enabled: enrolmentIds.length > 0,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertCourseInput) => createCourse(input),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: Partial<UpsertCourseInput> }) =>
      updateCourse(vars.id, vars.patch),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useCreateCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertCohortInput) => createCohort(input),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useUpdateCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: Partial<UpsertCohortInput> }) =>
      updateCohort(vars.id, vars.patch),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useEnrol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      cohort_id: string;
      contact_id: string;
      organisation_id?: string | null;
      source?: string | null;
    }) => enrol(input),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useSetEnrolmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: Exclude<EnrolmentStatus, 'paid'> }) =>
      setEnrolmentStatus(vars.id, vars.status),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useRemoveEnrolment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeEnrolment(id),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { cohort_id: string; title: string; session_date?: string | null }) =>
      createSession(input),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => invalidateAcademy(qc),
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { session_id: string; enrolment_id: string; is_present: boolean }) =>
      markAttendance(input),
    // Ticking a register should feel immediate; reconcile after.
    onMutate: async (vars) => {
      const key = keys.attendance(vars.session_id);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Record<string, boolean>>(key);
      qc.setQueryData<Record<string, boolean>>(key, (old) => ({
        ...(old ?? {}),
        [vars.enrolment_id]: vars.is_present,
      }));
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => invalidateAcademy(qc),
  });
}

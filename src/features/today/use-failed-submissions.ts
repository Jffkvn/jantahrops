import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissFailedSubmission,
  getFailedSubmissions,
  recoverFailedSubmission,
  type FailedSubmission,
} from './failed-submissions-api';

const FAILED_KEY = ['today', 'failed-submissions'] as const;

export function useFailedSubmissions() {
  return useQuery({
    queryKey: FAILED_KEY,
    queryFn: getFailedSubmissions,
    staleTime: 15_000,
  });
}

export function useRecoverSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: FailedSubmission) => recoverFailedSubmission(item),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: FAILED_KEY }),
        qc.invalidateQueries({ queryKey: ['new-arrivals'] }),
        qc.invalidateQueries({ queryKey: ['today', 'new-arrivals'] }),
        qc.invalidateQueries({ queryKey: ['applications'] }),
        qc.invalidateQueries({ queryKey: ['candidates'] }),
        qc.invalidateQueries({ queryKey: ['leads'] }),
      ]);
    },
  });
}

export function useDismissFailedSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: FailedSubmission) => dismissFailedSubmission(item),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: FAILED_KEY });
    },
  });
}

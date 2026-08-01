import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { refreshAndListSignals, dismissSignal } from './signals-api';

export function useSignals() {
  return useQuery({
    queryKey: ['signals'],
    queryFn: refreshAndListSignals,
    staleTime: 30_000,
  });
}

export function useDismissSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissSignal(id),
    // Optimistically drop the dismissed signal so it disappears immediately.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['signals'] });
      const prev = qc.getQueryData(['signals']);
      qc.setQueryData(['signals'], (old: unknown) =>
        Array.isArray(old) ? old.filter((s) => (s as { id: string }).id !== id) : old,
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['signals'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['signals'] }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNewArrivals, markReviewed, type Arrival } from './new-arrivals-api';

const KEY = ['new-arrivals'] as const;

export function useNewArrivals() {
  return useQuery({ queryKey: KEY, queryFn: getNewArrivals, staleTime: 15_000 });
}

export function useMarkReviewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Arrival[]) => markReviewed(items),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

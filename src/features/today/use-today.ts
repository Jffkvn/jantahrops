import { useQuery } from '@tanstack/react-query';
import { getDayView } from './today-api';

export function useDayView() {
  return useQuery({
    queryKey: ['day-view'],
    queryFn: getDayView,
    // The day view is the first thing seen each session; keep it fresh.
    staleTime: 15_000,
  });
}

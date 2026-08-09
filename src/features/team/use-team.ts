import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

/**
 * The active team, for every owner/assignee picker in the product.
 *
 * One definition, one cache key: leads, recruitment and tasks all read the same
 * list, so a deactivated colleague disappears from all three at once.
 */
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

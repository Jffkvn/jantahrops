import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  updateCompanyProfile,
  listAllProfiles,
  updateTeamMember,
  type CompanyProfileInput,
} from './settings-api';
import type { UserRole } from '@/types/database';

export function useAllProfiles() {
  return useQuery({ queryKey: ['settings', 'profiles'], queryFn: listAllProfiles });
}

export function useUpdateCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: CompanyProfileInput) => updateCompanyProfile(patch),
    onSuccess: () => {
      // Every issued document reads this row, and the print view caches it.
      void qc.invalidateQueries({ queryKey: ['company-profile'] });
      // The internal day rate lives here too, and every project's estimated
      // profit is computed from it.
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      patch: { role?: UserRole; is_active?: boolean; full_name?: string };
    }) => updateTeamMember(vars.id, vars.patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'profiles'] });
      // Owner and assignee pickers everywhere read the shared team list.
      void qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

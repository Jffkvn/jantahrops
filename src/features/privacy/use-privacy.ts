import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteLead, erasePerson, getErasurePreview } from './privacy-api';

export function useErasurePreview(contactId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['erasure-preview', contactId],
    queryFn: () => getErasurePreview(contactId),
    enabled,
    // Always fresh: this is what the admin is about to delete.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useErasePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { contactId: string; files: string[] }) =>
      erasePerson(vars.contactId, vars.files),
    // A person can appear anywhere (leads, talent pool, day view, search), so
    // refetch everything rather than guess which lists held them.
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => deleteLead(leadId),
    onSuccess: () => qc.invalidateQueries(),
  });
}

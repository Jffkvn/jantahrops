import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listContacts,
  getContact,
  getContactFootprint,
  getContactTimeline,
  addContactNote,
  updateContact,
  resolveCandidateReview,
  listOrganisations,
  getOrganisation,
  createOrganisation,
  updateOrganisation,
  createContact,
  type ListContactsParams,
  type ListOrganisationsParams,
  type UpdateContactInput,
  type UpsertOrganisationInput,
} from './directory-api';

const keys = {
  contacts: ['contacts'] as const,
  contactList: (p: ListContactsParams) => ['contacts', 'list', p] as const,
  contact: (id: string) => ['contacts', id] as const,
  footprint: (id: string) => ['contacts', id, 'footprint'] as const,
  timeline: (id: string) => ['contacts', id, 'timeline'] as const,
  orgs: ['organisations'] as const,
  orgList: (p: ListOrganisationsParams) => ['organisations', 'list', p] as const,
  org: (id: string) => ['organisations', id] as const,
};

export function useContactsList(params: ListContactsParams) {
  return useQuery({ queryKey: keys.contactList(params), queryFn: () => listContacts(params) });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: keys.contact(id ?? ''),
    queryFn: () => getContact(id!),
    enabled: Boolean(id),
  });
}

export function useContactFootprint(id: string | null) {
  return useQuery({
    queryKey: keys.footprint(id ?? ''),
    queryFn: () => getContactFootprint(id!),
    enabled: Boolean(id),
  });
}

export function useContactTimeline(id: string | null) {
  return useQuery({
    queryKey: keys.timeline(id ?? ''),
    queryFn: () => getContactTimeline(id!),
    enabled: Boolean(id),
  });
}

export function useAddContactNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addContactNote(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.timeline(id) }),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateContactInput) => updateContact(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.contacts });
      void qc.invalidateQueries({ queryKey: keys.contact(id) });
      // A renamed contact changes what the talent pool shows.
      void qc.invalidateQueries({ queryKey: ['candidates'] });
    },
  });
}

export function useResolveCandidateReview(contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => resolveCandidateReview(contactId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['candidates'] });
      void qc.invalidateQueries({ queryKey: keys.footprint(contactId) });
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.contacts }),
  });
}

export function useOrganisationsList(params: ListOrganisationsParams) {
  return useQuery({ queryKey: keys.orgList(params), queryFn: () => listOrganisations(params) });
}

export function useOrganisation(id: string | null) {
  return useQuery({
    queryKey: keys.org(id ?? ''),
    queryFn: () => getOrganisation(id!),
    enabled: Boolean(id),
  });
}

export function useCreateOrganisation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertOrganisationInput) => createOrganisation(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.orgs }),
  });
}

export function useUpdateOrganisation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UpsertOrganisationInput>) => updateOrganisation(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.orgs });
      void qc.invalidateQueries({ queryKey: keys.org(id) });
    },
  });
}

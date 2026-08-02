import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listDocumentsPaginated,
  getFinanceSummary,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategorySummary,
  issueDocument,
  acceptQuote,
  rejectQuote,
  convertToInvoice,
  recordPayment,
  addLine,
  updateLine,
  removeLine,
  recalcTotals,
  createDraftDocument,
  updateDraftDocument,
  getDocument,
  getExpense,
  getCompanyProfile,
  listOrganisations,
  listContactsForOrganisation,
  getDocumentTimeline,
  updateEfris,
  deleteDraftDocument,
  type ListDocumentsParams,
  type CreateDraftDocumentInput,
  type UpdateDraftDocumentInput,
  type RecordPaymentInput,
  type AddLineInput,
  type UpdateLineInput,
  type CreateExpenseInput,
  type UpdateExpenseInput,
  type ListExpensesParams,
} from './finance-api';

const financeKeys = {
  all: ['finance'] as const,
  summary: ['finance', 'summary'] as const,
  documents: (p: ListDocumentsParams) => ['finance', 'documents', p] as const,
  document: (id: string) => ['finance', 'document', id] as const,
  expenses: (p: ListExpensesParams) => ['finance', 'expenses', p] as const,
  expenseSummary: (month: string) => ['finance', 'expenses', 'summary', month] as const,
};

export function useFinanceSummary() {
  return useQuery({ queryKey: financeKeys.summary, queryFn: getFinanceSummary });
}

export function useDocuments(params: ListDocumentsParams) {
  return useQuery({
    queryKey: financeKeys.documents(params),
    queryFn: () => listDocumentsPaginated(params),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: financeKeys.document(id),
    queryFn: () => getDocument(id),
    enabled: Boolean(id),
  });
}

export function useIssueDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => issueDocument(docId),
    onSuccess: (_num, docId) => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      void qc.invalidateQueries({ queryKey: financeKeys.document(docId) });
    },
  });
}

export function useAcceptQuote(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => acceptQuote(docId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      void qc.invalidateQueries({ queryKey: financeKeys.document(docId) });
    },
  });
}

export function useRejectQuote(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rejectQuote(docId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      void qc.invalidateQueries({ queryKey: financeKeys.document(docId) });
    },
  });
}

export function useConvertToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => convertToInvoice(sourceId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => recordPayment(input),
    onSuccess: (_payment, input) => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      void qc.invalidateQueries({ queryKey: financeKeys.document(input.document_id) });
    },
  });
}

export function useCreateDraftDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDraftDocumentInput) => createDraftDocument(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
  });
}

export function useUpdateDraftDocument(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateDraftDocumentInput) => updateDraftDocument(docId, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      void qc.invalidateQueries({ queryKey: financeKeys.document(docId) });
    },
  });
}

export function useCompanyProfile() {
  return useQuery({ queryKey: ['company-profile'], queryFn: getCompanyProfile });
}

export function useOrganisations(search: string) {
  return useQuery({
    queryKey: ['organisations', 'search', search],
    queryFn: () => listOrganisations(search),
    placeholderData: (prev) => prev,
  });
}

export function useContactsForOrganisation(organisationId: string | null) {
  return useQuery({
    queryKey: ['contacts', 'for-org', organisationId],
    queryFn: () => listContactsForOrganisation(organisationId!),
    enabled: Boolean(organisationId),
  });
}

export function useDocumentTimeline(docId: string) {
  return useQuery({
    queryKey: ['finance', 'document', docId, 'timeline'],
    queryFn: () => getDocumentTimeline(docId),
    enabled: Boolean(docId),
  });
}

export function useUpdateEfris(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: {
      efris_fdn?: string | null;
      efris_qr_url?: string | null;
      efris_status?: string;
    }) => updateEfris(docId, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
      void qc.invalidateQueries({ queryKey: financeKeys.document(docId) });
    },
  });
}

export function useDeleteDraftDocument(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteDraftDocument(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
  });
}

export function useAddLine(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<AddLineInput, 'document_id'>) =>
      addLine({ ...input, document_id: docId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.document(docId) }),
  });
}

export function useUpdateLine(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLineInput) => updateLine(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.document(docId) }),
  });
}

export function useRemoveLine(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => removeLine(lineId),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.document(docId) }),
  });
}

export function useRecalcTotals(docId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recalcTotals(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.document(docId) }),
  });
}

// --- expenses --------------------------------------------------------------

export function useExpenses(params: ListExpensesParams) {
  return useQuery({
    queryKey: financeKeys.expenses(params),
    queryFn: () => listExpenses(params),
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: ['finance', 'expense', id],
    queryFn: () => getExpense(id),
    enabled: Boolean(id),
  });
}

export function useExpenseCategorySummary(month: string) {
  return useQuery({
    queryKey: financeKeys.expenseSummary(month),
    queryFn: () => getExpenseCategorySummary(month),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => createExpense(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useUpdateExpense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateExpenseInput) => updateExpense(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

export function useDeleteExpense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteExpense(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

import type { DocumentType, DocumentStatus, ExpenseCategory } from '@/types/database';

export interface DocumentTypeMeta {
  value: DocumentType;
  label: string;
  /** Shown on the print view when vat_registered for invoices. */
  printTitle: string;
  tone: 'info' | 'warning' | 'success' | 'neutral';
}

export const DOCUMENT_TYPES: DocumentTypeMeta[] = [
  { value: 'quote', label: 'Quote', printTitle: 'Quotation', tone: 'info' },
  { value: 'lpo', label: 'LPO', printTitle: 'Local Purchase Order', tone: 'neutral' },
  { value: 'invoice', label: 'Invoice', printTitle: 'Tax Invoice', tone: 'success' },
  { value: 'receipt', label: 'Receipt', printTitle: 'Receipt', tone: 'neutral' },
];

const TYPE_BY_VALUE = new Map(DOCUMENT_TYPES.map((t) => [t.value, t]));

export function documentTypeMeta(value: DocumentType): DocumentTypeMeta {
  return TYPE_BY_VALUE.get(value) ?? DOCUMENT_TYPES[0]!;
}

export interface DocumentStatusMeta {
  value: DocumentStatus;
  label: string;
  tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
}

export const DOCUMENT_STATUSES: DocumentStatusMeta[] = [
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'issued', label: 'Issued', tone: 'info' },
  { value: 'accepted', label: 'Accepted', tone: 'info' },
  { value: 'rejected', label: 'Rejected', tone: 'danger' },
  { value: 'part_paid', label: 'Part paid', tone: 'warning' },
  { value: 'paid', label: 'Paid', tone: 'success' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
  { value: 'expired', label: 'Expired', tone: 'danger' },
];

const STATUS_BY_VALUE = new Map(DOCUMENT_STATUSES.map((s) => [s.value, s]));

export function documentStatusMeta(value: DocumentStatus): DocumentStatusMeta {
  return STATUS_BY_VALUE.get(value) ?? DOCUMENT_STATUSES[0]!;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Software subscriptions',
  'Internet',
  'Travel',
  'Marketing',
  'Printing',
  'Training materials',
  'Contractor payments',
  'Office costs',
  'Miscellaneous',
];

/** Current month as YYYY-MM in Kampala, for expense filters/summary. */
export function currentMonth(): string {
  const now = new Date();
  const offset = 3 * 60; // EAT = UTC+3, no DST
  const kampala = new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + offset * 60_000);
  return kampala.toISOString().slice(0, 7);
}

import type { CohortStatus, DeliveryMode, EnrolmentStatus } from '@/types/database';

export const DELIVERY_LABELS: Record<DeliveryMode, string> = {
  live_online: 'Live online',
  in_person: 'In person',
  self_paced: 'Self-paced',
  hybrid: 'Hybrid',
};

export const COHORT_STATUS_LABELS: Record<CohortStatus, string> = {
  planned: 'Planned',
  open: 'Open for enrolment',
  running: 'Running',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const COHORT_STATUS_TONE: Record<CohortStatus, string> = {
  planned: 'bg-surface-sunken text-ink-secondary',
  open: 'bg-success-soft text-success',
  running: 'bg-info-soft text-info',
  completed: 'bg-primary-soft text-primary',
  cancelled: 'bg-surface-sunken text-ink-muted',
};

export const ENROLMENT_LABELS: Record<EnrolmentStatus, string> = {
  registered: 'Registered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  active: 'Active',
  completed: 'Completed',
  dropped: 'Dropped',
};

/**
 * `registered` is amber on purpose: it means a place is held that nobody has
 * been billed for. On a cohort roster that is the line that costs money, so it
 * should be the line that catches the eye.
 */
export const ENROLMENT_TONE: Record<EnrolmentStatus, string> = {
  registered: 'bg-warning-soft text-warning',
  invoiced: 'bg-info-soft text-info',
  paid: 'bg-success-soft text-success',
  active: 'bg-success-soft text-success',
  completed: 'bg-primary-soft text-primary',
  dropped: 'bg-surface-sunken text-ink-muted',
};

/** Statuses a person may set by hand. `paid` is owned by invoice settlement. */
export const MANUAL_ENROLMENT_STATUSES: Exclude<EnrolmentStatus, 'paid'>[] = [
  'registered',
  'invoiced',
  'active',
  'completed',
  'dropped',
];

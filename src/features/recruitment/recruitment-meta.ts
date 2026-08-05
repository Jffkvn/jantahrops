import type {
  ApplicationStage,
  AvailabilityStatus,
  EmploymentType,
  VacancyStatus,
} from '@/types/database';

export interface PipelineStageMeta {
  value: ApplicationStage;
  label: string;
  /** Default tone for the status chip. */
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  /** Whether the column participates in the Kanban pipeline. */
  onBoard: boolean;
}

export const PIPELINE_STAGES: PipelineStageMeta[] = [
  { value: 'new', label: 'New', tone: 'info', onBoard: true },
  { value: 'screened', label: 'Screened', tone: 'info', onBoard: true },
  { value: 'shortlisted', label: 'Shortlisted', tone: 'success', onBoard: true },
  { value: 'interview_scheduled', label: 'Interview scheduled', tone: 'warning', onBoard: true },
  { value: 'interviewed', label: 'Interviewed', tone: 'warning', onBoard: true },
  { value: 'offered', label: 'Offered', tone: 'success', onBoard: true },
  { value: 'hired', label: 'Hired', tone: 'success', onBoard: true },
  { value: 'rejected', label: 'Rejected', tone: 'danger', onBoard: false },
  { value: 'talent_pool', label: 'Talent pool', tone: 'neutral', onBoard: false },
];

const STAGE_MAP: Record<ApplicationStage, PipelineStageMeta> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.value, s]),
) as Record<ApplicationStage, PipelineStageMeta>;

export function stageMeta(stage: ApplicationStage): PipelineStageMeta {
  return STAGE_MAP[stage] ?? { value: stage, label: stage, tone: 'neutral', onBoard: true };
}

export const BOARD_STAGES: PipelineStageMeta[] = PIPELINE_STAGES.filter((s) => s.onBoard);

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
};

export const VACANCY_STATUS_LABELS: Record<VacancyStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  paused: 'Paused',
  closed: 'Closed',
};

export const VACANCY_STATUS_TONES: Record<VacancyStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  open: 'success',
  paused: 'warning',
  closed: 'danger',
};

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  immediate: 'Immediate',
  one_month: '1 month',
  three_months: '3 months',
  not_looking: 'Not looking',
};

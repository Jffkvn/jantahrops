import type { MilestoneStatus, ProjectStage } from '@/types/database';

export const STAGE_LABELS: Record<ProjectStage, string> = {
  planned: 'Planned',
  active: 'Active',
  waiting_on_client: 'Waiting on client',
  under_review: 'Under review',
  completed: 'Completed',
  archived: 'Archived',
};

/**
 * "Waiting on client" is amber rather than neutral on purpose. It is the stage
 * a consultancy project actually dies in — it looks like progress because it is
 * not your fault, and then a month goes by. It should catch the eye.
 */
export const STAGE_TONE: Record<ProjectStage, string> = {
  planned: 'bg-surface-sunken text-ink-secondary',
  active: 'bg-success-soft text-success',
  waiting_on_client: 'bg-warning-soft text-warning',
  under_review: 'bg-info-soft text-info',
  completed: 'bg-primary-soft text-primary',
  archived: 'bg-surface-sunken text-ink-muted',
};

export const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
};

export const MILESTONE_TONE: Record<MilestoneStatus, string> = {
  pending: 'bg-surface-sunken text-ink-secondary',
  in_progress: 'bg-info-soft text-info',
  done: 'bg-success-soft text-success',
  blocked: 'bg-danger-soft text-danger',
};

/** The kinds of work JantaHR actually sells. */
export const PROJECT_TYPES = [
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'training', label: 'Training' },
  { value: 'hr_setup', label: 'HR setup' },
  { value: 'advisory', label: 'Advisory' },
  { value: 'other', label: 'Other' },
] as const;

export function projectTypeLabel(value: string | null): string | null {
  if (!value) return null;
  return PROJECT_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** Half-day steps, which is the whole point of logging in days. */
export const DAY_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5] as const;

export function formatDays(days: number): string {
  const n = Number(days);
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${rounded} ${n === 1 ? 'day' : 'days'}`;
}

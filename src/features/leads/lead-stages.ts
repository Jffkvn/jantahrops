import type { LeadStage } from '@/types/database';

export interface StageMeta {
  value: LeadStage;
  label: string;
  /** StatusChip variant for this stage. */
  tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
  /** Shown on the board as columns, in this order. */
  onBoard: boolean;
}

/**
 * The pipeline, in order. `won`, `lost` and `dormant` are terminal — they exist
 * as stages but are not board columns, because a Kanban of active work should
 * not carry three graveyards. They remain filterable in the table view.
 */
export const LEAD_STAGES: StageMeta[] = [
  { value: 'new', label: 'New', tone: 'info', onBoard: true },
  { value: 'contacted', label: 'Contacted', tone: 'info', onBoard: true },
  { value: 'qualified', label: 'Qualified', tone: 'info', onBoard: true },
  { value: 'proposal_sent', label: 'Proposal Sent', tone: 'warning', onBoard: true },
  { value: 'negotiation', label: 'Negotiation', tone: 'warning', onBoard: true },
  { value: 'won', label: 'Won', tone: 'success', onBoard: false },
  { value: 'lost', label: 'Lost', tone: 'danger', onBoard: false },
  { value: 'dormant', label: 'Dormant', tone: 'neutral', onBoard: false },
];

export const BOARD_STAGES = LEAD_STAGES.filter((s) => s.onBoard);

const NEW_STAGE = LEAD_STAGES[0]!;
const STAGE_BY_VALUE = new Map(LEAD_STAGES.map((s) => [s.value, s]));

export function stageMeta(value: LeadStage): StageMeta {
  return STAGE_BY_VALUE.get(value) ?? NEW_STAGE;
}

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

export const VACANCY_CATEGORIES = [
  'Human Resources',
  'Finance & Accounting',
  'Technology & Engineering',
  'Sales & Business Development',
  'Operations & Logistics',
  'General Management',
] as const;

export interface ParsedVacancyDescription {
  category: string;
  clientLabel: string;
  aboutRole: string;
  responsibilities: string;
}

export function parseVacancyDescription(raw: string | null | undefined): ParsedVacancyDescription {
  if (!raw) {
    return { category: '', clientLabel: '', aboutRole: '', responsibilities: '' };
  }

  let text = raw.replace(/\r\n/g, '\n').trim();
  let category = '';
  let clientLabel = '';

  const catMatch = /^\[Category:\s*([^\]]+)\]\s*\n?/i.exec(text);
  if (catMatch) {
    category = (catMatch[1] ?? '').trim();
    text = text.slice(catMatch[0].length).trim();
  }

  const clientMatch = /^\[Client:\s*([^\]]+)\]\s*\n?/i.exec(text);
  if (clientMatch) {
    clientLabel = (clientMatch[1] ?? '').trim();
    text = text.slice(clientMatch[0].length).trim();
  }

  // Strip a redundant leading "About the Role" line if present
  text = text.replace(/^about\s+the\s+role\s*\n+/i, '').trim();

  let aboutRole = text;
  let responsibilities = '';

  const splitRegex = /\n+(?:###\s*What You['’]ll Do|What You['’]ll Do|###\s*Key Responsibilities|Key Responsibilities)\s*\n+/i;
  const parts = text.split(splitRegex);
  if (parts.length >= 2) {
    aboutRole = (parts[0] ?? '').trim();
    responsibilities = parts
      .slice(1)
      .join('\n')
      .split('\n')
      .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean)
      .join('\n');
  }

  return { category, clientLabel, aboutRole, responsibilities };
}

export function serializeVacancyDescription(input: ParsedVacancyDescription): string | null {
  const headerLines: string[] = [];
  if (input.category.trim()) {
    headerLines.push(`[Category: ${input.category.trim()}]`);
  }
  if (input.clientLabel.trim()) {
    headerLines.push(`[Client: ${input.clientLabel.trim()}]`);
  }

  const about = input.aboutRole
    .replace(/\r\n/g, '\n')
    .replace(/^about\s+the\s+role\s*\n+/i, '')
    .trim();

  const respBullets = input.responsibilities
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => `• ${line}`)
    .join('\n');

  const sections: string[] = [];
  if (headerLines.length > 0) sections.push(headerLines.join('\n'));
  if (about) sections.push(about);
  if (respBullets) sections.push(`### What You'll Do\n${respBullets}`);

  const combined = sections.join('\n\n').trim();
  return combined.length > 0 ? combined : null;
}


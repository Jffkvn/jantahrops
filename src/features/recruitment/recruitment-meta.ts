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

const ASSIGNABLE_VACANCY_RANK: Partial<Record<VacancyStatus, number>> = {
  open: 0,
  draft: 1,
  paused: 2,
};

/** Filters out closed vacancies and orders open, then draft, then paused. */
export function assignableVacancies<T extends { status: VacancyStatus }>(vacancies: readonly T[]): T[] {
  return vacancies
    .filter((v) => v.status !== 'closed')
    .map((vacancy, index) => ({ vacancy, index }))
    .sort((a, b) => {
      const rankDiff =
        (ASSIGNABLE_VACANCY_RANK[a.vacancy.status] ?? 99) -
        (ASSIGNABLE_VACANCY_RANK[b.vacancy.status] ?? 99);
      return rankDiff !== 0 ? rankDiff : a.index - b.index;
    })
    .map(({ vacancy }) => vacancy);
}

/** Formats a vacancy label for assignment dropdowns, tagging non-open statuses. */
export function formatAssignableVacancyLabel(vacancy: {
  title: string;
  status: VacancyStatus;
}): string {
  if (vacancy.status === 'open') return vacancy.title;
  return `${vacancy.title} (${VACANCY_STATUS_LABELS[vacancy.status]})`;
}

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

const FORWARDING_EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
export const MAX_FORWARDING_EMAILS = 5;

export function parseForwardingEmails(raw: string): { valid: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const valid: string[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];

  for (const part of parts) {
    if (!FORWARDING_EMAIL_RE.test(part)) {
      invalid.push(part);
      continue;
    }
    if (!seen.has(part)) {
      seen.add(part);
      valid.push(part);
    }
  }

  return { valid, invalid };
}

export function formatForwardingEmails(emails: readonly string[] | null | undefined): string {
  return (emails ?? []).map((e) => e.trim()).filter(Boolean).join(', ');
}


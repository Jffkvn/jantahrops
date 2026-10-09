// JantaHR Ops — the email the team gets when a candidate registers or applies
// on the website. Pure formatting (no Deno, no I/O) so it can be unit tested.

import { type Block, formatEat, type RenderedEmail, renderEmail } from './email-layout.ts';

export interface ScreeningQuestion {
  id: string;
  question: string;
}

export interface CandidateAlertInput {
  fullName: string;
  email: string | null;
  phone: string | null;
  headline?: string | null;
  yearsExperience?: number | null;
  salaryExpectationUgx?: number | null;
  availability?: string | null;
  skills?: string[];
  hasCv: boolean;
  /** 'application' = an application was created; 'talent_pool' = no vacancy involved;
   *  'vacancy_unavailable' = a slug was given but it is not an open, public vacancy. */
  outcome: 'application' | 'talent_pool' | 'vacancy_unavailable';
  vacancyTitle?: string | null;
  vacancySlug?: string | null;
  screeningQuestions?: ScreeningQuestion[];
  screeningAnswers?: Record<string, unknown> | null;
  notes?: string | null;
  submittedAt: string;
  /** Set when the form matched an existing contact whose details differ. */
  existingContact?: { name: string; differences: string[] } | null;
  /** Direct link to the application or candidate in Ops, when Ops is hosted. */
  opsLink?: string | null;
}

const MAX_NOTES_CHARS = 4000;

export function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return '(no answer)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return value.trim() === '' ? '(no answer)' : value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '(no answer)';
  if (Array.isArray(value)) {
    const parts = value.map((v) => formatAnswer(v)).filter((v) => v !== '(no answer)');
    return parts.length ? parts.join(', ') : '(no answer)';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '(unreadable answer)';
  }
}

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

function formatUgx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`;
}

export function buildCandidateAlert(input: CandidateAlertInput): RenderedEmail {
  const name = oneLine(input.fullName) || 'Unnamed candidate';
  const role = oneLine(input.vacancyTitle ?? '') || oneLine(input.vacancySlug ?? '');

  let subject: string;
  let heading: string;
  let nextStep: string;
  switch (input.outcome) {
    case 'application':
      subject = `New application: ${name} — ${role || 'vacancy'}`;
      heading = `New job application${role ? ` for ${role}` : ''}`;
      nextStep = `Open JantaHR Ops → Recruitment → ${role || 'the vacancy'} to review.`;
      break;
    case 'vacancy_unavailable':
      subject = `New candidate: ${name} (vacancy ${role || 'unknown'} is not open)`;
      heading = 'New candidate for a vacancy that is not open';
      nextStep = `They applied for "${role || 'unknown'}", which is not an open public vacancy, so they were added to the talent pool. Open JantaHR Ops → Talent Pool to review.`;
      break;
    default:
      subject = `New talent pool registration: ${name}`;
      heading = 'New talent pool registration';
      nextStep = 'Open JantaHR Ops → Talent Pool to review.';
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Name', value: name },
    { label: 'Email', value: input.email || '(none)' },
    { label: 'Phone', value: input.phone || '(none)' },
  ];
  if (input.headline) rows.push({ label: 'Headline', value: oneLine(input.headline) });
  if (Number.isFinite(input.yearsExperience)) {
    rows.push({ label: 'Years of experience', value: String(input.yearsExperience) });
  }
  if (Number.isFinite(input.salaryExpectationUgx)) {
    rows.push({ label: 'Salary expectation', value: formatUgx(input.salaryExpectationUgx as number) });
  }
  if (input.availability) rows.push({ label: 'Availability', value: oneLine(input.availability) });
  if (input.skills && input.skills.length) rows.push({ label: 'Skills', value: input.skills.join(', ') });
  rows.push({ label: 'CV', value: input.hasCv ? 'Uploaded, open it in Ops' : 'Not provided' });
  rows.push({ label: 'Submitted', value: formatEat(input.submittedAt) });

  if (input.existingContact) {
    rows.push({
      label: 'Matched contact',
      value: `"${input.existingContact.name}" is already in Ops with the same email or phone. The form gave ${input.existingContact.differences.join(' and ')}. The contact was not changed. Check it in Ops.`,
    });
  }
  const blocks: Block[] = [{ kind: 'details', rows }];

  // Screening answers, in the vacancy's question order, then any extras.
  const answers = input.screeningAnswers ?? {};
  const answerKeys = Object.keys(answers);
  if (answerKeys.length) {
    const answerRows: { label: string; value: string }[] = [];
    const asked = new Set<string>();
    for (const q of input.screeningQuestions ?? []) {
      asked.add(q.id);
      answerRows.push({ label: oneLine(q.question), value: formatAnswer(answers[q.id]) });
    }
    for (const key of answerKeys) {
      if (!asked.has(key)) answerRows.push({ label: key, value: formatAnswer(answers[key]) });
    }
    blocks.push({ kind: 'heading', text: 'Screening answers' }, { kind: 'details', rows: answerRows });
  }

  const notes = (input.notes ?? '').trim();
  if (notes) {
    const clipped =
      notes.length > MAX_NOTES_CHARS
        ? `${notes.slice(0, MAX_NOTES_CHARS)}\n… (shortened, full text in Ops)`
        : notes;
    blocks.push({ kind: 'quote', title: 'Cover letter and notes', text: clipped });
  }

  blocks.push(
    input.opsLink
      ? { kind: 'button', label: 'Open in JantaHR Ops', url: input.opsLink }
      : { kind: 'paragraph', text: nextStep },
  );

  return renderEmail(subject, { audience: 'team', preheader: `${name} · ${role || 'talent pool'}`, heading, blocks });
}

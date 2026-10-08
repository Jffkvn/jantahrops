// JantaHR Ops — the email the team gets when a candidate registers or applies
// on the website. Pure formatting (no Deno, no I/O) so it can be unit tested.

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

export function buildCandidateAlert(input: CandidateAlertInput): { subject: string; text: string } {
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
      heading = `Candidate applied for "${role || 'unknown'}", which is not an open public vacancy. Added to the talent pool instead.`;
      nextStep = 'Open JantaHR Ops → Talent Pool to review.';
      break;
    default:
      subject = `New talent pool registration: ${name}`;
      heading = 'New talent pool registration';
      nextStep = 'Open JantaHR Ops → Talent Pool to review.';
  }

  const lines: string[] = [heading, '', `Name: ${name}`];
  lines.push(`Email: ${input.email || '(none)'}`);
  lines.push(`Phone: ${input.phone || '(none)'}`);
  if (input.headline) lines.push(`Headline: ${oneLine(input.headline)}`);
  if (Number.isFinite(input.yearsExperience)) lines.push(`Years of experience: ${input.yearsExperience}`);
  if (Number.isFinite(input.salaryExpectationUgx)) {
    lines.push(`Salary expectation: ${formatUgx(input.salaryExpectationUgx as number)}`);
  }
  if (input.availability) lines.push(`Availability: ${oneLine(input.availability)}`);
  if (input.skills && input.skills.length) lines.push(`Skills: ${input.skills.join(', ')}`);
  lines.push(`CV: ${input.hasCv ? 'uploaded, open it in Ops' : 'not provided'}`);
  lines.push(`Submitted: ${input.submittedAt}`);

  // Screening answers, in the vacancy's question order, then any extras.
  const answers = input.screeningAnswers ?? {};
  const answerKeys = Object.keys(answers);
  if (answerKeys.length) {
    lines.push('', 'Screening answers:');
    const asked = new Set<string>();
    for (const q of input.screeningQuestions ?? []) {
      asked.add(q.id);
      lines.push(`- ${oneLine(q.question)}`, `  ${formatAnswer(answers[q.id])}`);
    }
    for (const key of answerKeys) {
      if (!asked.has(key)) lines.push(`- ${key}`, `  ${formatAnswer(answers[key])}`);
    }
  }

  const notes = (input.notes ?? '').trim();
  if (notes) {
    const clipped =
      notes.length > MAX_NOTES_CHARS
        ? `${notes.slice(0, MAX_NOTES_CHARS)}\n… (shortened, full text in Ops)`
        : notes;
    lines.push('', 'Cover letter and notes:', clipped);
  }

  lines.push('', nextStep);
  if (input.email) lines.push('Reply to this email to answer the candidate directly.');

  return { subject: subject.slice(0, 200), text: lines.join('\n') };
}

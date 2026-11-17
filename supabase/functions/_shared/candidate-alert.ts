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

const AVAILABILITY_DISPLAY: Record<string, string> = {
  immediate: 'Immediate',
  two_weeks: '2 weeks',
  '14_days': '2 weeks',
  one_month: '1 month (30 days)',
  '30_days': '1 month (30 days)',
  three_months: '3 months (90 days)',
  '90_days': '3 months (90 days)',
  not_looking: 'Not actively looking',
};

function formatAvailability(raw: string | null | undefined): string | null {
  const clean = (raw ?? '').trim();
  if (!clean) return null;
  const key = clean.toLowerCase();
  return AVAILABILITY_DISPLAY[key] ?? clean.replace(/_/g, ' ');
}

export interface ParsedApplicationNotes {
  coverLetterText: string | null;
  coverLetterPath: string | null;
  linkedinUrl: string | null;
  location: string | null;
  extraNotes: string | null;
}

/**
 * Extracts structured [Cover Letter], [LinkedIn], and [Location] sections
 * written by the jantahr.com application form from `applications.notes`.
 */
export function parseApplicationNotes(notes: string | null | undefined): ParsedApplicationNotes {
  const raw = (notes ?? '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    return {
      coverLetterText: null,
      coverLetterPath: null,
      linkedinUrl: null,
      location: null,
      extraNotes: null,
    };
  }

  let coverLetterText: string | null = null;
  let coverLetterPath: string | null = null;
  let linkedinUrl: string | null = null;
  let location: string | null = null;
  const extraParts: string[] = [];

  // Split by known bracketed headers while preserving free-form fallback.
  const chunks = raw.split(/\n*(?=\[(?:Cover Letter|LinkedIn|Location)\]\s*\n)/i);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (/^\[Cover Letter\]\s*\n/i.test(trimmed)) {
      const val = trimmed.replace(/^\[Cover Letter\]\s*\n/i, '').trim();
      const uploadMatch = /^Cover Letter Document Uploaded:\s*(cvs\/[^\s]+)$/i.exec(val);
      if (uploadMatch) {
        coverLetterPath = uploadMatch[1] ?? null;
      } else if (val) {
        coverLetterText = val;
      }
    } else if (/^\[LinkedIn\]\s*\n/i.test(trimmed)) {
      const val = trimmed.replace(/^\[LinkedIn\]\s*\n/i, '').trim();
      if (val) linkedinUrl = oneLine(val);
    } else if (/^\[Location\]\s*\n/i.test(trimmed)) {
      const val = trimmed.replace(/^\[Location\]\s*\n/i, '').trim();
      if (val) location = oneLine(val);
    } else {
      extraParts.push(trimmed);
    }
  }

  return {
    coverLetterText,
    coverLetterPath,
    linkedinUrl,
    location,
    extraNotes: extraParts.length ? extraParts.join('\n\n') : null,
  };
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
    const qaItems: { question: string; answer: string }[] = [];
    const asked = new Set<string>();
    for (const q of input.screeningQuestions ?? []) {
      asked.add(q.id);
      qaItems.push({ question: oneLine(q.question), answer: formatAnswer(answers[q.id]) });
    }
    for (const key of answerKeys) {
      if (!asked.has(key)) qaItems.push({ question: key, answer: formatAnswer(answers[key]) });
    }
    blocks.push({ kind: 'heading', text: 'Screening answers' }, { kind: 'qa', items: qaItems });
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

export interface ClientForwardInput {
  fullName: string;
  email: string | null;
  phone: string | null;
  headline?: string | null;
  yearsExperience?: number | null;
  salaryExpectationUgx?: number | null;
  availability?: string | null;
  skills?: string[];
  hasCv: boolean;
  cvAttached?: boolean;
  cvDownloadUrl?: string | null;
  coverLetterAttached?: boolean;
  coverLetterDownloadUrl?: string | null;
  vacancyTitle: string;
  screeningQuestions?: ScreeningQuestion[];
  screeningAnswers?: Record<string, unknown> | null;
  notes?: string | null;
  submittedAt: string;
}

/**
 * Formats a client-safe email when a vacancy forwards new applications to an
 * external client recipient. Excludes internal JantaHR Ops links and CRM
 * mismatch warnings, parses structured submission notes cleanly, and surfaces
 * CV / Cover Letter attachments and 7-day download links.
 */
export function buildClientForwardEmail(input: ClientForwardInput): RenderedEmail {
  const name = oneLine(input.fullName) || 'Unnamed candidate';
  const role = oneLine(input.vacancyTitle) || 'Open Role';
  const parsedNotes = parseApplicationNotes(input.notes);
  const formattedAvailability = formatAvailability(input.availability);

  const subject = `Candidate Application: ${name} — ${role}`;
  const heading = `Candidate Application: ${role}`;

  const rows: { label: string; value: string }[] = [
    { label: 'Candidate', value: name },
    { label: 'Email', value: input.email || '(not provided)' },
    { label: 'Phone', value: input.phone || '(not provided)' },
  ];
  if (parsedNotes.location) rows.push({ label: 'Location', value: parsedNotes.location });
  if (parsedNotes.linkedinUrl) rows.push({ label: 'LinkedIn', value: parsedNotes.linkedinUrl });
  if (input.headline) rows.push({ label: 'Headline', value: oneLine(input.headline) });
  if (Number.isFinite(input.yearsExperience)) {
    rows.push({ label: 'Years of experience', value: String(input.yearsExperience) });
  }
  if (Number.isFinite(input.salaryExpectationUgx)) {
    rows.push({ label: 'Salary expectation', value: formatUgx(input.salaryExpectationUgx as number) });
  }
  if (formattedAvailability) rows.push({ label: 'Availability', value: formattedAvailability });
  if (input.skills && input.skills.length) rows.push({ label: 'Skills', value: input.skills.join(', ') });

  let cvStatus = 'Not uploaded';
  if (input.cvAttached && input.cvDownloadUrl) cvStatus = 'Attached to this email (7-day link also below)';
  else if (input.cvAttached) cvStatus = 'Attached to this email';
  else if (input.cvDownloadUrl) cvStatus = 'Available via 7-day download link below';
  else if (input.hasCv) cvStatus = 'Uploaded (request copy from hello@jantahr.com)';
  rows.push({ label: 'CV / Resume', value: cvStatus });
  rows.push({ label: 'Submitted', value: formatEat(input.submittedAt) });

  const blocks: Block[] = [
    {
      kind: 'paragraph',
      text: `Please find below a new candidate application submitted via JantaHR for ${role}.`,
    },
    { kind: 'details', rows },
  ];

  // Screening answers in exact question order, extras last.
  const answers = input.screeningAnswers ?? {};
  const answerKeys = Object.keys(answers);
  if (answerKeys.length > 0) {
    const qaItems: { question: string; answer: string }[] = [];
    const asked = new Set<string>();
    for (const q of input.screeningQuestions ?? []) {
      asked.add(q.id);
      qaItems.push({ question: oneLine(q.question), answer: formatAnswer(answers[q.id]) });
    }
    for (const key of answerKeys) {
      if (!asked.has(key)) qaItems.push({ question: key, answer: formatAnswer(answers[key]) });
    }
    blocks.push({ kind: 'heading', text: 'Screening Answers' }, { kind: 'qa', items: qaItems });
  }

  const coverParts: string[] = [];
  if (parsedNotes.coverLetterText) coverParts.push(parsedNotes.coverLetterText);
  if (parsedNotes.extraNotes) coverParts.push(parsedNotes.extraNotes);
  const coverBody = coverParts.join('\n\n').trim();
  if (coverBody) {
    const clipped =
      coverBody.length > MAX_NOTES_CHARS
        ? `${coverBody.slice(0, MAX_NOTES_CHARS)}\n… (shortened; contact JantaHR for full text)`
        : coverBody;
    blocks.push({ kind: 'quote', title: 'Cover Letter', text: clipped });
  } else if (input.coverLetterAttached || input.coverLetterDownloadUrl) {
    blocks.push({
      kind: 'paragraph',
      text: input.coverLetterAttached
        ? 'The candidate uploaded a separate Cover Letter document (attached to this email).'
        : 'The candidate uploaded a separate Cover Letter document (download link below).',
    });
  }

  if (input.cvDownloadUrl) {
    blocks.push({ kind: 'button', label: 'Download Candidate CV', url: input.cvDownloadUrl });
  }
  if (input.coverLetterDownloadUrl) {
    blocks.push({ kind: 'button', label: 'Download Cover Letter', url: input.coverLetterDownloadUrl });
  }

  blocks.push({
    kind: 'callout',
    title: 'Want JantaHR to shortlist or schedule interviews?',
    text: 'For candidate privacy, download links remain valid for 7 days. Reply directly to this email to reach our recruitment team at hello@jantahr.com.',
  });

  return renderEmail(subject, {
    audience: 'client',
    preheader: `${name} applied for ${role} · View screening answers & CV`,
    heading,
    blocks,
  });
}

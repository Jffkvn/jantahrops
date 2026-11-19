// JantaHR Ops — failure alert email formatting for failed website submissions.
// Pure string formatting (no I/O or env reads), so it can be unit tested directly.

import { type Block, formatEat, type RenderedEmail, renderEmail } from './email-layout.ts';

export interface SubmissionFailureAlertInput {
  endpoint: 'public-candidates' | 'public-leads';
  submissionId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  targetLabel: string;
  cvPath?: string | null;
  errorSummary: string;
  submittedAt: string;
  opsUrl?: string | null;
}

/**
 * Extract a clean single-line error summary from Supabase/Postgres errors,
 * standard Error objects, or arbitrary thrown values.
 */
export function formatErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  let raw = '';
  if (typeof err === 'string') {
    raw = err;
  } else if (err instanceof Error) {
    raw = err.message || err.name;
  } else if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const parts = [
      typeof obj.code === 'string' && obj.code.trim() ? `[${obj.code.trim()}]` : '',
      typeof obj.message === 'string' ? obj.message.trim() : '',
      typeof obj.details === 'string' ? obj.details.trim() : '',
      typeof obj.hint === 'string' ? obj.hint.trim() : '',
    ].filter(Boolean);
    raw = parts.length > 0 ? parts.join(' ') : JSON.stringify(obj);
  } else {
    raw = String(err);
  }
  return raw.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 300) || 'Unknown error';
}

export function buildSubmissionFailureAlert(input: SubmissionFailureAlertInput): RenderedEmail {
  const cleanName = input.fullName.replace(/[\r\n]+/g, ' ').trim() || 'Unknown visitor';
  const cleanTarget = input.targetLabel.replace(/[\r\n]+/g, ' ').trim() || input.endpoint;
  const subject = `Failed website submission: ${cleanName} — ${cleanTarget}`;

  const rows: { label: string; value: string }[] = [
    { label: 'Name', value: cleanName },
    { label: 'Email', value: input.email || 'Not provided' },
    { label: 'Phone', value: input.phone || 'Not provided' },
    { label: 'Form / Role', value: cleanTarget },
    ...(input.cvPath ? [{ label: 'Uploaded CV', value: input.cvPath }] : []),
    { label: 'Error', value: formatErrorMessage(input.errorSummary) },
    { label: 'Submitted', value: formatEat(input.submittedAt) },
    { label: 'Submission ID', value: input.submissionId },
  ];

  const resolvedOpsUrl = input.opsUrl ?? null;
  const blocks: Block[] = [
    {
      kind: 'paragraph',
      text: `A website submission was recorded in web_submissions, but processing failed before the record was created. Their details${input.cvPath ? ' and uploaded CV' : ''} are preserved and can be recovered from the Today page in JantaHR Ops.`,
    },
    { kind: 'details', rows },
    ...(resolvedOpsUrl
      ? [{ kind: 'button' as const, label: 'Open Today in JantaHR Ops', url: resolvedOpsUrl }]
      : [{ kind: 'paragraph' as const, text: 'Open JantaHR Ops → Today to recover this submission.' }]),
  ];

  return renderEmail(subject, {
    audience: 'team',
    preheader: `${cleanName} · ${formatErrorMessage(input.errorSummary)}`.slice(0, 140),
    heading: 'Website submission failed',
    blocks,
  });
}

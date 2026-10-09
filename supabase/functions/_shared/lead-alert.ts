// JantaHR Ops — the email the team gets when a website lead arrives
// (AI training registration, contact enquiry). Pure formatting (no I/O).

import { type Block, formatEat, type RenderedEmail, renderEmail } from './email-layout.ts';

export interface LeadAlertInput {
  leadType: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  interest: string;
  message: string;
  sourcePage: string;
  submittedAt: string;
}

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

export function describeLeadType(leadType: string): { noun: string; interestLabel: string } {
  switch (leadType) {
    case 'ai_training':
      return { noun: 'AI training registration', interestLabel: 'Training unit' };
    case 'contact':
      return { noun: 'enquiry', interestLabel: 'Interested in' };
    default:
      return { noun: 'website lead', interestLabel: 'Interest' };
  }
}

export function buildLeadAlert(input: LeadAlertInput): RenderedEmail {
  const { noun, interestLabel } = describeLeadType(input.leadType);
  const name = oneLine(input.fullName) || 'Unnamed';
  const interest = oneLine(input.interest);

  const rows = [
    { label: 'Name', value: name },
    { label: 'Email', value: input.email || '(none)' },
    { label: 'Phone', value: input.phone || '(none)' },
    { label: 'Organisation', value: oneLine(input.organization) || '(none)' },
    { label: interestLabel, value: interest || '(not chosen)' },
    { label: 'Page', value: input.sourcePage || '(unknown)' },
    { label: 'Submitted', value: formatEat(input.submittedAt) },
  ];

  const blocks: Block[] = [{ kind: 'details', rows }];
  const message = input.message.trim();
  if (message) blocks.push({ kind: 'quote', title: 'Message', text: message.slice(0, 4000) });
  blocks.push({ kind: 'paragraph', text: 'The lead is in JantaHR Ops → Leads, in the New column.' });

  const heading = `New ${noun}`;
  return renderEmail(`New ${noun}: ${name}${interest ? ` — ${interest}` : ''}`, {
    audience: 'team',
    preheader: `${name}${interest ? ` · ${interest}` : ''}`,
    heading: heading.charAt(0).toUpperCase() + heading.slice(1),
    blocks,
  });
}

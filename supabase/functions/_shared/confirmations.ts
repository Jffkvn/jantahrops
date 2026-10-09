// JantaHR Ops — the confirmation email a person gets after submitting a form
// on jantahr.com. Pure formatting (no I/O).
//
// Security: these go to whatever address the visitor typed, so they must not
// become a spam relay. Only the visitor's first name (clamped) and values we
// control (vacancy title from our database, the training unit / interest from a
// fixed list, clamped) appear in them. Free text such as the message or cover
// letter is never echoed back.

import { BRAND } from './brand.ts';
import { type Block, type RenderedEmail, renderEmail } from './email-layout.ts';

function clamp(s: string | null | undefined, max: number): string {
  const one = (s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

export function firstName(fullName: string): string {
  const first = clamp(fullName, 80).split(' ')[0] ?? '';
  return clamp(first, 30);
}

function greeting(fullName: string): string {
  const name = firstName(fullName);
  return name ? `Thank you, ${name}` : 'Thank you';
}

const RIGHTS =
  `You can ask to see, correct or delete your information, or withdraw your consent, at any time by writing to ${BRAND.email}.`;

function candidateDataNotice(sharing: string): Block {
  return {
    kind: 'callout',
    title: 'How we look after your information',
    text:
      `Your CV and personal details are processed in line with the Uganda Data Protection and Privacy Act, 2019. ` +
      `${sharing} We keep them for up to ${BRAND.cvRetentionMonths} months, after which they are securely archived or deleted unless you renew your consent. ` +
      RIGHTS,
    link: { label: 'Read our Privacy Policy', url: BRAND.privacyUrl },
  };
}

export function applicationConfirmation(input: {
  fullName: string;
  vacancyTitle: string;
  hasCv: boolean;
}): RenderedEmail {
  const role = clamp(input.vacancyTitle, 120) || 'the role';
  return renderEmail(`We've received your application for ${role}`, {
    audience: 'public',
    preheader: `Thank you for applying for ${role} through ${BRAND.name}.`,
    heading: greeting(input.fullName),
    signOff: true,
    blocks: [
      {
        kind: 'paragraph',
        text: `We've received your application for the ${role} role${input.hasCv ? ', together with your CV' : ''}. Thank you for your interest.`,
      },
      { kind: 'heading', text: 'What happens next' },
      {
        kind: 'list',
        items: [
          'Our recruitment team reviews every application against the requirements of the role.',
          "If you're shortlisted, we'll contact you by email or phone to arrange the next step.",
          'You do not need to apply again. If your details change, reply to this email and we will update your application.',
        ],
      },
      candidateDataNotice('We use them only to assess your application and for recruitment purposes.'),
    ],
  });
}

export function talentPoolConfirmation(input: { fullName: string; hasCv: boolean }): RenderedEmail {
  return renderEmail(`Thank you for joining the ${BRAND.name} talent pool`, {
    audience: 'public',
    preheader: `Your ${input.hasCv ? 'CV is' : 'details are'} safely with ${BRAND.name}.`,
    heading: greeting(input.fullName),
    signOff: true,
    blocks: [
      {
        kind: 'paragraph',
        text: `We've received your ${input.hasCv ? 'CV' : 'details'} and added your profile to the ${BRAND.name} talent pool. Thank you for trusting us with your career.`,
      },
      { kind: 'heading', text: 'What happens next' },
      {
        kind: 'list',
        items: [
          'When a role matches your experience, a member of our recruitment team will contact you to discuss it.',
          'We will always speak to you before putting you forward to any employer.',
          'To update your CV later, submit the talent pool form again with the same email address.',
        ],
      },
      candidateDataNotice('Your profile is kept confidential and is never shared with an employer without your prior consent.'),
    ],
  });
}

export function trainingConfirmation(input: { fullName: string; trainingUnit: string }): RenderedEmail {
  const unit = clamp(input.trainingUnit, 120);
  return renderEmail(`We've received your ${BRAND.name} AI training registration`, {
    audience: 'public',
    preheader: 'Our team will be in touch within one business day.',
    heading: greeting(input.fullName),
    signOff: true,
    blocks: [
      {
        kind: 'paragraph',
        text: `We've received your registration${unit ? ` for ${unit}` : ' for AI training'}.`,
      },
      {
        kind: 'paragraph',
        text: 'A member of our training team will contact you within one business day to confirm the details of your booking.',
      },
      {
        kind: 'paragraph',
        text: `Need to change something? Simply reply to this email, or call us on ${BRAND.phones[0]}.`,
      },
    ],
  });
}

export function enquiryConfirmation(input: { fullName: string; interest: string }): RenderedEmail {
  const interest = clamp(input.interest, 80);
  // The website contact form's options, phrased for a sentence.
  const phrases: Record<string, string> = {
    'hr consulting': 'HR consulting',
    'ai training': 'AI training',
    'platform demo': `a ${BRAND.name} Platform demo`,
    recruitment: 'recruitment support',
    general: '',
  };
  const key = interest.toLowerCase();
  const topic = key in phrases ? phrases[key] : interest;
  const about = topic ? ` about ${topic}` : '';
  return renderEmail(`Thank you for contacting ${BRAND.name}`, {
    audience: 'public',
    preheader: 'We will get back to you within one business day.',
    heading: greeting(input.fullName),
    signOff: true,
    blocks: [
      { kind: 'paragraph', text: `We've received your enquiry${about}. Thank you for getting in touch.` },
      {
        kind: 'paragraph',
        text: `A member of our team will get back to you within one business day. Our office hours are ${BRAND.hours}.`,
      },
      {
        kind: 'paragraph',
        text: `If your request is urgent, call us on ${BRAND.phones[0]}.`,
      },
    ],
  });
}

/** Loose sanity check before sending to an address a visitor typed. */
export function isDeliverableEmail(email: string | null | undefined): email is string {
  if (!email || email.length > 254) return false;
  return /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email);
}

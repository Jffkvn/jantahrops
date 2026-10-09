// Run: deno test supabase/functions/_shared/
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  applicationConfirmation,
  enquiryConfirmation,
  firstName,
  isDeliverableEmail,
  talentPoolConfirmation,
  trainingConfirmation,
} from './confirmations.ts';
import { escapeHtml } from './email-layout.ts';
import { buildLeadAlert } from './lead-alert.ts';

Deno.test('escapeHtml neutralises markup', () => {
  assertEquals(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

Deno.test('a hostile name cannot inject HTML or spam text into a confirmation', () => {
  const evil = '<img src=x onerror=alert(1)> Buy cheap pills at spam.example now please click';
  const { html, subject } = talentPoolConfirmation({ fullName: evil, hasCv: true });
  assert(!html.includes('<img src=x'));
  assert(!html.includes('spam.example'), 'only the first word of the name is used');
  assertStringIncludes(html, 'Thank you, &lt;img');
  assertEquals(subject, 'Thank you for joining the JantaHR talent pool');
});

Deno.test('firstName takes the first word and clamps it', () => {
  assertEquals(firstName('  Jane   Namuli '), 'Jane');
  assertEquals(firstName('x'.repeat(100)).length, 30);
  assertEquals(firstName(''), '');
});

Deno.test('application confirmation names the role and carries the data protection notice', () => {
  const { subject, text, html } = applicationConfirmation({
    fullName: 'Jane Namuli',
    vacancyTitle: 'Payroll Officer',
    hasCv: true,
  });
  assertEquals(subject, "We've received your application for Payroll Officer");
  assertStringIncludes(text, 'Thank you, Jane');
  assertStringIncludes(text, 'together with your CV');
  assertStringIncludes(text, 'Uganda Data Protection and Privacy Act, 2019');
  assertStringIncludes(text, '24 months');
  assertStringIncludes(text, 'withdraw your consent');
  assertStringIncludes(html, 'https://www.jantahr.com/privacy');
  assertStringIncludes(html, 'logo-light.png');
});

Deno.test('talent pool confirmation promises consent before sharing', () => {
  const { text } = talentPoolConfirmation({ fullName: 'Jane', hasCv: false });
  assertStringIncludes(text, "We've received your details");
  assertStringIncludes(text, 'never shared with an employer without your prior consent');
});

Deno.test('training and enquiry confirmations promise one business day and never echo the message', () => {
  const t = trainingConfirmation({ fullName: 'Kev Odhis', trainingUnit: 'AI Awareness' });
  assertStringIncludes(t.text, 'registration for AI Awareness');
  assertStringIncludes(t.text, 'within one business day');
  const e = enquiryConfirmation({ fullName: 'Kev', interest: 'HR consulting' });
  assertEquals(e.subject, 'Thank you for contacting JantaHR');
  assertStringIncludes(e.text, 'enquiry about HR consulting');
  assertStringIncludes(enquiryConfirmation({ fullName: 'K', interest: 'Platform demo' }).text, 'about a JantaHR Platform demo');
  const g = enquiryConfirmation({ fullName: 'Kev', interest: 'General' });
  assertStringIncludes(g.text, "We've received your enquiry. Thank you");
});

Deno.test('isDeliverableEmail rejects junk', () => {
  assert(isDeliverableEmail('adhayajeff@gmail.com'));
  assert(!isDeliverableEmail('not-an-email'));
  assert(!isDeliverableEmail('a@b'));
  assert(!isDeliverableEmail('a b@c.com'));
  assert(!isDeliverableEmail(null));
});

Deno.test('lead alert labels contact enquiries and training registrations', () => {
  const base = {
    fullName: 'Kev Odhis',
    email: 'adhayajeff@gmail.com',
    phone: '0772000000',
    organization: 'Agency 256',
    message: 'What are your rates looking like?',
    sourcePage: '/contact',
    submittedAt: '2026-10-09T07:27:00Z',
  };
  const c = buildLeadAlert({ ...base, leadType: 'contact', interest: 'HR consulting' });
  assertEquals(c.subject, 'New enquiry: Kev Odhis — HR consulting');
  assertStringIncludes(c.text, 'Interested in: HR consulting');
  assertStringIncludes(c.text, 'Message:\nWhat are your rates looking like?');
  const t = buildLeadAlert({ ...base, leadType: 'ai_training', interest: 'AI Awareness' });
  assertEquals(t.subject, 'New AI training registration: Kev Odhis — AI Awareness');
  assertStringIncludes(t.html, 'New AI training registration');
});

Deno.test('formatEat shows Kampala time', async () => {
  const { formatEat } = await import('./email-layout.ts');
  assertEquals(formatEat('2026-10-09T09:12:00Z'), '9 Oct 2026, 12:12 PM EAT');
  assertEquals(formatEat('not a date'), 'not a date');
});

Deno.test('team alert flags a matched contact whose details differ', () => {
  const t = buildLeadAlert({
    leadType: 'contact',
    fullName: 'kev Odhis',
    email: 'adhayajeff@gmail.com',
    phone: '0720123567',
    organization: '',
    interest: 'HR consulting',
    message: '',
    sourcePage: '/contact',
    submittedAt: '2026-10-09T07:27:00Z',
    existingContact: { name: 'Freelance Product', differences: ['name "kev Odhis"'] },
  });
  assertStringIncludes(t.text, 'Matched contact: "Freelance Product" is already in Ops');
  assertStringIncludes(t.text, 'The contact was not changed');
});

Deno.test('team alerts link straight to the record when Ops is hosted', () => {
  const base = {
    leadType: 'contact',
    fullName: 'Kev',
    email: '',
    phone: '',
    organization: '',
    interest: '',
    message: '',
    sourcePage: '/contact',
    submittedAt: '2026-10-09T07:27:00Z',
  };
  const withLink = buildLeadAlert({ ...base, opsLink: 'https://ops.jantahr.com/leads?lead=l1' });
  assertStringIncludes(withLink.html, 'href="https://ops.jantahr.com/leads?lead=l1"');
  assertStringIncludes(withLink.text, 'Open in JantaHR Ops: https://ops.jantahr.com/leads?lead=l1');
  const without = buildLeadAlert(base);
  assertStringIncludes(without.text, 'The lead is in JantaHR Ops → Leads');
  assert(!without.html.includes('Open in JantaHR Ops'));
});

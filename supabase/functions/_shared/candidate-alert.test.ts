// Run: deno test supabase/functions/_shared/
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { buildCandidateAlert, formatAnswer } from './candidate-alert.ts';

const base = {
  fullName: 'Jane Namuli',
  email: 'jane@example.com',
  phone: '+256772000000',
  hasCv: true,
  submittedAt: '2026-10-08T10:00:00Z',
} as const;

Deno.test('formatAnswer renders every answer shape as readable text', () => {
  assertEquals(formatAnswer(true), 'Yes');
  assertEquals(formatAnswer(false), 'No');
  assertEquals(formatAnswer(5), '5');
  assertEquals(formatAnswer('  SAP '), 'SAP');
  assertEquals(formatAnswer(['SAP', 'Sage']), 'SAP, Sage');
  assertEquals(formatAnswer(''), '(no answer)');
  assertEquals(formatAnswer(null), '(no answer)');
  assertEquals(formatAnswer({ a: 1 }), '{"a":1}');
});

Deno.test('application alert pairs answers with questions in order, extras last', () => {
  const { subject, text } = buildCandidateAlert({
    ...base,
    outcome: 'application',
    vacancyTitle: 'Payroll Officer',
    salaryExpectationUgx: 2500000,
    screeningQuestions: [
      { id: 'sq_1', question: 'Years of payroll experience?' },
      { id: 'sq_2', question: 'Can you start immediately?' },
    ],
    screeningAnswers: { sq_2: true, sq_1: 4, sq_9: 'stray' },
    notes: 'I love payroll.',
  });
  assertEquals(subject, 'New application: Jane Namuli — Payroll Officer');
  assertStringIncludes(text, 'Salary expectation: UGX 2,500,000');
  assert(text.indexOf('Years of payroll experience?') < text.indexOf('Can you start immediately?'));
  assertStringIncludes(text, '- Can you start immediately?\n  Yes');
  assert(text.indexOf('Can you start immediately?') < text.indexOf('sq_9'));
  assertStringIncludes(text, 'Cover letter and notes:\nI love payroll.');
  assert(!text.includes('[object Object]'));
});

Deno.test('talent pool alert has its own subject and no screening section', () => {
  const { subject, text } = buildCandidateAlert({ ...base, outcome: 'talent_pool', hasCv: false });
  assertEquals(subject, 'New talent pool registration: Jane Namuli');
  assertStringIncludes(text, 'CV: not provided');
  assert(!text.includes('Screening answers'));
});

Deno.test('subject cannot carry line breaks and long notes are shortened', () => {
  const { subject, text } = buildCandidateAlert({
    ...base,
    fullName: 'Jane\nBcc: x@y.z',
    outcome: 'vacancy_unavailable',
    vacancySlug: 'old-role',
    notes: 'x'.repeat(5000),
  });
  assert(!subject.includes('\n'));
  assertStringIncludes(subject, 'vacancy old-role is not open');
  assertStringIncludes(text, '(shortened, full text in Ops)');
});

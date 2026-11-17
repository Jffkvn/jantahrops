// Run: deno test supabase/functions/_shared/
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  buildCandidateAlert,
  buildClientForwardEmail,
  formatAnswer,
  parseApplicationNotes,
} from './candidate-alert.ts';

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
  const { subject, text, html } = buildCandidateAlert({
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
  assertStringIncludes(text, 'Can you start immediately?: Yes');
  assert(text.indexOf('Can you start immediately?') < text.indexOf('sq_9'));
  assertStringIncludes(text, 'Cover letter and notes:\nI love payroll.');
  assert(!text.includes('[object Object]'));
  assertStringIncludes(html, 'Payroll Officer');
  assert(!html.includes('white-space:nowrap'));
});

Deno.test('talent pool alert has its own subject and no screening section', () => {
  const { subject, text } = buildCandidateAlert({ ...base, outcome: 'talent_pool', hasCv: false });
  assertEquals(subject, 'New talent pool registration: Jane Namuli');
  assertStringIncludes(text, 'CV: Not provided');
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

Deno.test('parseApplicationNotes extracts cover letter text/path, linkedin and location cleanly', () => {
  const withText = parseApplicationNotes(
    '[Cover Letter]\nExcited to support fibre teams.\n\n[LinkedIn]\nhttps://linkedin.com/in/jane\n\n[Location]\nKampala, Uganda',
  );
  assertEquals(withText.coverLetterText, 'Excited to support fibre teams.');
  assertEquals(withText.coverLetterPath, null);
  assertEquals(withText.linkedinUrl, 'https://linkedin.com/in/jane');
  assertEquals(withText.location, 'Kampala, Uganda');

  const withFile = parseApplicationNotes(
    '[Cover Letter]\nCover Letter Document Uploaded: cvs/11111111-2222-3333-4444-555555555555-Jane_CoverLetter.pdf\n\n[Location]\nEntebbe',
  );
  assertEquals(withFile.coverLetterText, null);
  assertEquals(
    withFile.coverLetterPath,
    'cvs/11111111-2222-3333-4444-555555555555-Jane_CoverLetter.pdf',
  );
  assertEquals(withFile.location, 'Entebbe');
});

Deno.test('buildClientForwardEmail produces client-safe copy with no Ops links or internal notes', () => {
  const { subject, text, html } = buildClientForwardEmail({
    ...base,
    vacancyTitle: 'HR Assistant',
    availability: '30_days',
    cvAttached: true,
    cvDownloadUrl: 'https://storage.example.com/cv-signed.pdf',
    screeningQuestions: [{ id: 'sq_1', question: 'Years of HR experience?' }],
    screeningAnswers: { sq_1: 2 },
    notes:
      '[Cover Letter]\nDetail-oriented HR graduate.\n\n[LinkedIn]\nhttps://linkedin.com/in/jane\n\n[Location]\nKampala, Uganda',
  });
  assertEquals(subject, 'Candidate Application: Jane Namuli — HR Assistant');
  assertStringIncludes(text, 'Availability: 1 month (30 days)');
  assertStringIncludes(text, 'Location: Kampala, Uganda');
  assertStringIncludes(text, 'LinkedIn: https://linkedin.com/in/jane');
  assertStringIncludes(text, 'Years of HR experience?: 2');
  assertStringIncludes(text, 'Detail-oriented HR graduate.');
  assertStringIncludes(text, 'Download Candidate CV: https://storage.example.com/cv-signed.pdf');
  assertStringIncludes(html, 'Uganda Data Protection and Privacy Act, 2019');
  assert(!text.includes('JantaHR Ops'));
  assert(!html.includes('Open in JantaHR Ops'));
});

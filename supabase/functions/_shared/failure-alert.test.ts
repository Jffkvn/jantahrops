// Run: deno test supabase/functions/_shared/
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { buildSubmissionFailureAlert, formatErrorMessage } from './failure-alert.ts';

Deno.test('formatErrorMessage handles Postgres error objects, Errors, and strings cleanly', () => {
  assertEquals(
    formatErrorMessage({
      code: '22P02',
      message: 'invalid input value for enum availability_status: "two_weeks"',
      details: 'Row failed',
    }),
    '[22P02] invalid input value for enum availability_status: "two_weeks" Row failed',
  );
  assertEquals(formatErrorMessage(new Error('Line 1\nLine 2\r\nDone')), 'Line 1 Line 2 Done');
  assertEquals(formatErrorMessage('plain string failure'), 'plain string failure');
});

Deno.test('buildSubmissionFailureAlert formats clean subject, error details, CV path, and CTA', () => {
  const email = buildSubmissionFailureAlert({
    endpoint: 'public-candidates',
    submissionId: 'sub-123',
    fullName: 'Jane\nNamuli',
    email: 'jane@example.com',
    phone: '+256772123456',
    targetLabel: 'Application · hr-assistant',
    cvPath: 'cvs/abc-Jane.pdf',
    errorSummary: '[22P02] invalid enum value',
    submittedAt: '2026-11-19T11:00:00.000Z',
    opsUrl: 'https://ops.jantahr.com',
  });

  assertEquals(email.subject, 'Failed website submission: Jane Namuli — Application · hr-assistant');
  assertStringIncludes(email.text, 'Website submission failed');
  assertStringIncludes(email.text, 'Uploaded CV: cvs/abc-Jane.pdf');
  assertStringIncludes(email.text, 'Error: [22P02] invalid enum value');
  assertStringIncludes(email.text, 'Open Today in JantaHR Ops: https://ops.jantahr.com');
  assertStringIncludes(email.html, 'Jane Namuli');
  assertStringIncludes(email.html, 'cvs/abc-Jane.pdf');
});

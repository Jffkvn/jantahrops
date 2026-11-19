import { assertEquals } from 'jsr:@std/assert@1';
import type { RenderedEmail } from './email-layout.ts';
import { parseSenderAddress, sendConfirmation, sendResendEmail } from './resend.ts';

const SAMPLE_EMAIL: RenderedEmail = {
  subject: 'Application received — HR Assistant',
  text: 'Dear Jane, We have received your application.',
  html: '<p>Dear Jane, We have received your application.</p>',
};

Deno.test('parseSenderAddress extracts name and email from RFC 5322 address', () => {
  assertEquals(parseSenderAddress('JantaHR <no-reply@jantahr.com>'), {
    name: 'JantaHR',
    email: 'no-reply@jantahr.com',
  });
  assertEquals(parseSenderAddress('no-reply@jantahr.com'), {
    name: 'JantaHR',
    email: 'no-reply@jantahr.com',
  });
});

Deno.test('sendConfirmation sends via Resend primary when within quota', async () => {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = (input) => {
    calls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify({ id: 're_123' }), { status: 200 }));
  };

  const ok = await sendConfirmation(
    'applicant@example.com',
    SAMPLE_EMAIL,
    'application_confirmation',
    'confirm-1',
    {
      testOverrides: {
        resendApiKey: 're_test_key',
        fetchFn: fakeFetch,
      },
    },
  );

  assertEquals(ok, true);
  assertEquals(calls, ['https://api.resend.com/emails']);
});

Deno.test('sendConfirmation fails over from Resend 429 daily_quota_exceeded to Brevo', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.includes('api.resend.com')) {
      return new Response(
        JSON.stringify({ name: 'daily_quota_exceeded', message: 'You have reached your daily email sending quota.' }),
        { status: 429 },
      );
    }
    return new Response(JSON.stringify({ messageId: '<brevo-1>' }), { status: 201 });
  };

  const ok = await sendConfirmation(
    'applicant@example.com',
    SAMPLE_EMAIL,
    'application_confirmation',
    'confirm-2',
    {
      testOverrides: {
        resendApiKey: 're_test_key',
        brevoApiKey: 'xkeysib_test',
        fetchFn: fakeFetch,
        retryDelayMs: 1,
      },
    },
  );

  assertEquals(ok, true);
  // Does not retry Resend on quota_exceeded; immediately fails over to Brevo
  assertEquals(calls.map((c) => c.url), [
    'https://api.resend.com/emails',
    'https://api.brevo.com/v3/smtp/email',
  ]);
  assertEquals(calls[1].body.to, [{ email: 'applicant@example.com' }]);
  assertEquals(calls[1].body.subject, SAMPLE_EMAIL.subject);
});

Deno.test('sendConfirmation fails over from Resend 429 to Google Apps Script when Brevo is unset', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.includes('api.resend.com')) {
      return new Response(
        JSON.stringify({ name: 'daily_quota_exceeded', message: 'Daily quota reached' }),
        { status: 429 },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const ok = await sendConfirmation(
    'applicant@example.com',
    SAMPLE_EMAIL,
    'application_confirmation',
    'confirm-3',
    {
      testOverrides: {
        resendApiKey: 're_test_key',
        fetchFn: fakeFetch,
        retryDelayMs: 1,
        mailerOverrides: {
          mailerUrl: 'https://script.google.com/macros/s/test/exec',
          mailerSecret: 'sec_123',
          notifyEnabled: true,
          externalEnabled: true,
        },
      },
    },
  );

  assertEquals(ok, true);
  assertEquals(calls.map((c) => c.url), [
    'https://api.resend.com/emails',
    'https://script.google.com/macros/s/test/exec',
  ]);
  assertEquals(calls[1].body.kind, 'notify');
  assertEquals(calls[1].body.to, 'applicant@example.com');
  assertEquals(calls[1].body.subject, SAMPLE_EMAIL.subject);
});

Deno.test('client_application_forward offloads directly to Apps Script without using Resend quota', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const ok = await sendResendEmail(
    ['admin_ug@egypro.com'],
    SAMPLE_EMAIL,
    'client_application_forward',
    'forward-1',
    {
      attachments: [
        {
          filename: 'Jane_Doe_CV.pdf',
          content: 'JVBERi0xLjQK',
          contentType: 'application/pdf',
        },
      ],
      testOverrides: {
        resendApiKey: 're_test_key',
        fetchFn: fakeFetch,
        mailerOverrides: {
          mailerUrl: 'https://script.google.com/macros/s/test/exec',
          mailerSecret: 'sec_123',
          notifyEnabled: true,
          externalEnabled: true,
        },
      },
    },
  );

  assertEquals(ok, true);
  // Resend is never called — 0 Resend quota used!
  assertEquals(calls.map((c) => c.url), ['https://script.google.com/macros/s/test/exec']);
  assertEquals(calls[0].body.to, 'admin_ug@egypro.com');
  assertEquals(calls[0].body.attachments, [
    {
      filename: 'Jane_Doe_CV.pdf',
      content: 'JVBERi0xLjQK',
      contentType: 'application/pdf',
    },
  ]);
});

Deno.test('client_application_forward respects RESEND_SKIP_CLIENT_FORWARD when offload is disabled', async () => {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = (input) => {
    calls.push(String(input));
    return Promise.resolve(new Response(JSON.stringify({ id: 're_123' }), { status: 200 }));
  };

  const ok = await sendResendEmail(
    ['admin_ug@egypro.com'],
    SAMPLE_EMAIL,
    'client_application_forward',
    'forward-2',
    {
      testOverrides: {
        resendApiKey: 're_test_key',
        skipClientForwardOnResend: true,
        fetchFn: fakeFetch,
      },
    },
  );

  assertEquals(ok, false);
  assertEquals(calls.length, 0);
});

// JantaHR Ops — sends transactional emails (confirmations and client application
// copies) through Resend (https://resend.com), from no-reply@jantahr.com with
// replies going to hello@jantahr.com, with automatic quota-saving offload and
// failover to Brevo (300/day free tier) and the Google Apps Script Gmail mailer.
//
// Secrets:
//   - RESEND_API_KEY (primary for public confirmations; 100/day free tier)
//   - BREVO_API_KEY (optional secondary/overflow provider; 300/day free tier)
//   - OPS_MAILER_EXTERNAL_ENABLED=true (routes client forwards & Resend 429
//     overflow through the Google Apps Script Gmail webhook in mailer.ts)
//   - RESEND_SKIP_CLIENT_FORWARD=true (optional emergency switch to pause raw
//     per-application client forwarding over Resend when quota is tight)
//   - CONFIRMATION_FROM, CONFIRMATION_REPLY_TO (optional sender overrides)
//
// Never throws: a failed email must not fail the submission. Returns whether
// any configured transport accepted the email.

import type { RenderedEmail } from './email-layout.ts';
import {
  isExternalMailerEnabled,
  type MailerConfigOverrides,
  sendExternalViaMailer,
} from './mailer.ts';

const DEFAULT_FROM = 'JantaHR <no-reply@jantahr.com>';
const DEFAULT_REPLY_TO = 'hello@jantahr.com';
const TIMEOUT_MS = 15000;

function readEnv(key: string): string {
  try {
    return Deno.env.get(key) ?? '';
  } catch {
    return '';
  }
}

export interface ResendAttachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

export interface SendResendOptions {
  from?: string;
  replyTo?: string;
  attachments?: ResendAttachment[];
  /** Optional overrides for unit testing without --allow-env or live network. */
  testOverrides?: {
    resendApiKey?: string;
    brevoApiKey?: string;
    skipClientForwardOnResend?: boolean;
    fetchFn?: typeof fetch;
    mailerOverrides?: MailerConfigOverrides;
    retryDelayMs?: number;
  };
}

export function parseSenderAddress(rawFrom: string): { name: string; email: string } {
  const trimmed = rawFrom.trim();
  const match = trimmed.match(/^(.*?)<([^<>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, '') || 'JantaHR';
    const email = match[2].trim();
    return { name, email };
  }
  return { name: 'JantaHR', email: trimmed || 'no-reply@jantahr.com' };
}

async function postResendOnce(
  apiKey: string,
  bodyJson: string,
  idempotencyKey: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey.slice(0, 256),
      },
      body: bodyJson,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function trySendViaResend(
  apiKey: string,
  recipients: string[],
  from: string,
  replyTo: string,
  email: RenderedEmail,
  category: string,
  idempotencyKey: string,
  attachments: ResendAttachment[] | undefined,
  fetchImpl: typeof fetch,
  retryDelayMs: number,
): Promise<{ sent: boolean; quotaExceeded: boolean }> {
  if (!apiKey) {
    return { sent: false, quotaExceeded: false };
  }

  const payload: Record<string, unknown> = {
    from,
    to: recipients,
    reply_to: replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: [{ name: 'category', value: category }],
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
    }));
  }

  const bodyJson = JSON.stringify(payload);

  try {
    let res = await postResendOnce(apiKey, bodyJson, idempotencyKey, fetchImpl);
    let errText = '';
    if (res.status === 429) {
      errText = await res.text();
      // Distinguish daily/monthly quota exhaustion from 2 req/sec burst limit.
      if (/quota_exceeded/i.test(errText)) {
        const domains = recipients.map((addr) => addr.split('@')[1] ?? '?').join(',');
        console.warn(
          `[resend] ${category} to @${domains}: quota exceeded (HTTP 429 ${errText.slice(0, 200)}), failing over`,
        );
        return { sent: false, quotaExceeded: true };
      }
      await new Promise((r) => setTimeout(r, retryDelayMs));
      res = await postResendOnce(apiKey, bodyJson, idempotencyKey, fetchImpl);
    }
    if (!res.ok) {
      const bodyText = errText || (await res.text());
      const domains = recipients.map((addr) => addr.split('@')[1] ?? '?').join(',');
      console.error(`[resend] ${category} to @${domains}: HTTP ${res.status} ${bodyText.slice(0, 300)}`);
      return { sent: false, quotaExceeded: res.status === 429 };
    }
    return { sent: true, quotaExceeded: false };
  } catch (err) {
    console.error(`[resend] ${category}: failed`, err);
    return { sent: false, quotaExceeded: false };
  }
}

async function trySendViaBrevo(
  brevoApiKey: string,
  recipients: string[],
  from: string,
  replyTo: string,
  email: RenderedEmail,
  category: string,
  attachments: ResendAttachment[] | undefined,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  if (!brevoApiKey) return false;

  const sender = parseSenderAddress(from);
  const replySender = parseSenderAddress(replyTo);
  const payload: Record<string, unknown> = {
    sender: { name: sender.name, email: sender.email },
    to: recipients.map((addr) => ({ email: addr })),
    replyTo: { email: replySender.email },
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    tags: [category],
  };

  if (attachments && attachments.length > 0) {
    payload.attachment = attachments.map((att) => ({
      name: att.filename,
      content: att.content,
    }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const domains = recipients.map((addr) => addr.split('@')[1] ?? '?').join(',');
      console.error(
        `[brevo] ${category} to @${domains}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[brevo] ${category}: failed`, err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param to Recipient address or list of recipient addresses.
 * @param category ASCII letters, digits, '_' or '-' (a Resend/Brevo tag value).
 * @param idempotencyKey stops a retry from sending the same email twice.
 */
export async function sendResendEmail(
  to: string | string[],
  email: RenderedEmail,
  category: string,
  idempotencyKey: string,
  options: SendResendOptions = {},
): Promise<boolean> {
  const recipients = (Array.isArray(to) ? to : [to]).map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return false;

  const ov = options.testOverrides;
  const resendApiKey = ov?.resendApiKey ?? readEnv('RESEND_API_KEY');
  const brevoApiKey = ov?.brevoApiKey ?? readEnv('BREVO_API_KEY');
  const skipClientForwardOnResend =
    typeof ov?.skipClientForwardOnResend === 'boolean'
      ? ov.skipClientForwardOnResend
      : readEnv('RESEND_SKIP_CLIENT_FORWARD').trim().toLowerCase() === 'true';
  const fetchImpl = ov?.fetchFn ?? fetch;
  const retryDelayMs = ov?.retryDelayMs ?? 1100;
  const mailerOverrides: MailerConfigOverrides | undefined = ov?.mailerOverrides
    ? { fetchFn: fetchImpl, ...ov.mailerOverrides }
    : undefined;

  const from = options.from ?? (readEnv('CONFIRMATION_FROM') || DEFAULT_FROM);
  const replyTo = options.replyTo ?? (readEnv('CONFIRMATION_REPLY_TO') || DEFAULT_REPLY_TO);
  const senderName = parseSenderAddress(from).name;

  // 1. Quota-saving offload for external client application forwarding:
  //    Each forwarded application carries CV + Cover Letter attachments and
  //    otherwise doubles Resend usage per applicant. When Apps Script external
  //    delivery or Brevo is enabled, offload client forwards off Resend first.
  if (category === 'client_application_forward') {
    if (isExternalMailerEnabled(mailerOverrides)) {
      const sentViaAppsScript = await sendExternalViaMailer(
        recipients,
        {
          subject: email.subject,
          text: email.text,
          html: email.html,
          replyTo,
          fromName: senderName,
          attachments: options.attachments,
        },
        category,
        mailerOverrides,
      );
      if (sentViaAppsScript) return true;
    }

    if (brevoApiKey) {
      const sentViaBrevo = await trySendViaBrevo(
        brevoApiKey,
        recipients,
        from,
        replyTo,
        email,
        category,
        options.attachments,
        fetchImpl,
      );
      if (sentViaBrevo) return true;
    }

    if (skipClientForwardOnResend) {
      console.log(
        `[resend] ${category}: skipped on Resend because RESEND_SKIP_CLIENT_FORWARD=true (preserving quota for applicant confirmations)`,
      );
      return false;
    }
  }

  // 2. Primary transactional path: Resend (clean domain signature, idempotency key).
  if (resendApiKey) {
    const resendResult = await trySendViaResend(
      resendApiKey,
      recipients,
      from,
      replyTo,
      email,
      category,
      idempotencyKey,
      options.attachments,
      fetchImpl,
      retryDelayMs,
    );
    if (resendResult.sent) return true;
  } else {
    console.log(`[resend] ${category}: RESEND_API_KEY not set, checking fallback transports`);
  }

  // 3. Automatic overflow / failure fallback #1: Brevo (300/day free tier).
  if (brevoApiKey) {
    const sentViaBrevo = await trySendViaBrevo(
      brevoApiKey,
      recipients,
      from,
      replyTo,
      email,
      category,
      options.attachments,
      fetchImpl,
    );
    if (sentViaBrevo) return true;
  }

  // 4. Automatic overflow / failure fallback #2: Google Apps Script Gmail mailer.
  if (isExternalMailerEnabled(mailerOverrides)) {
    const sentViaAppsScript = await sendExternalViaMailer(
      recipients,
      {
        subject: email.subject,
        text: email.text,
        html: email.html,
        replyTo,
        fromName: senderName,
        attachments: options.attachments,
      },
      `${category} (fallback)`,
      mailerOverrides,
    );
    if (sentViaAppsScript) return true;
  }

  return false;
}

/**
 * Backward-compatible alias for sending public confirmation emails.
 */
export function sendConfirmation(
  to: string,
  email: RenderedEmail,
  category: string,
  idempotencyKey: string,
  options: SendResendOptions = {},
): Promise<boolean> {
  return sendResendEmail(to, email, category, idempotencyKey, options);
}

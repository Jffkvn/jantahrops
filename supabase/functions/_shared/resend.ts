// JantaHR Ops — sends transactional emails (confirmations and client application
// copies) through Resend (https://resend.com), from no-reply@jantahr.com with
// replies going to hello@jantahr.com.
//
// Secrets: RESEND_API_KEY (required; sending is skipped without it).
// Optional: CONFIRMATION_FROM, CONFIRMATION_REPLY_TO.
// Never throws: a failed email must not fail the submission. Returns whether
// Resend accepted the email.

import type { RenderedEmail } from './email-layout.ts';

const API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('CONFIRMATION_FROM') ?? 'JantaHR <no-reply@jantahr.com>';
const REPLY_TO = Deno.env.get('CONFIRMATION_REPLY_TO') ?? 'hello@jantahr.com';
const TIMEOUT_MS = 15000;

export interface ResendAttachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

export interface SendResendOptions {
  from?: string;
  replyTo?: string;
  attachments?: ResendAttachment[];
}

async function postEmailOnce(bodyJson: string, idempotencyKey: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
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

/**
 * @param to Recipient address or list of recipient addresses.
 * @param category ASCII letters, digits, '_' or '-' (a Resend tag value).
 * @param idempotencyKey stops a retry from sending the same email twice.
 */
export async function sendResendEmail(
  to: string | string[],
  email: RenderedEmail,
  category: string,
  idempotencyKey: string,
  options: SendResendOptions = {},
): Promise<boolean> {
  if (!API_KEY) {
    console.log(`[resend] ${category}: skipped, RESEND_API_KEY is not set`);
    return false;
  }

  const recipients = (Array.isArray(to) ? to : [to]).map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return false;

  const payload: Record<string, unknown> = {
    from: options.from ?? FROM,
    to: recipients,
    reply_to: options.replyTo ?? REPLY_TO,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: [{ name: 'category', value: category }],
  };

  if (options.attachments && options.attachments.length > 0) {
    payload.attachments = options.attachments.map((att) => ({
      filename: att.filename,
      content: att.content,
    }));
  }

  const bodyJson = JSON.stringify(payload);

  try {
    let res = await postEmailOnce(bodyJson, idempotencyKey);
    // Resend enforces 2 req/sec; retry once on 429 burst limit.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1100));
      res = await postEmailOnce(bodyJson, idempotencyKey);
    }
    if (!res.ok) {
      const domains = recipients.map((addr) => addr.split('@')[1] ?? '?').join(',');
      console.error(`[resend] ${category} to @${domains}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[resend] ${category}: failed`, err);
    return false;
  }
}

/**
 * Backward-compatible alias for sending public confirmation emails.
 */
export function sendConfirmation(
  to: string,
  email: RenderedEmail,
  category: string,
  idempotencyKey: string,
  options: { from?: string; replyTo?: string } = {},
): Promise<boolean> {
  return sendResendEmail(to, email, category, idempotencyKey, options);
}

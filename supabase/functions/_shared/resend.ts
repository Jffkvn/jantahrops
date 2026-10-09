// JantaHR Ops — sends confirmation emails to the public through Resend
// (https://resend.com), from no-reply@jantahr.com with replies going to
// hello@jantahr.com. Free plan: 100 emails/day, 3,000/month.
//
// Secrets: RESEND_API_KEY (required; sending is skipped without it).
// Optional: CONFIRMATION_FROM, CONFIRMATION_REPLY_TO.
// Never throws: a failed confirmation must not fail the submission. Returns
// whether Resend accepted the email.

import type { RenderedEmail } from './email-layout.ts';

const API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('CONFIRMATION_FROM') ?? 'JantaHR <no-reply@jantahr.com>';
const REPLY_TO = Deno.env.get('CONFIRMATION_REPLY_TO') ?? 'hello@jantahr.com';
const TIMEOUT_MS = 8000;

/**
 * @param category ASCII letters, digits, '_' or '-' (a Resend tag value).
 * @param idempotencyKey stops a retry from sending the same email twice.
 */
export async function sendConfirmation(
  to: string,
  email: RenderedEmail,
  category: string,
  idempotencyKey: string,
  options: { from?: string; replyTo?: string } = {},
): Promise<boolean> {
  if (!API_KEY) {
    console.log(`[resend] ${category}: skipped, RESEND_API_KEY is not set`);
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: options.from ?? FROM,
        to: [to],
        reply_to: options.replyTo ?? REPLY_TO,
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: 'category', value: category }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Log the recipient's domain only, never the full address.
      const domain = to.split('@')[1] ?? '?';
      console.error(`[resend] ${category} to @${domain}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[resend] ${category}: failed`, err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

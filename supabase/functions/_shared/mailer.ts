// JantaHR Ops — hands a message to the Google Apps Script mailer.
//
// Ops has no paid email provider. The existing Apps Script web app (owned by
// the JantaHR Google account) sends the email with GmailApp. It is reached
// server-to-server only, guarded by a shared secret:
//   Supabase secret LEAD_ALERT_SECRET  ==  Script Property OPS_ALERT_SECRET
// See docs/WEBSITE_CUTOVER.md.
//
// Two message kinds:
//   - lead alert (public-leads): { source, secret, lead: {...} }; the script
//     formats the email and appends a backup row to the Sheet.
//   - notify (everything else): { source, secret, kind: 'notify', subject, text,
//     replyTo? }; the script sends the text as-is. Gated by OPS_NOTIFY_ENABLED
//     so it can't reach a script version that doesn't understand it.
//
// Sending never throws and never blocks the caller's response.

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const MAILER_URL = Deno.env.get('LEAD_ALERT_WEBHOOK_URL') ?? '';
const MAILER_SECRET = Deno.env.get('LEAD_ALERT_SECRET') ?? '';
const NOTIFY_ENABLED = (Deno.env.get('OPS_NOTIFY_ENABLED') ?? '').trim().toLowerCase() === 'true';
const TIMEOUT_MS = 8000;

async function postToMailer(message: Record<string, unknown>, label: string): Promise<void> {
  if (!MAILER_URL || !MAILER_SECRET) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(MAILER_URL, {
      method: 'POST',
      // text/plain keeps Apps Script happy (no preflight, e.postData.contents).
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ source: 'jantahr-ops', secret: MAILER_SECRET, ...message }),
      signal: controller.signal,
    });
    const raw = await res.text();
    // Apps Script answers 200 even when it rejects the secret ({"ok":false}) or
    // throws (an HTML error page), so the body is the real verdict.
    let accepted = false;
    try {
      accepted = res.ok && (JSON.parse(raw) as { ok?: unknown }).ok === true;
    } catch {
      accepted = false;
    }
    if (!accepted) {
      console.error(`[mailer] ${label}: rejected (HTTP ${res.status}): ${raw.slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`[mailer] ${label}: failed`, err);
  } finally {
    clearTimeout(timer);
  }
}

/** Website lead alert, formatted by the Apps Script (existing contract). */
export function sendLeadAlert(lead: Record<string, string>): Promise<void> {
  return postToMailer({ lead }, 'lead alert');
}

/** A ready-made plain-text email to the team inbox. */
export function sendNotification(
  email: { subject: string; text: string; replyTo?: string | null },
  label: string,
): Promise<void> {
  if (!NOTIFY_ENABLED) {
    console.log(`[mailer] ${label}: skipped, OPS_NOTIFY_ENABLED is not "true"`);
    return Promise.resolve();
  }
  return postToMailer(
    {
      kind: 'notify',
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    },
    label,
  );
}

/** Let work finish after the response is sent; await it where that's unsupported. */
export async function runAfterResponse(work: Promise<unknown>): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
    return;
  }
  await work;
}

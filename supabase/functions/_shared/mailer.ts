// JantaHR Ops — hands a message to the Google Apps Script mailer.
//
// Ops has no paid email provider. The existing Apps Script web app (owned by
// the JantaHR Google account) sends the email with GmailApp. It is reached
// server-to-server only, guarded by a shared secret:
//   Supabase secret LEAD_ALERT_SECRET  ==  Script Property OPS_ALERT_SECRET
// See docs/WEBSITE_CUTOVER.md.
//
// Two message kinds:
//   - lead alert (public-leads): { source, secret, lead: {...}, subject, text,
//     html }; the script appends a backup row to the Sheet and sends the email.
//     Older script versions ignore subject/text/html and format their own.
//   - notify (everything else): { source, secret, kind: 'notify', to?, subject,
//     text, html?, replyTo?, fromName?, attachments? }; the script sends it
//     as-is. Gated by OPS_NOTIFY_ENABLED so it can't reach a script version
//     that doesn't understand it.
//
// External recipient delivery (client application forwarding & Resend quota
// overflow fallback) is additionally gated by OPS_MAILER_EXTERNAL_ENABLED=true
// so external emails are only routed through Apps Script once Code.gs honors
// `data.to` and `data.attachments`.
//
// Sending never throws and never blocks the caller's response.

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const TIMEOUT_MS = 12000;

function readEnv(key: string): string {
  try {
    return Deno.env.get(key) ?? '';
  } catch {
    return '';
  }
}

export interface MailerAttachment {
  filename: string;
  content: string; // base64
  contentType?: string;
}

export interface MailerNotificationInput {
  to?: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
  fromName?: string;
  attachments?: MailerAttachment[];
}

export interface MailerConfigOverrides {
  mailerUrl?: string;
  mailerSecret?: string;
  notifyEnabled?: boolean;
  externalEnabled?: boolean;
  fetchFn?: typeof fetch;
}

export function isExternalMailerEnabled(overrides?: MailerConfigOverrides): boolean {
  if (typeof overrides?.externalEnabled === 'boolean') return overrides.externalEnabled;
  return readEnv('OPS_MAILER_EXTERNAL_ENABLED').trim().toLowerCase() === 'true';
}

async function postToMailer(
  message: Record<string, unknown>,
  label: string,
  overrides?: MailerConfigOverrides,
): Promise<boolean> {
  const mailerUrl = overrides?.mailerUrl ?? readEnv('LEAD_ALERT_WEBHOOK_URL');
  const mailerSecret = overrides?.mailerSecret ?? readEnv('LEAD_ALERT_SECRET');
  if (!mailerUrl || !mailerSecret) return false;

  const fetchImpl = overrides?.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(mailerUrl, {
      method: 'POST',
      // text/plain keeps Apps Script happy (no preflight, e.postData.contents).
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ source: 'jantahr-ops', secret: mailerSecret, ...message }),
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
    return accepted;
  } catch (err) {
    console.error(`[mailer] ${label}: failed`, err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Website lead alert: raw fields for the Sheet row, plus the branded email. */
export async function sendLeadAlert(
  lead: Record<string, string>,
  email: { subject: string; text: string; html: string },
  overrides?: MailerConfigOverrides,
): Promise<void> {
  await postToMailer(
    { lead, subject: email.subject, text: email.text, html: email.html },
    'lead alert',
    overrides,
  );
}

/** A ready-made email to the team inbox (or an explicit `to` recipient when supported). */
export function sendNotification(
  email: MailerNotificationInput,
  label: string,
  overrides?: MailerConfigOverrides,
): Promise<boolean> {
  const notifyEnabled =
    typeof overrides?.notifyEnabled === 'boolean'
      ? overrides.notifyEnabled
      : readEnv('OPS_NOTIFY_ENABLED').trim().toLowerCase() === 'true';

  if (!notifyEnabled) {
    console.log(`[mailer] ${label}: skipped, OPS_NOTIFY_ENABLED is not "true"`);
    return Promise.resolve(false);
  }

  const toList = email.to
    ? (Array.isArray(email.to) ? email.to : [email.to]).map((r) => r.trim()).filter(Boolean)
    : [];

  return postToMailer(
    {
      kind: 'notify',
      ...(toList.length > 0 ? { to: toList.join(',') } : {}),
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      ...(email.fromName ? { fromName: email.fromName } : {}),
      ...(email.attachments && email.attachments.length > 0
        ? {
            attachments: email.attachments.map((att) => ({
              filename: att.filename,
              content: att.content,
              contentType: att.contentType ?? 'application/octet-stream',
            })),
          }
        : {}),
    },
    label,
    overrides,
  );
}

/**
 * Sends an email to an external recipient (client application forward or
 * applicant confirmation fallback) via the Google Apps Script Gmail webhook.
 * Gated by OPS_MAILER_EXTERNAL_ENABLED=true so it cannot reach an older script
 * version that ignores `data.to` and defaults to `ALERT_TO`.
 */
export function sendExternalViaMailer(
  to: string | string[],
  email: Omit<MailerNotificationInput, 'to'>,
  label: string,
  overrides?: MailerConfigOverrides,
): Promise<boolean> {
  if (!isExternalMailerEnabled(overrides)) {
    return Promise.resolve(false);
  }
  const toList = (Array.isArray(to) ? to : [to]).map((r) => r.trim()).filter(Boolean);
  if (toList.length === 0) return Promise.resolve(false);
  return sendNotification({ ...email, to: toList }, label, overrides);
}

/** Let work finish after the response is sent; await it where that's unsupported. */
export async function runAfterResponse(work: Promise<unknown>): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
    return;
  }
  await work;
}

// JantaHR Ops — branded email layout. Pure string building, no I/O, so it can
// be unit tested and previewed. Table-based with inline styles because email
// clients (Gmail, Outlook) ignore most <style> rules.
//
// Every piece of text passed in is plain text and is HTML-escaped here.
// Nothing a website visitor typed is ever inserted as raw HTML.

import { BRAND } from './brand.ts';

const C = BRAND.colors;
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";
const HEADING_FONT = "Sora, Inter, 'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text with line breaks kept. */
function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>');
}

export type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'callout'; title: string; text: string; link?: { label: string; url: string } }
  | { kind: 'details'; rows: { label: string; value: string }[] }
  | { kind: 'quote'; title: string; text: string };

function renderBlock(b: Block): string {
  switch (b.kind) {
    case 'paragraph':
      return `<p style="margin:0 0 16px;">${textToHtml(b.text)}</p>`;
    case 'heading':
      return `<h2 style="margin:24px 0 8px;font-family:${HEADING_FONT};font-size:16px;line-height:1.4;color:${C.deep};">${escapeHtml(b.text)}</h2>`;
    case 'list':
      return `<ul style="margin:0 0 16px;padding-left:20px;">${b.items
        .map((i) => `<li style="margin:0 0 8px;">${textToHtml(i)}</li>`)
        .join('')}</ul>`;
    case 'callout': {
      const link = b.link
        ? ` <a href="${escapeHtml(b.link.url)}" style="color:${C.primary};">${escapeHtml(b.link.label)}</a>`
        : '';
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-collapse:collapse;"><tr><td style="background:${C.offwhite};border-left:4px solid ${C.primary};padding:16px 18px;font-size:13px;line-height:1.6;color:${C.deep};"><strong style="display:block;margin-bottom:6px;">${escapeHtml(b.title)}</strong>${textToHtml(b.text)}${link}</td></tr></table>`;
    }
    case 'details':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;font-size:14px;">${b.rows
        .map(
          (r) =>
            `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${C.border};color:${C.muted};white-space:nowrap;vertical-align:top;width:1%;">${escapeHtml(r.label)}</td><td style="padding:8px 0;border-bottom:1px solid ${C.border};color:${C.deep};vertical-align:top;word-break:break-word;">${textToHtml(r.value)}</td></tr>`,
        )
        .join('')}</table>`;
    case 'quote':
      return `<p style="margin:16px 0 6px;font-weight:600;color:${C.deep};">${escapeHtml(b.title)}</p><div style="margin:0 0 16px;padding:12px 14px;background:${C.offwhite};border-radius:8px;font-size:14px;line-height:1.6;color:${C.deep};word-break:break-word;">${textToHtml(b.text)}</div>`;
  }
}

export interface EmailContent {
  /** Hidden inbox preview line. */
  preheader: string;
  heading: string;
  blocks: Block[];
  /** Shown under the blocks. Omit for internal alerts. */
  signOff?: boolean;
  /** 'public' adds contact details, socials and the privacy link. */
  audience: 'public' | 'team';
}

export function renderEmailHtml(subject: string, content: EmailContent): string {
  const body = content.blocks.map(renderBlock).join('');
  const signOff = content.signOff
    ? `<p style="margin:24px 0 0;">Warm regards,<br><strong>The ${escapeHtml(BRAND.name)} Team</strong><br><span style="color:${C.muted};">${escapeHtml(BRAND.legalName)}</span></p>`
    : '';

  const footer =
    content.audience === 'public'
      ? `<p style="margin:0 0 8px;"><strong style="color:${C.deep};">${escapeHtml(BRAND.legalName)}</strong> · ${escapeHtml(BRAND.location)}</p>
<p style="margin:0 0 8px;"><a href="mailto:${BRAND.email}" style="color:${C.primary};">${BRAND.email}</a> · ${BRAND.phones.map(escapeHtml).join(' · ')}</p>
<p style="margin:0 0 8px;">Office hours: ${escapeHtml(BRAND.hours)}</p>
<p style="margin:0 0 12px;">${BRAND.socials
          .map((s) => `<a href="${s.url}" style="color:${C.primary};">${escapeHtml(s.label)}</a>`)
          .join(' · ')} · <a href="${BRAND.site}" style="color:${C.primary};">jantahr.com</a> · <a href="${BRAND.privacyUrl}" style="color:${C.primary};">Privacy Policy</a></p>
<p style="margin:0;">You are receiving this email because you submitted a form on jantahr.com. Replies to this email reach our team at ${BRAND.email}.</p>`
      : `<p style="margin:0;">Sent automatically by JantaHR Ops from a jantahr.com form. Reply to this email to answer the sender directly.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.offwhite};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.offwhite};border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${C.border};border-radius:12px;border-collapse:separate;overflow:hidden;">
<tr><td style="background:${C.deep};padding:22px 32px;"><a href="${BRAND.site}"><img src="${BRAND.logoOnDark}" width="120" alt="${escapeHtml(BRAND.name)}" style="display:block;border:0;width:120px;height:auto;"></a></td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${C.accent};">&nbsp;</td></tr>
<tr><td style="padding:32px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.deep};">
<h1 style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:22px;line-height:1.3;color:${C.deep};">${escapeHtml(content.heading)}</h1>
${body}${signOff}
</td></tr>
<tr><td style="background:${C.offwhite};padding:20px 32px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};border-top:1px solid ${C.border};">
${footer}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** The plain-text twin of the same content, for clients that don't show HTML. */
export function renderEmailText(content: EmailContent): string {
  const out: string[] = [content.heading, ''];
  for (const b of content.blocks) {
    switch (b.kind) {
      case 'paragraph':
        out.push(b.text, '');
        break;
      case 'heading':
        out.push(b.text, '');
        break;
      case 'list':
        out.push(...b.items.map((i) => `- ${i}`), '');
        break;
      case 'callout':
        out.push(b.title, b.text + (b.link ? ` ${b.link.label}: ${b.link.url}` : ''), '');
        break;
      case 'details':
        out.push(...b.rows.map((r) => `${r.label}: ${r.value}`), '');
        break;
      case 'quote':
        out.push(`${b.title}:`, b.text, '');
        break;
    }
  }
  if (content.signOff) out.push('Warm regards,', `The ${BRAND.name} Team`, BRAND.legalName, '');
  if (content.audience === 'public') {
    out.push(
      '--',
      `${BRAND.legalName} · ${BRAND.location}`,
      `${BRAND.email} · ${BRAND.phones.join(' · ')}`,
      `Privacy Policy: ${BRAND.privacyUrl}`,
    );
  }
  return out.join('\n').trim();
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderEmail(subject: string, content: EmailContent): RenderedEmail {
  const clean = subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  return { subject: clean, text: renderEmailText(content), html: renderEmailHtml(clean, content) };
}

/** "9 Oct 2026, 12:12 PM EAT" — falls back to the raw value if unparseable. */
export function formatEat(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${s.replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`)} EAT`;
}

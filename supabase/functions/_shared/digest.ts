// JantaHR Ops — the weekday morning email: what needs doing today.
// Pure formatting (no I/O), so it can be unit tested and previewed.

import { type Block, formatEat, type RenderedEmail, renderEmail } from './email-layout.ts';

export interface DigestFollowUp {
  name: string;
  note: string | null;
  dueAt: string;
  owner: string | null;
}

export interface DigestTask {
  title: string;
  dueAt: string;
  assignee: string | null;
}

export interface DigestInvoice {
  number: string | null;
  client: string | null;
  totalUgx: number;
  dueDate: string; // yyyy-mm-dd
}

export interface DigestData {
  /** Start of today in Kampala, ISO. Anything due before it is overdue. */
  startOfToday: string;
  followUps: DigestFollowUp[];
  tasks: DigestTask[];
  newArrivals: { leads: number; applications: number; talentPool: number; names: string[] };
  overdueInvoices: DigestInvoice[];
}

const MAX_ITEMS = 10;

export function isEmptyDigest(d: DigestData): boolean {
  const a = d.newArrivals;
  return (
    d.followUps.length === 0 &&
    d.tasks.length === 0 &&
    a.leads + a.applications + a.talentPool === 0 &&
    d.overdueInvoices.length === 0
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function ugx(n: number): string {
  return `UGX ${Math.round(n).toLocaleString('en-US')}`;
}

/** "overdue since 7 Oct 2026, 10:00 AM EAT" or "today, 2:00 PM EAT". */
function when(dueAt: string, startOfToday: string): string {
  const full = formatEat(dueAt);
  if (dueAt < startOfToday) return `overdue since ${full}`;
  return `today, ${full.split(', ').slice(-1)[0]}`;
}

function capped(items: string[], total: number): string[] {
  return total > items.length ? [...items, `…and ${total - items.length} more in Ops`] : items;
}

export function buildDigest(d: DigestData, recipientFirstName: string): RenderedEmail {
  const blocks: Block[] = [];
  const counts: string[] = [];
  const a = d.newArrivals;
  const arrivals = a.leads + a.applications + a.talentPool;

  if (arrivals > 0) {
    counts.push(`${arrivals} new from the website`);
    const parts = [
      a.leads ? plural(a.leads, 'enquiry or registration', 'enquiries and registrations') : '',
      a.applications ? plural(a.applications, 'job application') : '',
      a.talentPool ? plural(a.talentPool, 'talent pool sign-up') : '',
    ].filter(Boolean);
    blocks.push(
      { kind: 'heading', text: 'New from the website' },
      { kind: 'paragraph', text: `${parts.join(', ')} waiting for review on the Today page.` },
    );
    if (a.names.length) {
      blocks.push({ kind: 'list', items: capped(a.names.slice(0, MAX_ITEMS), arrivals) });
    }
  }

  if (d.followUps.length > 0) {
    const overdue = d.followUps.filter((f) => f.dueAt < d.startOfToday).length;
    counts.push(plural(d.followUps.length, 'follow-up'));
    blocks.push(
      { kind: 'heading', text: 'Follow-ups' },
      ...(overdue > 0
        ? [{ kind: 'paragraph' as const, text: `${plural(overdue, 'follow-up')} ${overdue === 1 ? 'is' : 'are'} overdue.` }]
        : []),
      {
        kind: 'list',
        items: capped(
          d.followUps.slice(0, MAX_ITEMS).map(
            (f) =>
              `${f.name}${f.note ? `: ${f.note}` : ''} (${when(f.dueAt, d.startOfToday)}${f.owner ? `, ${f.owner}` : ''})`,
          ),
          d.followUps.length,
        ),
      },
    );
  }

  if (d.tasks.length > 0) {
    counts.push(plural(d.tasks.length, 'task'));
    blocks.push(
      { kind: 'heading', text: 'Tasks due' },
      {
        kind: 'list',
        items: capped(
          d.tasks.slice(0, MAX_ITEMS).map(
            (t) => `${t.title} (${when(t.dueAt, d.startOfToday)}${t.assignee ? `, ${t.assignee}` : ''})`,
          ),
          d.tasks.length,
        ),
      },
    );
  }

  if (d.overdueInvoices.length > 0) {
    const total = d.overdueInvoices.reduce((s, i) => s + i.totalUgx, 0);
    counts.push(plural(d.overdueInvoices.length, 'overdue invoice'));
    blocks.push(
      { kind: 'heading', text: 'Overdue invoices' },
      { kind: 'paragraph', text: `${ugx(total)} is past its due date.` },
      {
        kind: 'list',
        items: capped(
          d.overdueInvoices
            .slice(0, MAX_ITEMS)
            .map((i) => `${i.number ?? 'Invoice'}${i.client ? ` · ${i.client}` : ''} · ${ugx(i.totalUgx)} · due ${i.dueDate}`),
          d.overdueInvoices.length,
        ),
      },
    );
  }

  blocks.push({ kind: 'paragraph', text: 'Open JantaHR Ops → Today to work through it.' });

  const name = recipientFirstName.trim();
  return renderEmail(`Your JantaHR day: ${counts.join(', ')}`, {
    audience: 'team',
    preheader: counts.join(' · '),
    heading: name ? `Good morning, ${name}` : 'Good morning',
    blocks,
  });
}

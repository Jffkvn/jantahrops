// Run: deno test supabase/functions/_shared/
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { buildDigest, type DigestData, isEmptyDigest } from './digest.ts';

const empty: DigestData = {
  startOfToday: '2026-10-09T00:00:00+03:00',
  followUps: [],
  tasks: [],
  newArrivals: { leads: 0, applications: 0, talentPool: 0, names: [] },
  overdueInvoices: [],
};

Deno.test('an empty morning sends nothing', () => {
  assert(isEmptyDigest(empty));
});

Deno.test('the digest summarises every section in the subject and body', () => {
  const d: DigestData = {
    ...empty,
    startOfToday: '2026-10-08T21:00:00.000Z',
    followUps: [
      { name: 'Grace Achieng', note: 'Send proposal', dueAt: '2026-10-07T07:00:00.000Z', owner: 'Jeff' },
      { name: 'Kev Odhis', note: null, dueAt: '2026-10-09T11:00:00.000Z', owner: null },
    ],
    tasks: [{ title: 'Call NSSF', dueAt: '2026-10-09T06:00:00.000Z', assignee: 'Jeff' }],
    newArrivals: { leads: 1, applications: 2, talentPool: 0, names: ['Jane Namuli · Application · Payroll Officer'] },
    overdueInvoices: [{ number: 'INV-0012', client: 'Acme Ltd', totalUgx: 1500000, dueDate: '2026-10-01' }],
  };
  assert(!isEmptyDigest(d));
  const { subject, text } = buildDigest(d, 'Jeff');
  assertEquals(subject, 'Your JantaHR day: 3 new from the website, 2 follow-ups, 1 task, 1 overdue invoice');
  assertStringIncludes(text, 'Good morning, Jeff');
  assertStringIncludes(text, '1 follow-up is overdue.');
  assertStringIncludes(text, 'Grace Achieng: Send proposal (overdue since 7 Oct 2026, 10:00 AM EAT, Jeff)');
  assertStringIncludes(text, 'Kev Odhis (today, 2:00 PM EAT)');
  assertStringIncludes(text, '1 enquiry or registration, 2 job applications waiting for review');
  assertStringIncludes(text, 'UGX 1,500,000 is past its due date.');
});

Deno.test('long lists are capped with a pointer to Ops', () => {
  const many = Array.from({ length: 13 }, (_, i) => ({
    title: `Task ${i}`,
    dueAt: '2026-10-09T06:00:00.000Z',
    assignee: null,
  }));
  const { text } = buildDigest({ ...empty, startOfToday: '2026-10-08T21:00:00.000Z', tasks: many }, '');
  assertStringIncludes(text, '…and 3 more in Ops');
  assertStringIncludes(text, 'Good morning\n');
});

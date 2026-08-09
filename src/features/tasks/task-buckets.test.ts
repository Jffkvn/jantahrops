import { describe, it, expect } from 'vitest';
import { bucketOf, dueLabel, groupByBucket, kampalaDayEnd } from './task-buckets';

/**
 * Every case pins `now` explicitly. Bucketing is the one piece of task logic
 * that can be silently wrong for months — a task quietly filed as "later" when
 * it is due today is invisible, and invisible is exactly the failure this
 * product exists to prevent.
 */

// 9 Aug 2026, 07:00 UTC = 10:00 EAT — mid-morning in Kampala.
const NOW = new Date('2026-08-09T07:00:00Z');

describe('kampalaDayEnd', () => {
  it('ends the Kampala day at 23:59:59.999 EAT (20:59:59.999 UTC)', () => {
    expect(kampalaDayEnd(0, NOW).toISOString()).toBe('2026-08-09T20:59:59.999Z');
  });

  it('walks whole calendar days, forwards and back', () => {
    expect(kampalaDayEnd(1, NOW).toISOString()).toBe('2026-08-10T20:59:59.999Z');
    expect(kampalaDayEnd(-1, NOW).toISOString()).toBe('2026-08-08T20:59:59.999Z');
  });

  it('crosses a month boundary', () => {
    const lastOfMonth = new Date('2026-08-31T07:00:00Z');
    expect(kampalaDayEnd(1, lastOfMonth).toISOString()).toBe('2026-09-01T20:59:59.999Z');
  });

  it('uses the Kampala date, not the UTC date, late in the evening', () => {
    // 23:30 EAT on the 9th is still 20:30 UTC on the 9th, but 22:00 UTC on the
    // 9th is already the 10th in Kampala — the day must follow Kampala.
    const lateEAT = new Date('2026-08-09T22:00:00Z'); // 01:00 on the 10th, EAT
    expect(kampalaDayEnd(0, lateEAT).toISOString()).toBe('2026-08-10T20:59:59.999Z');
  });
});

describe('bucketOf', () => {
  it('files a task with no date under someday', () => {
    expect(bucketOf(null, NOW)).toBe('someday');
  });

  it('files an unparseable date under someday rather than throwing', () => {
    expect(bucketOf('not-a-date', NOW)).toBe('someday');
  });

  it('files yesterday as overdue', () => {
    expect(bucketOf('2026-08-08T14:00:00+03:00', NOW)).toBe('overdue');
  });

  it('files earlier the same morning as today, not overdue', () => {
    // 08:00 EAT has passed (it is 10:00) but the day has not — a task due today
    // is due today until midnight.
    expect(bucketOf('2026-08-09T08:00:00+03:00', NOW)).toBe('today');
  });

  it('files the last instant of today as today', () => {
    expect(bucketOf('2026-08-09T23:59:59+03:00', NOW)).toBe('today');
  });

  it('files the first instant of tomorrow as this week', () => {
    expect(bucketOf('2026-08-10T00:00:01+03:00', NOW)).toBe('this_week');
  });

  it('files day seven as this week and day eight as later', () => {
    expect(bucketOf('2026-08-16T17:00:00+03:00', NOW)).toBe('this_week');
    expect(bucketOf('2026-08-17T17:00:00+03:00', NOW)).toBe('later');
  });
});

describe('groupByBucket', () => {
  it('splits a list and keeps the order within each bucket', () => {
    const tasks = [
      { id: 'a', due_at: '2026-08-07T17:00:00+03:00' }, // overdue
      { id: 'b', due_at: '2026-08-09T09:00:00+03:00' }, // today
      { id: 'c', due_at: '2026-08-08T17:00:00+03:00' }, // overdue
      { id: 'd', due_at: null }, // someday
      { id: 'e', due_at: '2026-09-01T17:00:00+03:00' }, // later
    ];
    const grouped = groupByBucket(tasks, NOW);
    expect(grouped.get('overdue')?.map((t) => t.id)).toEqual(['a', 'c']);
    expect(grouped.get('today')?.map((t) => t.id)).toEqual(['b']);
    expect(grouped.get('this_week')).toEqual([]);
    expect(grouped.get('later')?.map((t) => t.id)).toEqual(['e']);
    expect(grouped.get('someday')?.map((t) => t.id)).toEqual(['d']);
  });
});

describe('dueLabel', () => {
  it('names the adjacent days in words', () => {
    expect(dueLabel('2026-08-09T17:00:00+03:00', NOW)).toBe('Today');
    expect(dueLabel('2026-08-10T17:00:00+03:00', NOW)).toBe('Tomorrow');
    expect(dueLabel('2026-08-08T17:00:00+03:00', NOW)).toBe('Yesterday');
  });

  it('uses a weekday inside the coming week', () => {
    expect(dueLabel('2026-08-13T17:00:00+03:00', NOW)).toBe('Thu');
  });

  it('falls back to a date beyond the coming week', () => {
    expect(dueLabel('2026-09-01T17:00:00+03:00', NOW)).toBe('1 Sep');
  });

  it('never guesses a weekday for a past date', () => {
    // "Tue" for something three days late reads as upcoming; a date does not.
    expect(dueLabel('2026-08-04T17:00:00+03:00', NOW)).toBe('4 Aug');
  });

  it('returns nothing for an undated task', () => {
    expect(dueLabel(null, NOW)).toBe('');
  });
});

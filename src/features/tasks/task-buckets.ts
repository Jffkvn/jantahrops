import { formatInTimeZone } from 'date-fns-tz';
import { APP_TIMEZONE } from '@/lib/format';

/**
 * A task is filed by how soon it is due, not by a stored column: nothing about
 * the row changes at midnight, only the question we ask of it. Buckets are
 * therefore always derived, and always against the KAMPALA calendar day — the
 * user is in Uganda regardless of where this code runs.
 */
export type TaskBucket = 'overdue' | 'today' | 'this_week' | 'later' | 'someday';

export const BUCKET_ORDER: TaskBucket[] = ['overdue', 'today', 'this_week', 'later', 'someday'];

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  this_week: 'This week',
  later: 'Later',
  someday: 'No date',
};

/**
 * The last instant of a Kampala calendar day, `offsetDays` from today.
 *
 * The day arithmetic runs in UTC on purpose. `setDate()` on a local Date keeps
 * the wall-clock hour, so across a host DST change it moves 23 or 25 real
 * hours; when the local time of day sits near the boundary that maps across
 * Kampala midnight, that lands on the wrong Kampala date. Uganda itself has no
 * DST (EAT = UTC+3 year round), so the +03:00 literal is always correct.
 */
export function kampalaDayEnd(offsetDays = 0, now: Date = new Date()): Date {
  const today = formatInTimeZone(now, APP_TIMEZONE, 'yyyy-MM-dd');
  const cursor = new Date(`${today}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + offsetDays);
  const day = cursor.toISOString().slice(0, 10);
  return new Date(`${day}T23:59:59.999+03:00`);
}

export function bucketOf(dueAt: string | null, now: Date = new Date()): TaskBucket {
  if (!dueAt) return 'someday';
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return 'someday';
  if (due <= kampalaDayEnd(-1, now).getTime()) return 'overdue';
  if (due <= kampalaDayEnd(0, now).getTime()) return 'today';
  if (due <= kampalaDayEnd(7, now).getTime()) return 'this_week';
  return 'later';
}

/** Groups a list into buckets, preserving the order it arrived in. */
export function groupByBucket<T extends { due_at: string | null }>(
  tasks: T[],
  now: Date = new Date(),
): Map<TaskBucket, T[]> {
  const out = new Map<TaskBucket, T[]>();
  for (const bucket of BUCKET_ORDER) out.set(bucket, []);
  for (const task of tasks) out.get(bucketOf(task.due_at, now))?.push(task);
  return out;
}

/**
 * A short due label: "Today", "Tomorrow", "Fri", then a date. Weekday names
 * only help inside the coming week — beyond that "Tue" is ambiguous.
 */
export function dueLabel(dueAt: string | null, now: Date = new Date()): string {
  if (!dueAt) return '';
  const due = new Date(dueAt);
  const dayOf = (d: Date) => formatInTimeZone(d, APP_TIMEZONE, 'yyyy-MM-dd');
  const target = dayOf(due);
  if (target === dayOf(now)) return 'Today';
  if (target === dayOf(kampalaDayEnd(1, now))) return 'Tomorrow';
  if (target === dayOf(kampalaDayEnd(-1, now))) return 'Yesterday';
  if (due.getTime() > now.getTime() && due.getTime() <= kampalaDayEnd(6, now).getTime()) {
    return formatInTimeZone(due, APP_TIMEZONE, 'EEE');
  }
  return formatInTimeZone(due, APP_TIMEZONE, 'd MMM');
}

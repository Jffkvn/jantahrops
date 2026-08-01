import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

type Urgency = 'overdue' | 'today' | 'future' | 'none';

/**
 * Classifies next_action_at against the Kampala day boundary. "Today" means
 * the same calendar date in EAT, not "within 24 hours" — a follow-up due this
 * afternoon and one due at 8am read the same to the user.
 */
export function urgencyOf(nextActionAt: string | null): Urgency {
  if (!nextActionAt) return 'none';
  const now = new Date();
  const due = new Date(nextActionAt);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' }); // YYYY-MM-DD
  const todayStr = fmt(now);
  const dueStr = fmt(due);
  if (dueStr < todayStr) return 'overdue';
  if (dueStr === todayStr) return 'today';
  return 'future';
}

const DOT: Record<Urgency, string> = {
  overdue: 'bg-danger',
  today: 'bg-warning',
  future: 'bg-ink-muted',
  none: 'bg-border-strong',
};

export function NextActionDot({
  nextActionAt,
  withLabel = false,
}: {
  nextActionAt: string | null;
  withLabel?: boolean;
}) {
  const urgency = urgencyOf(nextActionAt);
  if (urgency === 'none') {
    return withLabel ? <span className="text-xs text-ink-muted">No next action</span> : null;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[urgency])} />
      {withLabel && nextActionAt && (
        <span
          className={cn(
            'text-xs',
            urgency === 'overdue'
              ? 'text-danger'
              : urgency === 'today'
                ? 'text-warning'
                : 'text-ink-muted',
          )}
        >
          {formatRelative(nextActionAt)}
        </span>
      )}
    </span>
  );
}

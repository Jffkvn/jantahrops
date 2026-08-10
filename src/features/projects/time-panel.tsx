import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, toDateInputValue } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuth } from '@/features/auth/auth-provider';
import { useDeleteTimeEntry, useLogTime, useTimeEntries } from './use-projects';
import { DAY_OPTIONS, formatDays } from './project-meta';

/**
 * Coarse time logging — half-days, once a week, not per task.
 *
 * The plan is explicit that this is deliberately rough, and the UI enforces it:
 * you pick a number of days from a row of buttons, you cannot type 3.7. A
 * precise-looking profit figure built on time nobody actually logged is worse
 * than an honest rough one, and a timesheet nobody fills in produces exactly
 * that.
 */
export function TimePanel({ projectId }: { projectId: string }) {
  const { profile } = useAuth();
  const { data: entries, isLoading } = useTimeEntries(projectId);
  const logTimeMutation = useLogTime();
  const deleteEntry = useDeleteTimeEntry();

  const [days, setDays] = useState<number>(1);
  const [workDate, setWorkDate] = useState(() => toDateInputValue(new Date()));
  const [note, setNote] = useState('');

  const rows = entries ?? [];
  const total = rows.reduce((sum, e) => sum + Number(e.days), 0);

  const submit = async () => {
    if (!workDate) {
      toast.error('Pick the date the work happened.');
      return;
    }
    try {
      await logTimeMutation.mutateAsync({
        project_id: projectId,
        work_date: workDate,
        days,
        note: note.trim() || null,
      });
      setNote('');
      setDays(1);
    } catch {
      toast.error('Could not log that time.');
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Time</h3>
        {total > 0 && (
          <span className="num text-xs text-ink-muted">{formatDays(total)} logged</span>
        )}
      </div>

      <div className="rounded-card border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {DAY_OPTIONS.map((d) => (
            <button
              className={cn(
                'num rounded-pill px-2.5 py-1 text-xs transition-colors',
                days === d
                  ? 'bg-primary-soft font-medium text-primary'
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink-secondary',
              )}
              key={d}
              onClick={() => setDays(d)}
              type="button"
            >
              {d}
            </button>
          ))}
          <span className="text-xs text-ink-muted">days</span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            aria-label="Work date"
            className="h-8 rounded-control border border-border bg-surface px-2 text-xs text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            max={toDateInputValue(new Date())}
            onChange={(e) => setWorkDate(e.target.value)}
            type="date"
            value={workDate}
          />
          <Input
            aria-label="Note"
            className="h-8 min-w-[140px] flex-1"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="What you did (optional)"
            value={note}
          />
          <Button
            disabled={logTimeMutation.isPending}
            onClick={() => void submit()}
            size="sm"
            variant="secondary"
          >
            Log {formatDays(days)}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="mt-2 h-16 w-full rounded-card" />
      ) : rows.length > 0 ? (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {rows.map((entry) => {
            // Only your own time is editable — RLS enforces the same rule, and
            // silently changing a colleague's days changes their profit figure.
            const mine = entry.user_id === profile?.id;
            return (
              <li className="group flex items-center gap-3 px-3 py-2 text-sm" key={entry.id}>
                <span className="num w-16 shrink-0 font-medium text-ink">
                  {formatDays(Number(entry.days))}
                </span>
                <span className="num w-24 shrink-0 text-xs text-ink-muted">
                  {formatDate(entry.work_date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-secondary">
                  {entry.note || <span className="text-ink-muted">—</span>}
                </span>
                <span className="hidden shrink-0 text-xs text-ink-muted sm:block">
                  {entry.user?.full_name || 'Unknown'}
                </span>
                {mine && (
                  <button
                    aria-label="Delete time entry"
                    className="rounded-control p-1 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => {
                      deleteEntry.mutate({ id: entry.id, projectId });
                    }}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">
          Nothing logged yet. Half-days, once a week — enough to know whether the job was
          worth it, not a timesheet.
        </p>
      )}
    </section>
  );
}

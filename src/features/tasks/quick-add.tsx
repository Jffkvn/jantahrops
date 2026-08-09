import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { dateInputToISO, toDateInputValue } from '@/lib/format';
import { kampalaDayEnd } from './task-buckets';
import { useCreateTask } from './use-tasks';
import type { TaskPriority } from '@/types/database';

/** Deadlines land at 17:00 EAT — end of the working day, not the small hours. */
const DUE_HOUR = 17;

const DUE_CHIPS: { label: string; offsetDays: number | null }[] = [
  { label: 'Today', offsetDays: 0 },
  { label: 'Tomorrow', offsetDays: 1 },
  { label: 'Next week', offsetDays: 7 },
  { label: 'No date', offsetDays: null },
];

/**
 * Capture has to be faster than the thought. One field, Enter to save — the
 * date, assignee and priority are all optional and all editable afterwards.
 * Anything that makes adding a task a form is a reason not to add it.
 */
export function QuickAdd({ defaultAssigneeId }: { defaultAssigneeId: string | null }) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(''); // yyyy-MM-dd, '' = no date
  const [priority, setPriority] = useState<TaskPriority>('medium');

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || createTask.isPending) return;
    try {
      await createTask.mutateAsync({
        title: trimmed,
        due_at: dueDate ? dateInputToISO(dueDate, DUE_HOUR) : null,
        assignee_id: defaultAssigneeId,
        priority,
      });
      // Only the title clears. Tasks arrive in runs — three things all due
      // Friday — and re-picking the date for each one is the friction that
      // stops people using a to-do list at all. The chips stay visible, so the
      // state is never a surprise.
      setTitle('');
    } catch {
      toast.error('Could not add the task. Please try again.');
    }
  };

  return (
    <div className="rounded-card border border-border bg-surface p-3 transition-colors focus-within:border-border-strong">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-ink-muted" />
        <Input
          aria-label="New task"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Add a task…"
          value={title}
        />
        <Button
          disabled={!title.trim() || createTask.isPending}
          onClick={() => void submit()}
          size="sm"
          variant="primary"
        >
          {createTask.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Add
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        {DUE_CHIPS.map((chip) => {
          const value = chip.offsetDays === null ? '' : toDateInputValue(kampalaDayEnd(chip.offsetDays));
          const active = dueDate === value;
          return (
            <button
              className={cn(
                'rounded-pill px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'bg-primary-soft font-medium text-primary'
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink-secondary',
              )}
              key={chip.label}
              onClick={() => setDueDate(value)}
              type="button"
            >
              {chip.label}
            </button>
          );
        })}

        <input
          aria-label="Due date"
          className="h-7 rounded-control border border-border bg-surface px-2 text-xs text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => setDueDate(e.target.value)}
          type="date"
          value={dueDate}
        />

        <span className="ml-auto flex items-center gap-1">
          {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => (
            <button
              className={cn(
                'rounded-pill px-2.5 py-1 text-xs capitalize transition-colors',
                priority === p
                  ? PRIORITY_ACTIVE[p]
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink-secondary',
              )}
              key={p}
              onClick={() => setPriority(p)}
              type="button"
            >
              {p}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

const PRIORITY_ACTIVE: Record<TaskPriority, string> = {
  low: 'bg-surface-sunken font-medium text-ink-secondary',
  medium: 'bg-info-soft font-medium text-info',
  high: 'bg-danger-soft font-medium text-danger',
};

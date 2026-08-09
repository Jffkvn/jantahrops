import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { bucketOf, dueLabel } from './task-buckets';
import { RELATED_LABELS, relatedHref, type TaskWithAssignee } from './tasks-api';
import { useDeleteTask, useSetTaskStatus } from './use-tasks';
import type { TaskPriority } from '@/types/database';

/** Priority is a 3px rail on the row, not a badge — visible, never shouty. */
const PRIORITY_RAIL: Record<TaskPriority, string> = {
  low: 'bg-transparent',
  medium: 'bg-info/40',
  high: 'bg-danger',
};

export function TaskRowItem({ task, onEdit }: { task: TaskWithAssignee; onEdit: () => void }) {
  const setStatus = useSetTaskStatus();
  const deleteTask = useDeleteTask();
  // Deleting is irreversible, so the button asks once. A modal for a to-do item
  // would be heavier than the thing it protects.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const done = task.status === 'done';
  const overdue = !done && bucketOf(task.due_at) === 'overdue';
  const href = relatedHref(task.related_type, task.related_id);
  const relatedLabel = task.related_type
    ? (RELATED_LABELS[task.related_type] ?? task.related_type)
    : null;

  // Arming the delete times out — a row left mid-confirm should not stay armed.
  useEffect(() => {
    if (!confirmingDelete) return;
    const t = setTimeout(() => setConfirmingDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingDelete]);

  const remove = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    try {
      await deleteTask.mutateAsync(task.id);
      toast.success('Task deleted');
    } catch {
      // Only an admin may delete; anyone else should be told why nothing happened.
      toast.error('Could not delete this task — an admin can remove it.');
    }
  };

  return (
    <li className="group relative flex items-start gap-3 py-3 pl-4 pr-3 transition-colors hover:bg-surface-sunken/40">
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-[3px]',
          done ? 'bg-transparent' : PRIORITY_RAIL[task.priority],
        )}
      />

      <Checkbox
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        checked={done}
        className="mt-0.5"
        onCheckedChange={(checked) =>
          setStatus.mutate({ id: task.id, status: checked ? 'done' : 'open' })
        }
      />

      <div className="min-w-0 flex-1">
        {/* No `title` attribute here: it would override the accessible name,
            so screen readers would announce every row as "Edit task" instead
            of the task itself. The pencil button carries that label. */}
        <button className="block w-full text-left" onClick={onEdit} type="button">
          <span
            className={cn(
              'text-sm text-ink',
              done && 'text-ink-muted line-through decoration-ink-muted/50',
            )}
          >
            {task.title}
          </span>
        </button>

        {task.description && !done && (
          <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">{task.description}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {task.due_at && (
            <span className={cn('num', overdue ? 'font-medium text-danger' : 'text-ink-muted')}>
              {dueLabel(task.due_at)}
            </span>
          )}

          {relatedLabel &&
            (href ? (
              <Link
                className="flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-ink-secondary transition-colors hover:text-primary"
                to={href}
              >
                <Link2 className="h-3 w-3" />
                {relatedLabel}
              </Link>
            ) : (
              <span className="flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-ink-muted">
                <Link2 className="h-3 w-3" />
                {relatedLabel}
              </span>
            ))}

          {task.assignee && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">
                    {initials(task.assignee.full_name)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{task.assignee.full_name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Actions stay out of the way until the row is under the cursor — but
          only on pointer devices. There is no hover on a phone, so below `sm`
          they are simply always there; otherwise deleting would be impossible.
          Keyboard focus reveals them at every size. */}
      <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <button
          aria-label="Edit task"
          className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onEdit}
          type="button"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label={confirmingDelete ? 'Confirm delete task' : 'Delete task'}
          className={cn(
            'flex items-center gap-1 rounded-control p-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            confirmingDelete
              ? 'bg-danger-soft font-medium text-danger'
              : 'text-ink-muted hover:bg-danger-soft hover:text-danger',
          )}
          disabled={deleteTask.isPending}
          onClick={() => void remove()}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmingDelete && 'Sure?'}
        </button>
      </div>
    </li>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase() || '?';
}

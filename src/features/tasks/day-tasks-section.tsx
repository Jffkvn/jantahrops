import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskRowItem } from './task-row';
import { TaskEditSheet } from './task-edit-sheet';
import { useDueTasks } from './use-tasks';

/**
 * Tasks due today or already late, on the Day View.
 *
 * Hidden entirely when there is nothing due — the Day View already says "you're
 * all caught up" once, and an empty second panel saying the same thing turns a
 * clear morning into a page of nothing.
 */
export function DayTasksSection() {
  const { data: tasks, isLoading } = useDueTasks();
  const [editId, setEditId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <section className="mt-8">
        <Skeleton className="h-14 w-full rounded-card" />
      </section>
    );
  }

  if (!tasks || tasks.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Your tasks
        </h2>
        <Link
          className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
          to="/tasks"
        >
          All tasks
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {tasks.map((task) => (
          <TaskRowItem key={task.id} onEdit={() => setEditId(task.id)} task={task} />
        ))}
      </ul>

      <TaskEditSheet
        onOpenChange={(o) => !o && setEditId(null)}
        task={tasks.find((t) => t.id === editId) ?? null}
      />
    </section>
  );
}

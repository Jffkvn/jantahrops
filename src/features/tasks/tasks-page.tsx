import { useMemo, useState } from 'react';
import { CheckCircle2, ListTodo, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/features/auth/auth-provider';
import { useTeam } from '@/features/team/use-team';
import { useTasks } from './use-tasks';
import { QuickAdd } from './quick-add';
import { TaskRowItem } from './task-row';
import { TaskEditSheet } from './task-edit-sheet';
import { BUCKET_LABELS, BUCKET_ORDER, groupByBucket } from './task-buckets';
import type { TaskStatus } from '@/types/database';

export function TasksPage() {
  const { profile } = useAuth();
  const { data: team } = useTeam();
  // Defaults to "anyone" deliberately. Filtering to "mine" would hide every
  // unassigned task — and on a two-or-three person team most tasks never get
  // assigned to anybody, they just get done. A list that silently omits work is
  // worse than a list that is slightly too long.
  const [assignee, setAssignee] = useState<string>('anyone');
  const [status, setStatus] = useState<TaskStatus | 'all'>('open');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const resolvedAssignee = assignee === 'mine' ? (profile?.id ?? 'anyone') : assignee;
  const params = useMemo(
    () => ({ status, assigneeId: resolvedAssignee }),
    [status, resolvedAssignee],
  );
  const { data: tasks, isLoading } = useTasks(params);

  // Adding while filtered to a colleague means the task is for them; filtered
  // to "unassigned" means deliberately nobody. Otherwise it lands on me.
  const quickAddAssignee =
    assignee === 'unassigned' ? null : assignee === 'anyone' || assignee === 'mine'
      ? (profile?.id ?? null)
      : assignee;

  // Search filters what is already loaded. The list is capped at 500 rows and
  // this is a two-person to-do list, not a corpus — a round trip per keystroke
  // would be slower and no more correct.
  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return tasks ?? [];
    return (tasks ?? []).filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        (t.description ?? '').toLowerCase().includes(term),
    );
  }, [tasks, term]);

  const grouped = useMemo(() => groupByBucket(filtered), [filtered]);
  const openCount = filtered.filter((t) => t.status === 'open').length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        description="Everything you've told yourself to do — on its own, or attached to a lead, invoice or vacancy."
        title="Tasks"
      />

      <QuickAdd defaultAssigneeId={quickAddAssignee} />

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tasks…"
            value={search}
          />
        </div>

        <Select onValueChange={setAssignee} value={assignee}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">Mine</SelectItem>
            <SelectItem value="anyone">Anyone</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {(team ?? [])
              .filter((m) => m.id !== profile?.id)
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => setStatus(v as TaskStatus | 'all')} value={status}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton className="h-14 w-full rounded-card" key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          description={
            term
              ? 'No tasks match that filter.'
              : status === 'done'
                ? 'Nothing completed yet under this filter.'
                : 'Add the first one above — a title is all it needs. Give it a date and it will show up on your day view.'
          }
          headline={term ? 'Nothing found' : status === 'open' ? 'Nothing on your list' : 'No tasks'}
          icon={
            status === 'open' && !term ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <ListTodo className="h-6 w-6" />
            )
          }
        />
      ) : (
        <div className="space-y-6">
          {BUCKET_ORDER.map((bucket) => {
            const rows = grouped.get(bucket) ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={bucket}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <span className={bucket === 'overdue' ? 'text-danger' : undefined}>
                    {BUCKET_LABELS[bucket]}
                  </span>
                  <span className="num rounded-pill bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                    {rows.length}
                  </span>
                </h2>
                <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                  {rows.map((task) => (
                    <TaskRowItem key={task.id} onEdit={() => setEditId(task.id)} task={task} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <p className="mt-4 text-xs text-ink-muted">
          <span className="num font-medium text-ink-secondary">{openCount}</span> open
          {status === 'all' && ` · ${filtered.length - openCount} done`}
        </p>
      )}

      <TaskEditSheet
        onOpenChange={(o) => !o && setEditId(null)}
        task={filtered.find((t) => t.id === editId) ?? null}
      />
    </div>
  );
}

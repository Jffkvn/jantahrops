import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  useCreateMilestone,
  useDeleteMilestone,
  useMilestones,
  useSetMilestoneStatus,
} from './use-projects';
import { MILESTONE_LABELS, MILESTONE_TONE } from './project-meta';
import type { MilestoneStatus, ProjectMilestoneRow } from '@/types/database';

export function MilestonesPanel({ projectId }: { projectId: string }) {
  const { data: milestones, isLoading } = useMilestones(projectId);
  const createMilestone = useCreateMilestone();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const add = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await createMilestone.mutateAsync({
        project_id: projectId,
        title: trimmed,
        due_date: dueDate || null,
      });
      setTitle('');
      setDueDate('');
    } catch {
      toast.error('Could not add the milestone.');
    }
  };

  const rows = milestones ?? [];
  const done = rows.filter((m) => m.status === 'done').length;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Milestones
        </h3>
        {rows.length > 0 && (
          <span className="num text-xs text-ink-muted">
            {done} of {rows.length} done
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-card" />
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="mb-2 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {rows.map((m) => (
                <MilestoneRow key={m.id} milestone={m} projectId={projectId} />
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2">
            <Input
              aria-label="New milestone"
              className="h-8 min-w-[160px] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void add();
                }
              }}
              placeholder="Add a milestone…"
              value={title}
            />
            <input
              aria-label="Milestone due date"
              className="h-8 rounded-control border border-border bg-surface px-2 text-xs text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(e) => setDueDate(e.target.value)}
              type="date"
              value={dueDate}
            />
            <Button
              disabled={!title.trim() || createMilestone.isPending}
              onClick={() => void add()}
              size="sm"
              variant="secondary"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {rows.length === 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Milestones are what the client is waiting on. The soonest open one drives the
              project's due date everywhere else.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function MilestoneRow({
  milestone,
  projectId,
}: {
  milestone: ProjectMilestoneRow;
  projectId: string;
}) {
  const setStatus = useSetMilestoneStatus();
  const deleteMilestone = useDeleteMilestone();
  const [confirming, setConfirming] = useState(false);

  const done = milestone.status === 'done';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !done && milestone.due_date !== null && milestone.due_date < today;

  const remove = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    try {
      await deleteMilestone.mutateAsync({ id: milestone.id, projectId });
    } catch {
      toast.error('Could not delete that milestone.');
    }
  };

  return (
    <li className="group flex items-center gap-2.5 px-3 py-2">
      <Checkbox
        aria-label={done ? `Reopen ${milestone.title}` : `Complete ${milestone.title}`}
        checked={done}
        onCheckedChange={(checked) =>
          setStatus.mutate({
            id: milestone.id,
            projectId,
            // Reopening returns it to pending; the trigger clears completed_at.
            status: checked ? 'done' : 'pending',
          })
        }
      />

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm text-ink', done && 'text-ink-muted line-through')}>
          {milestone.title}
        </p>
        {milestone.due_date && (
          <p className={cn('num text-xs', overdue ? 'font-medium text-danger' : 'text-ink-muted')}>
            {formatDate(milestone.due_date)}
          </p>
        )}
      </div>

      {/* Blocked and in-progress matter enough to set explicitly; done is the
          checkbox, so it is not repeated here. */}
      {!done && (
        <Select
          onValueChange={(v) =>
            setStatus.mutate({ id: milestone.id, projectId, status: v as MilestoneStatus })
          }
          value={milestone.status}
        >
          <SelectTrigger
            className={cn('h-7 w-[120px] border-0 text-xs', MILESTONE_TONE[milestone.status])}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{MILESTONE_LABELS.pending}</SelectItem>
            <SelectItem value="in_progress">{MILESTONE_LABELS.in_progress}</SelectItem>
            <SelectItem value="blocked">{MILESTONE_LABELS.blocked}</SelectItem>
          </SelectContent>
        </Select>
      )}

      <button
        aria-label={confirming ? 'Confirm delete milestone' : 'Delete milestone'}
        className={cn(
          'flex items-center gap-1 rounded-control p-1.5 text-xs transition-colors focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100',
          confirming
            ? 'bg-danger-soft font-medium text-danger !opacity-100'
            : 'text-ink-muted hover:bg-danger-soft hover:text-danger',
        )}
        onClick={() => void remove()}
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {confirming && 'Sure?'}
      </button>
    </li>
  );
}

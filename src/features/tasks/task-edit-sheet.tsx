import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { dateInputToISO, formatDateTime, toDateInputValue } from '@/lib/format';
import { useTeam } from '@/features/team/use-team';
import { useUpdateTask } from './use-tasks';
import type { TaskWithAssignee } from './tasks-api';
import type { TaskPriority } from '@/types/database';

const DUE_HOUR = 17;
const UNASSIGNED = '__unassigned__';

export function TaskEditSheet({
  task,
  onOpenChange,
}: {
  task: TaskWithAssignee | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: team } = useTeam();
  const updateTask = useUpdateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [priority, setPriority] = useState<TaskPriority>('medium');

  // Reload the form whenever a different task is opened.
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setDueDate(toDateInputValue(task.due_at));
    setAssignee(task.assignee_id ?? UNASSIGNED);
    setPriority(task.priority);
  }, [task]);

  const save = async () => {
    if (!task) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('A task needs a title.');
      return;
    }
    try {
      await updateTask.mutateAsync({
        id: task.id,
        patch: {
          title: trimmed,
          description: description.trim() || null,
          // Only re-derive the instant when the DAY changed. Re-running
          // dateInputToISO on an untouched field would quietly move a task
          // scheduled for 09:00 to 17:00 every time the sheet was saved.
          ...(toDateInputValue(task.due_at) === dueDate
            ? {}
            : { due_at: dueDate ? dateInputToISO(dueDate, DUE_HOUR) : null }),
          assignee_id: assignee === UNASSIGNED ? null : assignee,
          priority,
        },
      });
      toast.success('Task updated');
      onOpenChange(false);
    } catch {
      toast.error('Could not save the task. Please try again.');
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={task !== null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Edit task</SheetTitle>
          <SheetDescription>
            {task ? `Added ${formatDateTime(task.created_at)}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              value={title}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Notes</Label>
            <Textarea
              id="task-description"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any detail you'll want when you come back to this."
              rows={4}
              value={description}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due</Label>
              <Input
                id="task-due"
                onChange={(e) => setDueDate(e.target.value)}
                type="date"
                value={dueDate}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select onValueChange={(v) => setPriority(v as TaskPriority)} value={priority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            <Select onValueChange={setAssignee} value={assignee}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {(team ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {task?.completed_at && (
            <p className="text-xs text-ink-muted">
              Completed {formatDateTime(task.completed_at)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={updateTask.isPending}
              onClick={() => void save()}
              type="button"
              variant="primary"
            >
              {updateTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

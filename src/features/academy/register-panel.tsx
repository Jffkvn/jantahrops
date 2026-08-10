import { useState } from 'react';
import { CalendarPlus, ClipboardCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  useAttendance,
  useCreateSession,
  useDeleteSession,
  useMarkAttendance,
  useSessions,
} from './use-academy';
import type { EnrolmentWithContact } from './academy-api';

/**
 * Sessions and the register.
 *
 * Attendance is one row per person per session, not a jsonb blob on the
 * enrolment — taken from classroomio's `group_attendance`. It means "who missed
 * session 3?" is a query rather than a parse, and marking twice is a correction
 * (a unique constraint on session + enrolment) rather than a duplicate.
 */
export function RegisterPanel({
  cohortId,
  enrolments,
}: {
  cohortId: string;
  enrolments: EnrolmentWithContact[];
}) {
  const { data: sessions, isLoading } = useSessions(cohortId);
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const rows = sessions ?? [];

  const add = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const created = await createSession.mutateAsync({
        cohort_id: cohortId,
        title: trimmed,
        session_date: date || null,
      });
      setTitle('');
      setDate('');
      // Open the new session straight away — you add one in order to mark it.
      setOpenSessionId(created.id);
    } catch {
      toast.error('Could not add that session.');
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Sessions &amp; attendance
        </h3>
        {rows.length > 0 && (
          <span className="num text-xs text-ink-muted">
            {rows.length} {rows.length === 1 ? 'session' : 'sessions'}
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-card" />
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="mb-2 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {rows.map((session) => {
                const open = openSessionId === session.id;
                return (
                  <li key={session.id}>
                    <div className="group flex items-center gap-3 px-3 py-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setOpenSessionId(open ? null : session.id)}
                        type="button"
                      >
                        <p className="truncate text-sm text-ink">{session.title}</p>
                        <p className="num text-xs text-ink-muted">
                          {session.session_date ? formatDate(session.session_date) : 'No date'}
                          {session.marked > 0 && (
                            <> · {session.present} of {session.marked} present</>
                          )}
                        </p>
                      </button>

                      <span className="shrink-0 text-xs text-ink-muted">
                        {open ? 'Hide' : 'Mark'}
                      </span>

                      <button
                        aria-label="Delete session"
                        className="shrink-0 rounded-control p-1 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => {
                          deleteSession.mutate(session.id);
                          if (open) setOpenSessionId(null);
                        }}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {open && <Register enrolments={enrolments} sessionId={session.id} />}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-2">
            <Input
              aria-label="New session"
              className="h-8 min-w-[150px] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void add();
                }
              }}
              placeholder="Add a session…"
              value={title}
            />
            <input
              aria-label="Session date"
              className="h-8 rounded-control border border-border bg-surface px-2 text-xs text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(e) => setDate(e.target.value)}
              type="date"
              value={date}
            />
            <Button
              disabled={!title.trim() || createSession.isPending}
              onClick={() => void add()}
              size="sm"
              variant="secondary"
            >
              <CalendarPlus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {rows.length === 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Add the days you actually meet, then tick who turned up. Attendance is stored per
              person per session, so you can answer "who missed day two?" later.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Register({
  sessionId,
  enrolments,
}: {
  sessionId: string;
  enrolments: EnrolmentWithContact[];
}) {
  const { data: marks, isLoading } = useAttendance(sessionId);
  const mark = useMarkAttendance();

  if (enrolments.length === 0) {
    return (
      <p className="border-t border-border bg-surface-sunken/40 px-3 py-2.5 text-xs text-ink-muted">
        Nobody is enrolled yet, so there is no register to take.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="border-t border-border bg-surface-sunken/40 px-3 py-2.5">
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const present = enrolments.filter((e) => marks?.[e.id]).length;

  return (
    <div className="border-t border-border bg-surface-sunken/40 px-3 py-2.5">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-muted">
        <span className="num">{present}</span> of <span className="num">{enrolments.length}</span>{' '}
        present
      </p>
      <ul className="space-y-1">
        {enrolments.map((e) => {
          const isPresent = Boolean(marks?.[e.id]);
          return (
            <li className="flex items-center gap-2.5" key={e.id}>
              <Checkbox
                aria-label={`${isPresent ? 'Mark absent' : 'Mark present'}: ${e.contact?.full_name ?? 'student'}`}
                checked={isPresent}
                onCheckedChange={(checked) =>
                  mark.mutate({
                    session_id: sessionId,
                    enrolment_id: e.id,
                    is_present: Boolean(checked),
                  })
                }
              />
              <span
                className={cn(
                  'truncate text-sm',
                  isPresent ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {e.contact?.full_name ?? 'Unknown'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, ExternalLink, FileText, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/money';
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
  useCohort,
  useEnrolmentDocuments,
  useEnrolments,
  useSetEnrolmentStatus,
  useUpdateCohort,
} from './use-academy';
import { EnrolSheet } from './enrol-sheet';
import { RegisterPanel } from './register-panel';
import {
  COHORT_STATUS_LABELS,
  COHORT_STATUS_TONE,
  DELIVERY_LABELS,
  ENROLMENT_LABELS,
  ENROLMENT_TONE,
  MANUAL_ENROLMENT_STATUSES,
} from './academy-meta';
import type { CohortStatus, EnrolmentStatus } from '@/types/database';
import type { EnrolmentWithContact } from './academy-api';

export function CohortDetailSheet({
  cohortId,
  onOpenChange,
}: {
  cohortId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: cohort, isLoading } = useCohort(cohortId);
  const { data: enrolments } = useEnrolments(cohortId);
  const updateCohort = useUpdateCohort();
  const [enrolOpen, setEnrolOpen] = useState(false);

  const enrolmentIds = useMemo(() => (enrolments ?? []).map((e) => e.id), [enrolments]);
  const { data: docsByEnrolment } = useEnrolmentDocuments(enrolmentIds);

  const changeStatus = async (status: CohortStatus) => {
    if (!cohortId) return;
    try {
      await updateCohort.mutateAsync({ id: cohortId, patch: { status } });
      toast.success(`Cohort is now ${COHORT_STATUS_LABELS[status].toLowerCase()}`);
    } catch {
      toast.error('Could not change the status.');
    }
  };

  const s = cohort?.summary;

  return (
    <Sheet onOpenChange={onOpenChange} open={cohortId !== null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="right">
        {isLoading || !cohort ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{cohort.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {cohort.course && <span>{cohort.course.title}</span>}
                  <span>{DELIVERY_LABELS[cohort.delivery_mode]}</span>
                  {cohort.facilitator?.full_name && <span>{cohort.facilitator.full_name}</span>}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Select onValueChange={(v) => void changeStatus(v as CohortStatus)} value={cohort.status}>
                  <SelectTrigger
                    className={cn('h-8 w-[200px] border-0', COHORT_STATUS_TONE[cohort.status])}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(COHORT_STATUS_LABELS) as CohortStatus[]).map((st) => (
                      <SelectItem key={st} value={st}>
                        {COHORT_STATUS_LABELS[st]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button className="ml-auto" onClick={() => setEnrolOpen(true)} size="sm" variant="primary">
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Enrol someone
                </Button>
              </div>

              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                {cohort.start_date && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(cohort.start_date)}
                    {cohort.end_date && ` – ${formatDate(cohort.end_date)}`}
                  </span>
                )}
                {cohort.location && <span>{cohort.location}</span>}
                {cohort.meeting_url && (
                  <a
                    className="text-primary hover:underline"
                    href={cohort.meeting_url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Meeting link
                    <ExternalLink className="ml-0.5 inline h-3 w-3" />
                  </a>
                )}
              </p>

              {/* Seats and money at a glance. `unbilled` is the number that
                  costs you: places held that nobody has been invoiced for. */}
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Enrolled" value={`${s?.enrolled ?? 0}`} />
                <Stat
                  label={cohort.capacity === null ? 'Seats' : 'Seats left'}
                  value={s?.seats_left === null || s?.seats_left === undefined ? 'Uncapped' : `${s.seats_left}`}
                  warn={s?.seats_left === 0}
                />
                <Stat
                  label="Not yet invoiced"
                  value={`${s?.unbilled ?? 0}`}
                  warn={(s?.unbilled ?? 0) > 0}
                />
              </div>

              <section>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                    <Users className="h-3.5 w-3.5" />
                    Roster
                  </h3>
                  {(s?.entitled ?? 0) > 0 && (
                    <span className="num text-xs text-ink-muted">{s?.entitled} paid</span>
                  )}
                </div>

                {(enrolments?.length ?? 0) === 0 ? (
                  <p className="rounded-card border border-border bg-surface p-4 text-xs text-ink-muted">
                    Nobody enrolled yet. Enrolling adds the <span className="font-medium">student</span>{' '}
                    role to that person's contact record, so they stay one person across the
                    whole app.
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                    {(enrolments ?? []).map((e) => (
                      <EnrolmentRow
                        documents={docsByEnrolment?.get(e.id) ?? []}
                        enrolment={e}
                        key={e.id}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <RegisterPanel cohortId={cohort.id} enrolments={enrolments ?? []} />
            </div>

            <EnrolSheet
              cohortId={cohort.id}
              onOpenChange={setEnrolOpen}
              open={enrolOpen}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2">
      <p className={cn('num text-md font-semibold', warn ? 'text-warning' : 'text-ink')}>{value}</p>
      <p className="text-[11px] text-ink-muted">{label}</p>
    </div>
  );
}

function EnrolmentRow({
  enrolment,
  documents,
}: {
  enrolment: EnrolmentWithContact;
  documents: { id: string; number: string | null; total_ugx: number; status: string }[];
}) {
  const setStatus = useSetEnrolmentStatus();
  const entitled = enrolment.entitled_at !== null;

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary"
      >
        {initials(enrolment.contact?.full_name ?? '?')}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {enrolment.contact?.full_name ?? 'Unknown'}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 truncate text-xs text-ink-muted">
          {enrolment.contact?.email && <span className="truncate">{enrolment.contact.email}</span>}
          {enrolment.organisation && <span>· {enrolment.organisation.name}</span>}
        </p>
      </div>

      {documents.map((d) => (
        <Link
          className="num flex shrink-0 items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-secondary transition-colors hover:text-primary"
          key={d.id}
          to={`/finance/${d.id}`}
        >
          <FileText className="h-3 w-3" />
          {/* A missing number means not yet issued, which is not the same as
              the document's status — labelling a settled invoice "draft" next
              to a "Paid" badge contradicts itself. */}
          {d.number ?? 'unnumbered'}
          <Money className="text-[11px]" compact value={BigInt(d.total_ugx)} />
        </Link>
      ))}

      {/* `paid` is set by invoice settlement, never by hand — offering it here
          would let the roster disagree with the money. */}
      {entitled ? (
        <span
          className={cn('rounded-pill px-2 py-0.5 text-[11px]', ENROLMENT_TONE[enrolment.status])}
          title={`Entitled ${formatDate(enrolment.entitled_at!)} — set when the invoice settled`}
        >
          {ENROLMENT_LABELS[enrolment.status]}
        </span>
      ) : (
        <Select
          onValueChange={(v) =>
            setStatus.mutate({ id: enrolment.id, status: v as Exclude<EnrolmentStatus, 'paid'> })
          }
          value={enrolment.status}
        >
          <SelectTrigger
            className={cn('h-7 w-[130px] border-0 text-xs', ENROLMENT_TONE[enrolment.status])}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MANUAL_ENROLMENT_STATUSES.map((st) => (
              <SelectItem key={st} value={st}>
                {ENROLMENT_LABELS[st]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </li>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase() || '?';
}

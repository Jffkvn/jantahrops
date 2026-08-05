import { useState } from 'react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/status-chip';
import { formatRelative } from '@/lib/format';
import { BOARD_STAGES, stageMeta } from './recruitment-meta';
import { useApplications, useMoveStage, useVacancy, useUpdateVacancy } from './use-recruitment';
import type { ApplicationWithRelations } from './recruitment-api';
import type { ApplicationStage } from '@/types/database';

export function ApplicationBoard({
  vacancyId,
  onOpenApplication,
}: {
  vacancyId: string;
  onOpenApplication: (id: string) => void;
}) {
  const { data: applications, isLoading } = useApplications(vacancyId);
  const moveStage = useMoveStage(vacancyId);
  const { data: vacancy } = useVacancy(vacancyId);
  const updateVacancy = useUpdateVacancy(vacancyId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStage | null>(null);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {BOARD_STAGES.map((s) => (
          <div className="w-64 shrink-0 space-y-3" key={s.value}>
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-24 w-full rounded-control" />
            <Skeleton className="h-24 w-full rounded-control" />
          </div>
        ))}
      </div>
    );
  }

  const rows = applications ?? [];
  const byStage = (stage: ApplicationStage) => rows.filter((a) => a.stage === stage);

  const drop = (stage: ApplicationStage) => {
    if (dragId) {
      const app = rows.find((a) => a.id === dragId);
      if (app && app.stage !== stage) {
        moveStage.mutate({ id: dragId, stage });
        if (stage === 'hired' && vacancy && vacancy.status !== 'closed') {
          updateVacancy.mutate(
            { status: 'closed' },
            { onSuccess: () => toast.success('Candidate hired — vacancy closed') },
          );
        }
      }
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {BOARD_STAGES.map((stage) => {
        const stageRows = byStage(stage.value);
        return (
          <div
            className={cn(
              'flex w-64 shrink-0 flex-col rounded-card border p-2 transition-colors',
              overStage === stage.value
                ? 'border-primary bg-primary-soft/40'
                : 'border-transparent bg-surface-sunken/50',
            )}
            key={stage.value}
            onDragLeave={() => setOverStage((s) => (s === stage.value ? null : s))}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(stage.value);
            }}
            onDrop={() => drop(stage.value)}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                {stage.label}
                <span className="rounded-pill bg-surface px-1.5 text-xs font-medium text-ink-muted">
                  {stageRows.length}
                </span>
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-1">
              {stageRows.map((app) => (
                <ApplicationCard
                  application={app}
                  key={app.id}
                  onClick={() => onOpenApplication(app.id)}
                  onDragStart={() => setDragId(app.id)}
                />
              ))}
              {stageRows.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-ink-muted">Nothing here yet</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ApplicationCard({
  application,
  onClick,
  onDragStart,
}: {
  application: ApplicationWithRelations;
  onClick: () => void;
  onDragStart: () => void;
}) {
  const name = application.candidateContact?.full_name ?? 'Unnamed candidate';
  const headline = application.candidate?.headline;
  const skills = application.candidate?.skills ?? [];
  const meta = stageMeta(application.stage);
  const candidate = application.candidate;

  return (
    <div
      className="cursor-grab rounded-control border border-border bg-surface p-3 shadow-card transition-shadow hover:shadow-float"
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink">
          {name}
          {candidate?.rating != null && candidate.rating > 0 && (
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                candidate.rating >= 4
                  ? 'bg-success'
                  : candidate.rating >= 3
                    ? 'bg-warning'
                    : 'bg-danger',
              )}
              title={`Rated ${candidate.rating} / 5`}
            />
          )}
        </p>
        <StatusChip showDot={false} variant={meta.tone}>
          {meta.label}
        </StatusChip>
      </div>
      {headline && <p className="mt-0.5 line-clamp-2 text-xs text-ink-secondary">{headline}</p>}
      <p className="mt-2 text-xs text-ink-muted">
        {skills.slice(0, 3).join(' · ')}
        {skills.length > 3 ? ` · +${skills.length - 3}` : ''} · applied{' '}
        {formatRelative(application.applied_at)}
      </p>
    </div>
  );
}
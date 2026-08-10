import { Link } from 'react-router';
import { Building2, ExternalLink, FileText, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { useProject, useProjectMoney, useProjectPnl, useUpdateProject } from './use-projects';
import { ProjectPnlPanel } from './project-pnl-panel';
import { MilestonesPanel } from './milestones-panel';
import { TimePanel } from './time-panel';
import { STAGE_LABELS, STAGE_TONE, projectTypeLabel } from './project-meta';
import { cn } from '@/lib/cn';
import type { ProjectStage } from '@/types/database';

export function ProjectDetailSheet({
  projectId,
  onOpenChange,
}: {
  projectId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: project, isLoading } = useProject(projectId);
  const { data: pnl, isLoading: pnlLoading } = useProjectPnl(projectId);
  const { data: money } = useProjectMoney(projectId);
  const updateProject = useUpdateProject();

  const changeStage = async (stage: ProjectStage) => {
    if (!projectId) return;
    try {
      await updateProject.mutateAsync({ id: projectId, patch: { stage } });
      toast.success(`Moved to ${STAGE_LABELS[stage].toLowerCase()}`);
    } catch {
      toast.error('Could not change the stage.');
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={projectId !== null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" side="right">
        {isLoading || !project ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full rounded-card" />
            <Skeleton className="h-32 w-full rounded-card" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{project.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {project.organisation && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {project.organisation.name}
                    </span>
                  )}
                  {project.contact && <span>{project.contact.full_name}</span>}
                  {projectTypeLabel(project.project_type) && (
                    <span>{projectTypeLabel(project.project_type)}</span>
                  )}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              {/* Stage is the one thing you change often, so it sits at the top
                  as a control rather than a badge you have to go and edit. */}
              <div className="flex flex-wrap items-center gap-3">
                <Select onValueChange={(v) => void changeStage(v as ProjectStage)} value={project.stage}>
                  <SelectTrigger className={cn('h-8 w-[180px] border-0', STAGE_TONE[project.stage])}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STAGE_LABELS) as ProjectStage[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="ml-auto text-right">
                  <Money
                    className="num text-md"
                    value={BigInt(project.contracted_value_ugx)}
                  />
                  <p className="text-[11px] text-ink-muted">contracted</p>
                </div>
              </div>

              {(project.start_date || project.end_date || project.owner) && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  {project.start_date && <span>Started {formatDate(project.start_date)}</span>}
                  {project.end_date && <span>Ends {formatDate(project.end_date)}</span>}
                  {project.owner?.full_name && <span>Owner: {project.owner.full_name}</span>}
                </p>
              )}

              {project.description && (
                <p className="whitespace-pre-line rounded-card border border-border bg-surface-sunken/40 p-3 text-sm text-ink-secondary">
                  {project.description}
                </p>
              )}

              <ProjectPnlPanel isLoading={pnlLoading} pnl={pnl} />

              <MilestonesPanel projectId={project.id} />

              <TimePanel projectId={project.id} />

              {/* Money attached to this project. Read-only here: raising an
                  invoice belongs in Finance, and duplicating that flow would
                  give two places to get numbering and VAT wrong. */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  Invoices &amp; expenses
                </h3>

                {(money?.documents.length ?? 0) === 0 && (money?.expenses.length ?? 0) === 0 ? (
                  <p className="rounded-card border border-border bg-surface p-3 text-xs text-ink-muted">
                    Nothing billed or spent against this project yet. In Finance, set a
                    document's related record to this project and it will appear here and in
                    the P&amp;L above.
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                    {(money?.documents ?? []).map((d) => (
                      <li key={d.id}>
                        <Link
                          className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface-sunken/40"
                          to={`/finance/${d.id}`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                          {/* A missing number does not mean draft — the status
                              column is the authority. Labelling an issued,
                              part-paid invoice "Draft invoice" next to its own
                              "Part paid" status is a straight contradiction. */}
                          <span className="num min-w-0 flex-1 truncate text-ink">
                            {d.number ?? (
                              <span className="capitalize">
                                {d.type} <span className="text-ink-muted">(unnumbered)</span>
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs capitalize text-ink-muted">
                            {d.status.replace('_', ' ')}
                          </span>
                          <Money className="num shrink-0 text-sm" value={BigInt(d.total_ugx)} />
                          <ExternalLink className="h-3 w-3 shrink-0 text-ink-muted" />
                        </Link>
                      </li>
                    ))}
                    {(money?.expenses ?? []).map((e) => (
                      <li className="flex items-center gap-3 px-3 py-2 text-sm" key={e.id}>
                        <Receipt className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                        <span className="min-w-0 flex-1 truncate text-ink-secondary">
                          {e.description || e.category}
                          {e.vendor && <span className="text-ink-muted"> · {e.vendor}</span>}
                        </span>
                        <span className="num shrink-0 text-xs text-ink-muted">
                          {formatDate(e.incurred_on)}
                        </span>
                        <span className="num shrink-0 text-sm text-ink-secondary">
                          −<Money className="text-sm" value={BigInt(e.amount_ugx)} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

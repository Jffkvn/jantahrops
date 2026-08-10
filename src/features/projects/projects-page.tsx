import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Briefcase, Building2, CalendarClock, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useAuth } from '@/features/auth/auth-provider';
import { useTeam } from '@/features/team/use-team';
import { useProjects } from './use-projects';
import { CreateProjectSheet } from './create-project-sheet';
import { ProjectDetailSheet } from './project-detail-sheet';
import { STAGE_LABELS, STAGE_TONE, projectTypeLabel } from './project-meta';
import type { ProjectListItem } from './projects-api';
import type { ProjectStage } from '@/types/database';

export function ProjectsPage() {
  const { profile } = useAuth();
  const { data: team } = useTeam();
  const [scope, setScope] = useState<'open' | 'all' | ProjectStage>('open');
  const [owner, setOwner] = useState('anyone');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: ?project=<id> opens a project (used by ⌘K and other modules).
  useEffect(() => {
    const p = searchParams.get('project');
    if (p) {
      setOpenId(p);
      searchParams.delete('project');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(
    () => ({ scope, ownerId: owner, search: debounced }),
    [scope, owner, debounced],
  );
  const { data: projects, isLoading } = useProjects(params);

  const rows = projects ?? [];
  const totalContracted = rows.reduce((sum, p) => sum + p.contracted_value_ugx, 0);

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)} variant="primary">
            <Plus className="mr-1.5 h-4 w-4" />
            New project
          </Button>
        }
        description="Work you have been contracted to deliver — what it's worth, what's due, and whether it's making money."
        title="Projects"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            value={search}
          />
        </div>

        <Select onValueChange={(v) => setScope(v as typeof scope)} value={scope}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="all">All stages</SelectItem>
            {(Object.keys(STAGE_LABELS) as ProjectStage[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={setOwner} value={owner}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anyone">Anyone</SelectItem>
            {profile && <SelectItem value={profile.id}>Mine</SelectItem>}
            {(team ?? [])
              .filter((m) => m.id !== profile?.id)
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && rows.length > 0 && (
        <p className="mb-2 text-xs text-ink-muted">
          <span className="num font-medium text-ink-secondary">{rows.length}</span>{' '}
          {rows.length === 1 ? 'project' : 'projects'}
          {totalContracted > 0 && (
            <>
              {' · '}
              <Money className="num" compact value={BigInt(totalContracted)} /> contracted
            </>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton className="h-24 w-full rounded-card" key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => setCreateOpen(true)} variant="primary">
              <Plus className="mr-1.5 h-4 w-4" />
              New project
            </Button>
          }
          description={
            debounced
              ? 'No projects match that search.'
              : scope === 'open'
                ? 'Nothing in delivery right now. Create a project when you win work — it gives the engagement a home for its milestones, time and invoices.'
                : 'No projects yet.'
          }
          headline={debounced ? 'Nothing found' : 'No projects'}
          icon={<Briefcase className="h-6 w-6" />}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((project) => (
            <ProjectCard key={project.id} onOpen={() => setOpenId(project.id)} project={project} />
          ))}
        </ul>
      )}

      <CreateProjectSheet onOpenChange={setCreateOpen} open={createOpen} />
      <ProjectDetailSheet onOpenChange={(o) => !o && setOpenId(null)} projectId={openId} />
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: ProjectListItem; onOpen: () => void }) {
  const pnl = project.pnl;
  const typeLabel = projectTypeLabel(project.project_type);

  // Overdue is judged on the next open milestone, not the project end date: the
  // end date is a plan, the milestone is a commitment someone is waiting on.
  const today = new Date().toISOString().slice(0, 10);
  const overdue = project.nextDueDate !== null && project.nextDueDate < today;

  return (
    <li>
      <button
        className="w-full rounded-card border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong"
        onClick={onOpen}
        type="button"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium text-ink">{project.name}</p>
              <span
                className={cn('rounded-pill px-2 py-0.5 text-[11px]', STAGE_TONE[project.stage])}
              >
                {STAGE_LABELS[project.stage]}
              </span>
              {typeLabel && (
                <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-muted">
                  {typeLabel}
                </span>
              )}
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
              {project.organisation && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 shrink-0" />
                  {project.organisation.name}
                </span>
              )}
              {project.end_date && <span>Ends {formatDate(project.end_date)}</span>}
              {project.owner?.full_name && <span>{project.owner.full_name}</span>}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <Money
              className="num text-md font-semibold text-ink"
              value={BigInt(project.contracted_value_ugx)}
            />
            <p className="text-[11px] text-ink-muted">contracted</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2.5 text-xs">
          {project.openMilestones > 0 ? (
            <span
              className={cn(
                'flex items-center gap-1',
                overdue ? 'font-medium text-danger' : 'text-ink-secondary',
              )}
            >
              <CalendarClock className="h-3 w-3 shrink-0" />
              <span className="num">{project.openMilestones}</span> open
              {project.nextDueDate && <> · next {formatDate(project.nextDueDate)}</>}
            </span>
          ) : (
            <span className="text-ink-muted">No open milestones</span>
          )}

          {pnl && (
            <>
              {pnl.days_logged > 0 && (
                <span className="num text-ink-muted">{pnl.days_logged} days logged</span>
              )}
              {pnl.received_ugx > 0 && (
                <span className="text-ink-muted">
                  <Money className="num" compact value={BigInt(pnl.received_ugx)} /> received
                </span>
              )}
              {/* Null profit means no day rate is set. Saying nothing is better
                  than showing a number that ignores the cost of the work. */}
              {pnl.estimated_profit_ugx !== null && (
                <span
                  className={cn(
                    'ml-auto num font-medium',
                    pnl.estimated_profit_ugx >= 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  <Money compact value={BigInt(pnl.estimated_profit_ugx)} /> est. profit
                </span>
              )}
            </>
          )}
        </div>
      </button>
    </li>
  );
}

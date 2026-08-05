import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, FileText, Pencil, X, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/status-chip';
import { formatDate } from '@/lib/format';
import { applicantCount } from './recruitment-api';
import { PIPELINE_STAGES, VACANCY_STATUS_LABELS, VACANCY_STATUS_TONES, stageMeta } from './recruitment-meta';
import { useVacancy, useApplications, useCloseVacancy, usePublishVacancy } from './use-recruitment';
import { ApplicationBoard } from './application-board';
import { ApplicationDetailSheet } from './application-detail-sheet';
import { VacancyEditorSheet } from './vacancy-editor-sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApplicationStage } from '@/types/database';

export function VacancyPipelinePage() {
  const { vacancyId } = useParams<{ vacancyId: string }>();
  const navigate = useNavigate();
  const { data: vacancy, isLoading } = useVacancy(vacancyId ?? '');
  const publish = usePublishVacancy(vacancyId ?? '');
  const close = useCloseVacancy(vacancyId ?? '');
  const [editorOpen, setEditorOpen] = useState(false);
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'table'>('board');
  const [stageFilter, setStageFilter] = useState<ApplicationStage | 'all'>('all');
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link from ⌘K / Day View signals: ?application=<id> opens the sheet.
  useEffect(() => {
    const appParam = searchParams.get('application');
    if (appParam) {
      setOpenApplicationId(appParam);
      searchParams.delete('application');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (isLoading) {
    return <div className="p-4 text-sm text-ink-secondary">Loading vacancy…</div>;
  }

  if (!vacancy) {
    return <div className="p-4 text-sm text-ink-secondary">Vacancy not found.</div>;
  }

  const isOpen = vacancy.status === 'open';

  const actions = (
    <>
      <Button onClick={() => void navigate(`/recruitment/${vacancy.id}/shortlist`)} variant="ghost">
        <FileText className="mr-1.5 h-4 w-4" />
        Shortlist pack
      </Button>
      {isOpen ? (
        <Button
          onClick={() => {
            close.mutate(undefined, {
              onSuccess: () => toast.success('Vacancy closed'),
              onError: () => toast.error('Could not close the vacancy'),
            });
          }}
          variant="ghost"
        >
          <X className="mr-1.5 h-4 w-4" />
          Close
        </Button>
      ) : (
        <Button
          onClick={() => {
            publish.mutate(undefined, {
              onSuccess: () => toast.success('Vacancy published to the job board'),
              onError: () => toast.error('Could not publish the vacancy'),
            });
          }}
          variant="primary"
        >
          Publish
        </Button>
      )}
      <Button onClick={() => setEditorOpen(true)} variant="ghost">
        <Pencil className="mr-1.5 h-4 w-4" />
        Edit
      </Button>
    </>
  );

  return (
    <div>
      <Button
        className="mb-4"
        onClick={() => void navigate('/recruitment')}
        type="button"
        variant="ghost"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        All vacancies
      </Button>

      <PageHeader
        actions={actions}
        description={[
          vacancy.organisation?.name ?? 'Unassigned client',
          vacancy.location ?? undefined,
          vacancy.closes_at ? `closes ${formatDate(vacancy.closes_at)}` : undefined,
          `${applicantCount(vacancy)} applicant${applicantCount(vacancy) === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        title={vacancy.title}
      />

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <StatusChip variant={VACANCY_STATUS_TONES[vacancy.status]}>
            {VACANCY_STATUS_LABELS[vacancy.status]}
          </StatusChip>
          {vacancy.is_public && vacancy.status === 'open' && (
            <span className="text-xs text-ink-muted">
              Live on the website job board
              {vacancy.published_at ? ` · posted ${formatDate(vacancy.published_at)}` : ''}
            </span>
          )}
        </div>
        {vacancy.summary && <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{vacancy.summary}</p>}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="ml-auto flex items-center gap-1 rounded-control border border-border bg-surface p-0.5">
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-sm transition-colors',
              view === 'board' ? 'bg-surface-sunken text-ink' : 'text-ink-secondary',
            )}
            onClick={() => setView('board')}
            type="button"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Board
          </button>
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-sm transition-colors',
              view === 'table' ? 'bg-surface-sunken text-ink' : 'text-ink-secondary',
            )}
            onClick={() => setView('table')}
            type="button"
          >
            <List className="h-3.5 w-3.5" />
            Table
          </button>
        </div>
        {view === 'table' && (
          <Select onValueChange={(v) => setStageFilter(v as ApplicationStage | 'all')} value={stageFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {PIPELINE_STAGES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {view === 'board' ? (
        <ApplicationBoard onOpenApplication={setOpenApplicationId} vacancyId={vacancy.id} />
      ) : (
        <ApplicationTable
          onOpen={setOpenApplicationId}
          stageFilter={stageFilter}
          vacancyId={vacancy.id}
        />
      )}

      <ApplicationDetailSheet
        applicationId={openApplicationId}
        onOpenChange={(open) => {
          if (!open) setOpenApplicationId(null);
        }}
        open={openApplicationId != null}
        vacancyId={vacancy.id}
      />

      <VacancyEditorSheet
        onOpenChange={setEditorOpen}
        open={editorOpen}
        vacancy={{
          id: vacancy.id,
          title: vacancy.title,
          organisationId: vacancy.organisation_id,
          summary: vacancy.summary,
          description: vacancy.description,
          requirements: vacancy.requirements,
          location: vacancy.location,
          employmentType: vacancy.employment_type,
          salaryMinUgx: vacancy.salary_min_ugx,
          salaryMaxUgx: vacancy.salary_max_ugx,
          closesAt: vacancy.closes_at,
          isPublic: vacancy.is_public,
          status: vacancy.status,
        }}
      />
    </div>
  );
}

function ApplicationTable({
  vacancyId,
  stageFilter,
  onOpen,
}: {
  vacancyId: string;
  stageFilter: ApplicationStage | 'all';
  onOpen: (id: string) => void;
}) {
  const { data: applications, isLoading } = useApplications(vacancyId);
  const rows = (applications ?? []).filter(
    (a) => stageFilter === 'all' || a.stage === stageFilter,
  );

  if (isLoading) {
    return <div className="text-sm text-ink-secondary">Loading applications…</div>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-ink-muted">
            <th className="px-4 py-2.5 font-medium">Candidate</th>
            <th className="px-4 py-2.5 font-medium">Headline</th>
            <th className="px-4 py-2.5 font-medium">Skills</th>
            <th className="px-4 py-2.5 font-medium">Stage</th>
            <th className="px-4 py-2.5 text-right font-medium">Applied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((app) => (
            <tr
              className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-surface-sunken"
              key={app.id}
              onClick={() => onOpen(app.id)}
            >
              <td className="px-4 py-2.5 font-medium text-ink">
                {app.candidateContact?.full_name ?? 'Unnamed candidate'}
              </td>
              <td className="max-w-[220px] truncate px-4 py-2.5 text-ink-secondary">
                {app.candidate?.headline ?? '—'}
              </td>
              <td className="max-w-[200px] truncate px-4 py-2.5 text-ink-secondary">
                {(app.candidate?.skills ?? []).slice(0, 3).join(', ') || '—'}
              </td>
              <td className="px-4 py-2.5">
                <StatusChip variant={stageMeta(app.stage).tone}>{stageMeta(app.stage).label}</StatusChip>
              </td>
              <td className="px-4 py-2.5 text-right text-ink-muted">
                {formatDate(app.applied_at)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-8 text-center text-ink-muted" colSpan={5}>
                No applications in this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
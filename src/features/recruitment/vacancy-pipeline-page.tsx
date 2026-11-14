import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, FileText, Pencil, X, LayoutGrid, List, Sparkles, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/status-chip';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatUGX } from '@/lib/format';
import { applicantCount } from './recruitment-api';
import { PIPELINE_STAGES, VACANCY_STATUS_LABELS, VACANCY_STATUS_TONES, stageMeta } from './recruitment-meta';
import {
  useVacancy,
  useApplications,
  useCloseVacancy,
  usePublishVacancy,
  useTalentPoolMatches,
  useCreateApplication,
  useEvaluateApplication,
} from './use-recruitment';
import { ApplicationBoard } from './application-board';
import { CandidateDetailSheet } from './candidate-detail-sheet';
import { VacancyEditorSheet } from './vacancy-editor-sheet';
import { MatchBadge } from './match-badge';
import { parseCvData, sortApplicationsByMatch } from './ai-matching-schema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApplicationStage, TalentPoolMatchRow } from '@/types/database';

export function VacancyPipelinePage() {
  const { vacancyId } = useParams<{ vacancyId: string }>();
  const navigate = useNavigate();
  const { data: vacancy, isLoading } = useVacancy(vacancyId ?? '');
  const { data: poolMatches } = useTalentPoolMatches(vacancyId ?? '');
  const publish = usePublishVacancy(vacancyId ?? '');
  const close = useCloseVacancy(vacancyId ?? '');
  const [editorOpen, setEditorOpen] = useState(false);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'table' | 'matches'>('board');
  const [sortBy, setSortBy] = useState<'match' | 'newest'>('match');
  const [stageFilter, setStageFilter] = useState<ApplicationStage | 'all'>('all');
  const [searchParams] = useSearchParams();

  const openApplication = (appId: string) => {
    if (!vacancyId) return;
    void navigate(`/recruitment/${vacancyId}/applications/${appId}`);
  };

  // Deep-link from ⌘K / Day View / email links: ?application=<id> redirects to full-page review.
  useEffect(() => {
    const appParam = searchParams.get('application');
    if (appParam && vacancyId) {
      void navigate(`/recruitment/${vacancyId}/applications/${appParam}`, { replace: true });
    }
  }, [searchParams, vacancyId, navigate]);

  if (isLoading) {
    return <div className="p-4 text-sm text-ink-secondary">Loading vacancy…</div>;
  }

  if (!vacancy) {
    return <div className="p-4 text-sm text-ink-secondary">Vacancy not found.</div>;
  }

  const isOpen = vacancy.status === 'open';
  const poolMatchCount = poolMatches?.length ?? 0;

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
        <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-0.5">
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-sm transition-colors',
              view === 'board' ? 'bg-surface-sunken text-ink font-medium' : 'text-ink-secondary',
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
              view === 'table' ? 'bg-surface-sunken text-ink font-medium' : 'text-ink-secondary',
            )}
            onClick={() => setView('table')}
            type="button"
          >
            <List className="h-3.5 w-3.5" />
            Table
          </button>
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-sm transition-colors',
              view === 'matches' ? 'bg-surface-sunken text-ink font-medium' : 'text-ink-secondary',
            )}
            onClick={() => setView('matches')}
            type="button"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Matches in Talent Pool
            {poolMatchCount > 0 && (
              <span className="rounded-pill bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                {poolMatchCount}
              </span>
            )}
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {view !== 'matches' && (
            <Select onValueChange={(v) => setSortBy(v as 'match' | 'newest')} value={sortBy}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match">Sort: Best match</SelectItem>
                <SelectItem value="newest">Sort: Newest</SelectItem>
              </SelectContent>
            </Select>
          )}
          {view === 'table' && (
            <Select
              onValueChange={(v) => setStageFilter(v as ApplicationStage | 'all')}
              value={stageFilter}
            >
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
      </div>

      {view === 'board' && (
        <ApplicationBoard
          onOpenApplication={openApplication}
          sortBy={sortBy}
          vacancyId={vacancy.id}
        />
      )}

      {view === 'table' && (
        <ApplicationTable
          onOpen={openApplication}
          sortBy={sortBy}
          stageFilter={stageFilter}
          vacancyId={vacancy.id}
        />
      )}

      {view === 'matches' && (
        <TalentPoolMatchesPanel
          onOpenApplication={openApplication}
          onOpenCandidate={setOpenCandidateId}
          vacancyId={vacancy.id}
        />
      )}

      <CandidateDetailSheet
        candidateId={openCandidateId}
        onOpenChange={(open) => {
          if (!open) setOpenCandidateId(null);
        }}
        open={openCandidateId != null}
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
          recruiterContext: vacancy.recruiter_context,
          location: vacancy.location,
          employmentType: vacancy.employment_type,
          salaryMinUgx: vacancy.salary_min_ugx,
          salaryMaxUgx: vacancy.salary_max_ugx,
          closesAt: vacancy.closes_at,
          isPublic: vacancy.is_public,
          status: vacancy.status,
          screeningQuestions: vacancy.screening_questions,
        }}
      />
    </div>
  );
}

function ApplicationTable({
  vacancyId,
  stageFilter,
  sortBy,
  onOpen,
}: {
  vacancyId: string;
  stageFilter: ApplicationStage | 'all';
  sortBy: 'match' | 'newest';
  onOpen: (id: string) => void;
}) {
  const { data: applications, isLoading } = useApplications(vacancyId);
  const filtered = (applications ?? []).filter(
    (a) => stageFilter === 'all' || a.stage === stageFilter,
  );
  const rows = sortApplicationsByMatch(filtered, sortBy);

  if (isLoading) {
    return <div className="text-sm text-ink-secondary">Loading applications…</div>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-ink-muted">
            <th className="px-4 py-2.5 font-medium">Candidate</th>
            <th className="px-4 py-2.5 font-medium">Match</th>
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
              <td className="px-4 py-2.5">
                {app.match_tier ? (
                  <MatchBadge compact score={app.match_score} tier={app.match_tier} />
                ) : (
                  <span className="text-xs text-ink-muted">—</span>
                )}
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
              <td className="px-4 py-8 text-center text-ink-muted" colSpan={6}>
                No applications in this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TalentPoolMatchesPanel({
  vacancyId,
  onOpenCandidate,
  onOpenApplication,
}: {
  vacancyId: string;
  onOpenCandidate: (candidateId: string) => void;
  onOpenApplication: (applicationId: string) => void;
}) {
  const { data: matches, isLoading } = useTalentPoolMatches(vacancyId);
  const createApp = useCreateApplication();
  const evaluateApp = useEvaluateApplication(vacancyId);
  const [addingId, setAddingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    );
  }

  const rows: TalentPoolMatchRow[] = matches ?? [];

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center">
        <p className="text-sm font-medium text-ink">No unapplied matches found in the Talent Pool yet</p>
        <p className="mt-1 text-xs text-ink-secondary">
          As candidates upload CVs or update skills that overlap with this vacancy’s title,
          requirements, or industry, they will surface here automatically.
        </p>
      </div>
    );
  }

  const handleAdd = async (candidateId: string) => {
    setAddingId(candidateId);
    try {
      const created = await createApp.mutateAsync({ vacancyId, candidateId });
      if (!created) {
        toast.info('Candidate is already on this vacancy');
        return;
      }
      toast.success('Added to vacancy — running AI evaluation…');
      evaluateApp.mutate(
        { applicationId: created.id },
        {
          onSuccess: () => toast.success('AI match evaluation ready'),
          onError: () => {
            // Non-blocking if OpenAI key is not set yet
          },
        },
      );
      onOpenApplication(created.id);
    } catch {
      toast.error('Could not add candidate to vacancy');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-control border border-border bg-surface-sunken/40 px-4 py-2.5 text-xs text-ink-secondary">
        Showing available candidates in your Talent Pool whose skills, headline, or parsed CV
        history match this vacancy. Click <strong>Add to vacancy</strong> to pull them onto the
        board and generate a full AI assessment &amp; interview prep.
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const parsedCv = parseCvData(row.cv_parsed);
          const matchedSet = new Set((row.matched_skills ?? []).map((s) => s.toLowerCase()));
          const tier =
            row.relevance_score >= 75
              ? 'strong'
              : row.relevance_score >= 50
                ? 'adjacent'
                : 'partial';

          return (
            <div
              className="flex flex-col justify-between rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              key={row.candidate_id}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      className="truncate text-left font-display text-base font-semibold text-ink hover:text-primary"
                      onClick={() => onOpenCandidate(row.candidate_id)}
                      type="button"
                    >
                      {row.full_name ?? 'Unnamed candidate'}
                    </button>
                    {row.headline && (
                      <p className="mt-0.5 text-xs text-ink-secondary">{row.headline}</p>
                    )}
                  </div>
                  <MatchBadge compact score={row.relevance_score} tier={tier} />
                </div>

                {parsedCv?.summary && (
                  <p className="mt-2 line-clamp-2 text-xs text-ink-secondary">{parsedCv.summary}</p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  {row.years_experience != null && (
                    <span className="tabular-nums">{row.years_experience} yrs exp</span>
                  )}
                  {row.salary_expectation_ugx != null && row.salary_expectation_ugx > 0 && (
                    <span>· expects {formatUGX(BigInt(row.salary_expectation_ugx))}</span>
                  )}
                  {row.rating != null && row.rating > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-ink">
                      · <Star className="h-3 w-3 fill-current text-warning" /> {row.rating}/5
                    </span>
                  )}
                </div>

                {row.skills && row.skills.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {row.skills.slice(0, 6).map((skill) => {
                      const isMatch = matchedSet.has(skill.toLowerCase());
                      return (
                        <span
                          className={cn(
                            'rounded-pill px-2 py-0.5 text-[11px]',
                            isMatch
                              ? 'bg-primary-soft font-semibold text-primary'
                              : 'bg-surface-sunken text-ink-secondary',
                          )}
                          key={skill}
                        >
                          {skill}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                <Button
                  onClick={() => onOpenCandidate(row.candidate_id)}
                  size="sm"
                  variant="ghost"
                >
                  View profile
                </Button>
                <Button
                  disabled={addingId === row.candidate_id}
                  onClick={() => void handleAdd(row.candidate_id)}
                  size="sm"
                  variant="primary"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {addingId === row.candidate_id ? 'Adding…' : 'Add to vacancy'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

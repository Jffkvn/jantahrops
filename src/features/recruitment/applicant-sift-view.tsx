import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Mail,
  MapPin,
  Search,
  Sparkles,
  UserCheck,
  UserX,
  X,
  AlertTriangle,
  Briefcase,
  GraduationCap,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/status-chip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApplicationStage, VacancyRow } from '@/types/database';
import {
  SIFT_BUCKET_META,
  SIFT_BUCKET_ORDER,
  siftVacancyApplications,
  type SiftBucket,
  type SiftedApplicant,
} from './applicant-sift';
import { MatchBadge } from './match-badge';
import { stageMeta } from './recruitment-meta';
import type { ApplicationWithRelations, ResolvedDocumentLink } from './recruitment-api';
import {
  useApplicationDocuments,
  useEvaluateApplication,
  useMoveStage,
} from './use-recruitment';

interface ApplicantSiftViewProps {
  vacancyId: string;
  vacancy?: VacancyRow | null;
  applications: ApplicationWithRelations[] | undefined;
  isLoading: boolean;
  onOpenApplication: (applicationId: string) => void;
}

type LocationFilter = 'all' | 'kampala' | 'relocate' | 'other';
type ExcelFilter = 'all' | 'Advanced' | 'Intermediate' | 'Basic';

export function ApplicantSiftView({
  vacancyId,
  vacancy,
  applications,
  isLoading,
  onOpenApplication,
}: ApplicantSiftViewProps) {
  const navigate = useNavigate();
  const moveStage = useMoveStage(vacancyId);
  const evaluateApp = useEvaluateApplication(vacancyId);

  const [bucketFilter, setBucketFilter] = useState<SiftBucket | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [excelFilter, setExcelFilter] = useState<ExcelFilter>('all');
  const [hideRejected, setHideRejected] = useState(true);
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<SiftBucket, boolean>>({
    most_qualified: false,
    overqualified: false,
    transferable: true,
    unqualified: true,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ applicationId: string; tab: 'cv' | 'cover' } | null>(
    null,
  );
  const [evaluatingProgress, setEvaluatingProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data: docs, isLoading: docsLoading } = useApplicationDocuments(
    vacancyId,
    applications,
    60 * 60,
  );

  const stageScopedApps = useMemo(() => {
    const list = applications ?? [];
    return hideRejected ? list.filter((a) => a.stage !== 'rejected') : list;
  }, [applications, hideRejected]);

  const siftGroups = useMemo(
    () => siftVacancyApplications(stageScopedApps, vacancy),
    [stageScopedApps, vacancy],
  );

  const unscoredApps = useMemo(
    () =>
      (applications ?? []).filter(
        (a) => !a.match_tier || a.match_tier === 'unscored' || !a.ai_assessment,
      ),
    [applications],
  );

  const matchesActiveFilters = (item: SiftedApplicant): boolean => {
    if (locationFilter === 'kampala' && !item.isKampalaMetro) return false;
    if (locationFilter === 'relocate' && item.locationStatus !== 'relocate') return false;
    if (
      locationFilter === 'other' &&
      (item.isKampalaMetro || item.locationStatus === 'relocate')
    ) {
      return false;
    }
    if (excelFilter !== 'all' && item.excelLevel !== excelFilter) return false;

    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;

    const haystack = [
      item.fullName,
      item.email,
      item.locationLabel,
      item.recentRoleLine,
      item.educationLine,
      item.whyBucket,
      item.narrative,
      ...(item.application.candidate?.skills ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  };

  const filteredByBucket = useMemo(() => {
    const result: Record<SiftBucket, SiftedApplicant[]> = {
      most_qualified: [],
      overqualified: [],
      transferable: [],
      unqualified: [],
    };
    for (const bucket of SIFT_BUCKET_ORDER) {
      result[bucket] = siftGroups[bucket].filter(matchesActiveFilters);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siftGroups, locationFilter, excelFilter, searchTerm]);

  const previewItem = useMemo(() => {
    if (!preview) return null;
    return (
      siftGroups.all.find((item) => item.application.id === preview.applicationId) ?? null
    );
  }, [preview, siftGroups.all]);

  const handleMove = async (
    item: SiftedApplicant,
    nextStage: ApplicationStage,
    reason?: string,
  ) => {
    if (item.application.stage === nextStage) return;
    try {
      await moveStage.mutateAsync({
        id: item.application.id,
        stage: nextStage,
        ...(nextStage === 'rejected'
          ? { reason: reason ?? 'Sifted out during AI Sift review' }
          : {}),
      });
      toast.success(`${item.fullName} moved to ${stageMeta(nextStage).label}`);
      if (nextStage === 'rejected' && hideRejected && preview?.applicationId === item.application.id) {
        setPreview(null);
      }
    } catch {
      toast.error(`Could not update stage for ${item.fullName}`);
    }
  };

  const handleBulkMove = async (nextStage: ApplicationStage) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    let moved = 0;
    try {
      for (const id of ids) {
        await moveStage.mutateAsync({
          id,
          stage: nextStage,
          ...(nextStage === 'rejected'
            ? { reason: 'Bulk sifted out during AI Sift review' }
            : {}),
        });
        moved++;
      }
      toast.success(`Moved ${moved} applicant${moved === 1 ? '' : 's'} to ${stageMeta(nextStage).label}`);
      setSelectedIds(new Set());
      if (nextStage === 'rejected' && hideRejected && preview && ids.includes(preview.applicationId)) {
        setPreview(null);
      }
    } catch {
      toast.error(`Moved ${moved} applicants before an error occurred`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleEvaluateUnscored = async () => {
    if (unscoredApps.length === 0 || evaluatingProgress) return;
    setEvaluatingProgress({ done: 0, total: unscoredApps.length });
    let okCount = 0;
    for (let i = 0; i < unscoredApps.length; i++) {
      const target = unscoredApps[i];
      if (!target) continue;
      try {
        await evaluateApp.mutateAsync({ applicationId: target.id });
        okCount++;
      } catch {
        // Continue evaluating remaining applications
      }
      setEvaluatingProgress({ done: i + 1, total: unscoredApps.length });
    }
    setEvaluatingProgress(null);
    toast.success(`Evaluated ${okCount} of ${unscoredApps.length} unscored applications`);
  };

  const toggleBucketCollapse = (bucket: SiftBucket) => {
    setCollapsedBuckets((prev) => ({ ...prev, [bucket]: !prev[bucket] }));
  };

  const toggleSelect = (appId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  };

  const openPreview = (applicationId: string, tab: 'cv' | 'cover') => {
    setPreview({ applicationId, tab });
  };

  const selectAllInBucket = (bucket: SiftBucket) => {
    const items = filteredByBucket[bucket];
    if (items.length === 0) return;
    const allSelected = items.every((i) => selectedIds.has(i.application.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (allSelected) next.delete(item.application.id);
        else next.add(item.application.id);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
        </div>
        <Skeleton className="h-36 rounded-card" />
        <Skeleton className="h-36 rounded-card" />
      </div>
    );
  }

  const visibleBuckets: SiftBucket[] =
    bucketFilter === 'all' ? [...SIFT_BUCKET_ORDER] : [bucketFilter];

  const previewCvDoc =
    previewItem && previewItem.application.candidate?.id
      ? docs?.cvByCandidateId[previewItem.application.candidate.id]
      : undefined;
  const previewCoverDoc = previewItem
    ? docs?.coverByApplicationId[previewItem.application.id]
    : undefined;

  return (
    <div className="space-y-4">
      {/* Top 4 Bucket Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SIFT_BUCKET_ORDER.map((bucket) => {
          const meta = SIFT_BUCKET_META[bucket];
          const count = siftGroups[bucket].length;
          const active = bucketFilter === bucket;
          return (
            <button
              className={cn(
                'flex flex-col justify-between rounded-card border p-3.5 text-left transition-all',
                active
                  ? 'border-primary bg-primary-soft/35 ring-1 ring-primary'
                  : 'border-border bg-surface hover:border-border-strong',
              )}
              key={bucket}
              onClick={() => {
                setBucketFilter((cur) => (cur === bucket ? 'all' : bucket));
                setCollapsedBuckets((prev) => ({ ...prev, [bucket]: false }));
              }}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <StatusChip showDot={false} variant={meta.tone}>
                  {meta.shortLabel}
                </StatusChip>
                <span className="font-display text-2xl font-bold tabular-nums text-ink">
                  {count}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-ink-secondary">{meta.description}</p>
            </button>
          );
        })}
      </div>

      {/* Filter & Report Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3">
        <div className="relative min-w-[210px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-muted" />
          <Input
            className="pl-8"
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, role, company, location, or skill…"
            value={searchTerm}
          />
        </div>

        <Select
          onValueChange={(v) => setLocationFilter(v as LocationFilter)}
          value={locationFilter}
        >
          <SelectTrigger className="w-[185px]">
            <Filter className="mr-1.5 h-3.5 w-3.5 text-ink-muted" />
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Location: All</SelectItem>
            <SelectItem value="kampala">Kampala / Greater Kampala</SelectItem>
            <SelectItem value="relocate">Ready to relocate</SelectItem>
            <SelectItem value="other">Unable / Unspecified</SelectItem>
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => setExcelFilter(v as ExcelFilter)} value={excelFilter}>
          <SelectTrigger className="w-[165px]">
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-ink-muted" />
            <SelectValue placeholder="Excel level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Excel: All levels</SelectItem>
            <SelectItem value="Advanced">Excel: Advanced</SelectItem>
            <SelectItem value="Intermediate">Excel: Intermediate</SelectItem>
            <SelectItem value="Basic">Excel: Basic</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex cursor-pointer items-center gap-2 rounded-control border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary">
          <Checkbox
            checked={hideRejected}
            onCheckedChange={(checked) => setHideRejected(Boolean(checked))}
          />
          Hide Rejected
        </label>

        {unscoredApps.length > 0 && (
          <Button
            disabled={Boolean(evaluatingProgress)}
            onClick={() => void handleEvaluateUnscored()}
            size="sm"
            variant="secondary"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
            {evaluatingProgress
              ? `Scoring ${evaluatingProgress.done}/${evaluatingProgress.total}…`
              : `Score ${unscoredApps.length} Unscored`}
          </Button>
        )}

        <Button
          onClick={() => void navigate(`/recruitment/${vacancyId}/sift-report`)}
          size="sm"
          variant="primary"
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          Executive Sift Report (PDF)
        </Button>
      </div>

      {/* Bulk Action Bar when rows are checked */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/40 bg-primary-soft/25 px-4 py-2.5">
          <span className="text-sm font-medium text-ink">
            {selectedIds.size} applicant{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={bulkBusy}
              onClick={() => void handleBulkMove('shortlisted')}
              size="sm"
              variant="primary"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Shortlist selected
            </Button>
            <Button
              disabled={bulkBusy}
              onClick={() => void handleBulkMove('screened')}
              size="sm"
              variant="secondary"
            >
              <UserCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark Screened
            </Button>
            <Button
              disabled={bulkBusy}
              onClick={() => void handleBulkMove('rejected')}
              size="sm"
              variant="danger"
            >
              <UserX className="mr-1.5 h-3.5 w-3.5" />
              Reject selected
            </Button>
            <Button
              disabled={bulkBusy}
              onClick={() => setSelectedIds(new Set())}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Split-Screen Workbench: List on Left + Sticky Preview Drawer on Right */}
      <div className={cn('grid gap-4 items-start', previewItem ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1')}>
        <div className={cn('space-y-4', previewItem ? 'lg:col-span-6' : 'col-span-1')}>
          {bucketFilter !== 'all' && (
            <div className="flex items-center justify-between text-xs text-ink-secondary">
              <span>
                Filtering to <strong>{SIFT_BUCKET_META[bucketFilter].label}</strong> (
                {filteredByBucket[bucketFilter].length})
              </span>
              <button
                className="text-primary hover:underline"
                onClick={() => setBucketFilter('all')}
                type="button"
              >
                Show all 4 buckets
              </button>
            </div>
          )}

          {visibleBuckets.map((bucket) => {
            const meta = SIFT_BUCKET_META[bucket];
            const items = filteredByBucket[bucket];
            const isCollapsed = bucketFilter === 'all' && collapsedBuckets[bucket];
            const allChecked =
              items.length > 0 && items.every((i) => selectedIds.has(i.application.id));

            return (
              <section
                className="overflow-hidden rounded-card border border-border bg-surface"
                key={bucket}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-sunken/40 px-4 py-2.5">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => toggleBucketCollapse(bucket)}
                    type="button"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
                    )}
                    <StatusChip showDot={false} variant={meta.tone}>
                      {meta.label}
                    </StatusChip>
                    <span className="rounded-pill bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">
                      {items.length}
                    </span>
                  </button>

                  {!isCollapsed && items.length > 0 && (
                    <button
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => selectAllInBucket(bucket)}
                      type="button"
                    >
                      {allChecked ? 'Unselect bucket' : 'Select all in bucket'}
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="divide-y divide-border/70">
                    {items.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-ink-muted">
                        No applicants match the current filters in this bucket.
                      </p>
                    ) : (
                      items.map((item) => {
                        const app = item.application;
                        const isActivePreview = preview?.applicationId === app.id;
                        const hasCoverOption = item.hasCoverLetterFile || Boolean(item.coverNoteText);
                        const stageInfo = stageMeta(app.stage);

                        return (
                          <div
                            className={cn(
                              'p-4 transition-colors',
                              isActivePreview ? 'bg-primary-soft/20' : 'hover:bg-surface-sunken/30',
                            )}
                            key={app.id}
                          >
                            {/* Header line: Checkbox, Rank, Name, Score, Stage */}
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <Checkbox
                                  aria-label={`Select ${item.fullName}`}
                                  checked={selectedIds.has(app.id)}
                                  className="mt-1"
                                  onCheckedChange={() => toggleSelect(app.id)}
                                />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-secondary">
                                      #{item.rank}
                                    </span>
                                    <button
                                      className="text-left font-display text-base font-semibold text-ink hover:text-primary"
                                      onClick={() => openPreview(app.id, 'cv')}
                                      type="button"
                                    >
                                      {item.fullName}
                                    </button>
                                    {app.match_tier && (
                                      <MatchBadge
                                        compact
                                        score={app.match_score}
                                        tier={app.match_tier}
                                      />
                                    )}
                                    <StatusChip showDot={false} variant={stageInfo.tone}>
                                      {stageInfo.label}
                                    </StatusChip>
                                  </div>
                                  <p className="mt-0.5 text-xs text-ink-secondary">
                                    {item.recentRoleLine}
                                    {item.educationLine ? ` · ${item.educationLine}` : ''}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Metadata pills: Location, HR Experience, Excel */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 font-medium',
                                  item.isKampalaMetro
                                    ? 'bg-success-soft text-success-ink'
                                    : item.canWorkInKampala
                                      ? 'bg-warning-soft text-warning-ink'
                                      : 'bg-danger-soft text-danger-ink',
                                )}
                              >
                                <MapPin className="h-3 w-3" />
                                {item.locationLabel}
                              </span>

                              <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2.5 py-0.5 text-ink-secondary">
                                <Briefcase className="h-3 w-3" />
                                {item.hrYears > 0 ? `${item.hrYears} yrs in HR` : '0 yrs direct HR'}
                                {item.totalYears != null && item.totalYears > item.hrYears
                                  ? ` (${item.totalYears} yrs total)`
                                  : ''}
                              </span>

                              {item.excelLevel && (
                                <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2.5 py-0.5 text-ink-secondary">
                                  <FileSpreadsheet className="h-3 w-3" />
                                  Excel: {item.excelLevel}
                                </span>
                              )}
                            </div>

                            {/* Hindsight Brief */}
                            <div className="mt-2.5 rounded-control border border-border/80 bg-surface-sunken/35 px-3 py-2 text-xs">
                              <p className="font-medium text-ink">{item.whyBucket}</p>
                              <p className="mt-1 text-ink-secondary">{item.narrative}</p>
                              {item.coverLetterSummary && (
                                <p className="mt-1.5 text-ink-secondary">
                                  <strong className="text-ink">Cover Letter &amp; Fit:</strong>{' '}
                                  {item.coverLetterSummary}
                                </p>
                              )}
                              {(item.strengths.length > 0 || item.watchouts.length > 0) && (
                                <div className="mt-2 flex flex-col gap-1">
                                  {item.strengths.slice(0, 2).map((s) => (
                                    <span
                                      className="inline-flex items-start gap-1.5 rounded-control bg-success-soft px-2 py-1 text-[11px] text-success-ink"
                                      key={s}
                                    >
                                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                                      <span>{s}</span>
                                    </span>
                                  ))}
                                  {item.watchouts.slice(0, 1).map((w) => (
                                    <span
                                      className="inline-flex items-start gap-1.5 rounded-control bg-warning-soft px-2 py-1 text-[11px] text-warning-ink"
                                      key={w}
                                    >
                                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                      <span>{w}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Footer: Preview CV / Cover Letter + 1-Click Triage Actions */}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                  onClick={() => openPreview(app.id, 'cv')}
                                  size="sm"
                                  variant={
                                    isActivePreview && preview?.tab === 'cv' ? 'primary' : 'secondary'
                                  }
                                >
                                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                                  Preview CV
                                </Button>

                                <Button
                                  disabled={!hasCoverOption}
                                  onClick={() => openPreview(app.id, 'cover')}
                                  size="sm"
                                  variant={
                                    isActivePreview && preview?.tab === 'cover'
                                      ? 'primary'
                                      : 'secondary'
                                  }
                                >
                                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                                  Cover Letter
                                </Button>

                                <Button
                                  onClick={() => onOpenApplication(app.id)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                  Full Review
                                </Button>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                  disabled={app.stage === 'shortlisted' || moveStage.isPending}
                                  onClick={() => void handleMove(item, 'shortlisted')}
                                  size="sm"
                                  variant={app.stage === 'shortlisted' ? 'ghost' : 'primary'}
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  {app.stage === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
                                </Button>
                                <Button
                                  disabled={app.stage === 'screened' || moveStage.isPending}
                                  onClick={() => void handleMove(item, 'screened')}
                                  size="sm"
                                  variant="secondary"
                                >
                                  <UserCheck className="mr-1 h-3.5 w-3.5" />
                                  {app.stage === 'screened' ? 'Screened' : 'Screen'}
                                </Button>
                                <Button
                                  disabled={app.stage === 'rejected' || moveStage.isPending}
                                  onClick={() => void handleMove(item, 'rejected')}
                                  size="sm"
                                  variant={app.stage === 'rejected' ? 'ghost' : 'danger'}
                                >
                                  <UserX className="mr-1 h-3.5 w-3.5" />
                                  {app.stage === 'rejected' ? 'Rejected' : 'Reject'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Sticky Side-by-Side Document Preview Drawer */}
        {previewItem && (
          <aside className="flex flex-col overflow-hidden rounded-card border border-border-strong bg-surface shadow-float lg:sticky lg:top-4 lg:col-span-6 lg:h-[calc(100vh-2rem)]">
            <div className="border-b border-border bg-surface-sunken/50 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-display text-base font-bold text-ink">
                      {previewItem.fullName}
                    </h3>
                    <StatusChip
                      showDot={false}
                      variant={SIFT_BUCKET_META[previewItem.bucket].tone}
                    >
                      {SIFT_BUCKET_META[previewItem.bucket].shortLabel}
                    </StatusChip>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-secondary">
                    {previewItem.recentRoleLine} · {previewItem.locationLabel}
                  </p>
                </div>

                <Button
                  aria-label="Close document preview"
                  onClick={() => setPreview(null)}
                  size="icon"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-0.5">
                  <button
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium',
                      preview?.tab === 'cv'
                        ? 'bg-surface-sunken text-ink'
                        : 'text-ink-secondary hover:text-ink',
                    )}
                    onClick={() =>
                      setPreview((cur) => (cur ? { ...cur, tab: 'cv' } : cur))
                    }
                    type="button"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    CV
                  </button>
                  <button
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium',
                      preview?.tab === 'cover'
                        ? 'bg-surface-sunken text-ink'
                        : 'text-ink-secondary hover:text-ink',
                    )}
                    onClick={() =>
                      setPreview((cur) => (cur ? { ...cur, tab: 'cover' } : cur))
                    }
                    type="button"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Cover Letter
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    disabled={previewItem.application.stage === 'shortlisted'}
                    onClick={() => void handleMove(previewItem, 'shortlisted')}
                    size="sm"
                    variant="primary"
                  >
                    Shortlist
                  </Button>
                  <Button
                    disabled={previewItem.application.stage === 'screened'}
                    onClick={() => void handleMove(previewItem, 'screened')}
                    size="sm"
                    variant="secondary"
                  >
                    Screen
                  </Button>
                  <Button
                    disabled={previewItem.application.stage === 'rejected'}
                    onClick={() => void handleMove(previewItem, 'rejected')}
                    size="sm"
                    variant="danger"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-surface p-4">
              {preview?.tab === 'cv' ? (
                <CvPreviewBody
                  doc={previewCvDoc}
                  docsLoading={docsLoading}
                  item={previewItem}
                />
              ) : (
                <CoverLetterPreviewBody
                  doc={previewCoverDoc}
                  docsLoading={docsLoading}
                  item={previewItem}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function CvPreviewBody({
  item,
  doc,
  docsLoading,
}: {
  item: SiftedApplicant;
  doc: ResolvedDocumentLink | undefined;
  docsLoading: boolean;
}) {
  if (docsLoading && !doc && item.hasCv) {
    return <Skeleton className="h-96 w-full rounded-control" />;
  }

  if (doc?.isPdf) {
    return (
      <div className="flex h-full min-h-[540px] flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-ink-secondary">
          <span className="truncate font-medium">{doc.filename}</span>
          <a
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            href={doc.url}
            rel="noreferrer"
            target="_blank"
          >
            Open PDF in new tab <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <iframe
          className="h-full min-h-[520px] w-full flex-1 rounded-control border border-border bg-white"
          src={doc.url}
          title={`${item.fullName} CV`}
        />
      </div>
    );
  }

  const cv = item.cvParsed;

  return (
    <div className="space-y-4 text-sm">
      {doc ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface-sunken/40 p-3">
          <div>
            <p className="text-xs font-semibold text-ink">{doc.filename}</p>
            <p className="text-[11px] text-ink-muted">
              Word documents download rather than render inside browser iframes — extracted CV
              content is shown below.
            </p>
          </div>
          <a
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink hover:bg-primary-hover"
            download={doc.filename}
            href={doc.url}
            rel="noreferrer"
            target="_blank"
          >
            <Download className="h-3.5 w-3.5" />
            Download Word CV
          </a>
        </div>
      ) : (
        <p className="rounded-control border border-border bg-surface-sunken/40 px-3 py-2 text-xs text-ink-muted">
          No CV file attached to this application.
        </p>
      )}

      {cv ? (
        <div className="space-y-4">
          {cv.summary && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Extracted CV Summary
              </h4>
              <p className="mt-1 text-sm text-ink">{cv.summary}</p>
            </div>
          )}

          {cv.work_history.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <Briefcase className="h-3.5 w-3.5" />
                Work Experience
              </h4>
              <div className="mt-2 space-y-3">
                {cv.work_history.map((job, idx) => (
                  <div
                    className="rounded-control border border-border/70 bg-surface-sunken/25 p-3"
                    key={`${job.company}-${job.role}-${idx}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-ink">
                        {job.role} — <span className="font-normal text-ink-secondary">{job.company}</span>
                      </p>
                      {(job.start_date || job.end_date) && (
                        <span className="text-xs text-ink-muted">
                          {job.start_date ?? '?'} – {job.end_date ?? 'Present'}
                        </span>
                      )}
                    </div>
                    {job.highlights.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-ink-secondary">
                        {job.highlights.map((h, hIdx) => (
                          <li key={hIdx}>{h}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {cv.education.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <GraduationCap className="h-3.5 w-3.5" />
                Education
              </h4>
              <ul className="mt-1.5 space-y-1 text-xs text-ink-secondary">
                {cv.education.map((edu, idx) => (
                  <li key={idx}>
                    <strong className="text-ink">{edu.qualification}</strong> — {edu.institution}
                    {edu.year ? ` (${edu.year})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cv.skills_extracted.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Extracted Skills
              </h4>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {cv.skills_extracted.map((skill) => (
                  <span
                    className="rounded-pill bg-surface-sunken px-2.5 py-0.5 text-xs text-ink-secondary"
                    key={skill}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          Parsed CV breakdown is not available yet. Run AI evaluation or download the file above.
        </p>
      )}
    </div>
  );
}

function CoverLetterPreviewBody({
  item,
  doc,
  docsLoading,
}: {
  item: SiftedApplicant;
  doc: ResolvedDocumentLink | undefined;
  docsLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      {item.coverNoteText && (
        <div className="rounded-control border border-border bg-surface-sunken/30 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Written Cover Letter / Note
          </h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {item.coverNoteText}
          </p>
        </div>
      )}

      {docsLoading && !doc && item.hasCoverLetterFile && (
        <Skeleton className="h-72 w-full rounded-control" />
      )}

      {doc && doc.isPdf && (
        <div className="flex h-[520px] flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-ink-secondary">
            <span className="truncate font-medium">{doc.filename}</span>
            <a
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              href={doc.url}
              rel="noreferrer"
              target="_blank"
            >
              Open Cover Letter PDF <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <iframe
            className="h-full w-full flex-1 rounded-control border border-border bg-white"
            src={doc.url}
            title={`${item.fullName} Cover Letter`}
          />
        </div>
      )}

      {doc && !doc.isPdf && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-surface-sunken/40 p-3">
          <div>
            <p className="text-xs font-semibold text-ink">{doc.filename}</p>
            <p className="text-[11px] text-ink-muted">
              Click to download or open the uploaded Word Cover Letter.
            </p>
          </div>
          <a
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink hover:bg-primary-hover"
            download={doc.filename}
            href={doc.url}
            rel="noreferrer"
            target="_blank"
          >
            <Download className="h-3.5 w-3.5" />
            Download Cover Letter
          </a>
        </div>
      )}

      {!item.coverNoteText && !doc && !docsLoading && (
        <p className="text-xs text-ink-muted">
          No cover letter or cover note was submitted with this application.
        </p>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Send,
  Star,
  Calendar,
  Sparkles,
  Pencil,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Compass,
  AlertTriangle,
  Scale,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusChip } from '@/components/status-chip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative, formatUGX } from '@/lib/format';
import { candidateStorageSignedUrl, cvSignedUrl } from './recruitment-api';
import { AVAILABILITY_LABELS, PIPELINE_STAGES, stageMeta } from './recruitment-meta';
import { CandidateCompareMatrix } from './candidate-compare-matrix';
import {
  MATCH_TIER_META,
  parseAiAssessment,
  parseApplicationNotes,
  parseCvData,
  sortApplicationsByMatch,
  type ApplicationAiAssessment,
  type InterviewPrepQuestion,
} from './ai-matching-schema';
import type { ApplicationMatchTier, ApplicationStage } from '@/types/database';
import {
  useApplications,
  useApplicationTimeline,
  useMoveStage,
  useAddApplicationNote,
  useInterviews,
  useScheduleInterview,
  useRecordInterviewFeedback,
  useUpdateVacancy,
  useVacancy,
  useEvaluateApplication,
  useSaveAssessmentOverride,
  useUpdateInterviewQuestions,
  useUpdateCandidate,
} from './use-recruitment';

/**
 * Full-page Candidate Application Review screen (`/recruitment/:vacancyId/applications/:applicationId`).
 * Implements Option A — Unified Single Hero Card (Workable / Ashby style):
 * - Top navigation bar sits cleanly on the canvas outside the card
 * - Single unified Hero Card with Candidate Identity on top and the tinted AI Summary box inside the bottom half
 * - Clean 24px bold dark-ink section headings on the canvas without heavy banner blocks
 * - Full-width stacked 4-pillar & evidence cards with 16px (`text-md`) dark-ink body text
 */
export function ApplicationReviewPage() {
  const { vacancyId, applicationId } = useParams<{
    vacancyId: string;
    applicationId: string;
  }>();

  if (!vacancyId || !applicationId) {
    return <div className="p-6 text-md text-ink-secondary">Application not found.</div>;
  }

  return (
    <div className="-mx-2 -mt-2 pb-20 sm:-mx-4 lg:-mx-5">
      <ApplicationDetailWorkspace
        applicationId={applicationId}
        isFullPage
        vacancyId={vacancyId}
      />
    </div>
  );
}

/**
 * Sheet wrapper retained for compatibility with any caller opening an application in a sheet.
 */
export function ApplicationDetailSheet({
  applicationId,
  vacancyId,
  onOpenChange,
  open,
}: {
  applicationId: string | null;
  vacancyId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="p-0" side="center">
        {applicationId && (
          <div className="max-h-[88vh] overflow-y-auto p-6">
            <ApplicationDetailWorkspace applicationId={applicationId} vacancyId={vacancyId} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

const AI_BOX_STYLES: Record<
  ApplicationMatchTier,
  { box: string; pill: string }
> = {
  strong: {
    box: 'border border-success/30 bg-success-soft/75',
    pill: 'bg-success text-primary-ink',
  },
  adjacent: {
    box: 'border border-info/25 bg-info-soft/85',
    pill: 'bg-info text-primary-ink',
  },
  partial: {
    box: 'border border-warning/30 bg-warning-soft/80',
    pill: 'bg-warning text-primary-ink',
  },
  low: {
    box: 'border border-danger/30 bg-danger-soft/75',
    pill: 'bg-danger text-primary-ink',
  },
  unscored: {
    box: 'border border-border-strong bg-surface-sunken/70',
    pill: 'bg-surface border border-border-strong text-ink',
  },
};

function ApplicationDetailWorkspace({
  applicationId,
  vacancyId,
  isFullPage = false,
}: {
  applicationId: string;
  vacancyId: string;
  isFullPage?: boolean;
}) {
  const navigate = useNavigate();
  const { data: applications, isLoading } = useApplications(vacancyId);
  const application = applications?.find((a) => a.id === applicationId);
  const { data: timeline } = useApplicationTimeline(applicationId);
  const { data: interviews } = useInterviews(applicationId);
  const { data: vacancy } = useVacancy(vacancyId);
  const moveStage = useMoveStage(vacancyId);
  const updateVacancy = useUpdateVacancy(vacancyId);
  const addNote = useAddApplicationNote(applicationId);
  const schedule = useScheduleInterview(vacancyId);
  const recordFeedback = useRecordInterviewFeedback(applicationId);
  const evaluateApp = useEvaluateApplication(vacancyId);
  const saveOverride = useSaveAssessmentOverride(vacancyId);
  const updateQuestions = useUpdateInterviewQuestions(vacancyId);
  const updateCandidate = useUpdateCandidate(application?.candidate_id ?? '');

  const [note, setNote] = useState('');
  const [pendingReject, setPendingReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [newInterviewAt, setNewInterviewAt] = useState('');
  const [newInterviewMode, setNewInterviewMode] = useState('');

  // Override editor state inside the Unified Hero Card
  const [editingVerdict, setEditingVerdict] = useState(false);
  const [tierDraft, setTierDraft] = useState<ApplicationMatchTier>('adjacent');
  const [scoreDraft, setScoreDraft] = useState<string>('');
  const [summaryDraft, setSummaryDraft] = useState<string>('');
  const [strengthsDraft, setStrengthsDraft] = useState<string>('');
  const [transferableDraft, setTransferableDraft] = useState<string>('');
  const [gapsDraft, setGapsDraft] = useState<string>('');

  if (isLoading || !application) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  const ordered = sortApplicationsByMatch(applications ?? [], 'match');
  const currentIndex = ordered.findIndex((a) => a.id === applicationId);
  const prevApp = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
  const nextApp =
    currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined;

  const contact = application.candidateContact;
  const candidate = application.candidate;
  const assessment = parseAiAssessment(application.ai_assessment);
  const prepQuestions = assessment?.interview_questions ?? [];
  const parsedNotes = parseApplicationNotes(application.notes);
  const parsedCv = parseCvData(candidate?.cv_parsed);
  const screeningEntries = Object.entries(application.screening_answers ?? {});

  const scrollToCompare = () => {
    const el = document.getElementById('section-compare');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const submitNote = async () => {
    const body = note.trim();
    if (!body) return;
    await addNote.mutateAsync(body);
    setNote('');
    toast.success('Note added');
  };

  const downloadCv = async () => {
    if (!candidate) return;
    const url = await cvSignedUrl(candidate.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('No CV on file for this candidate');
  };

  const openCoverLetter = async () => {
    if (!parsedNotes.coverLetterPath) return;
    const url = await candidateStorageSignedUrl(parsedNotes.coverLetterPath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('Could not open cover letter file');
  };

  const scheduleNew = async () => {
    if (!newInterviewAt) return;
    await schedule.mutateAsync({
      applicationId,
      scheduledAt: new Date(newInterviewAt).toISOString(),
      mode: newInterviewMode || null,
    });
    setNewInterviewAt('');
    setNewInterviewMode('');
    toast.success('Interview scheduled');
  };

  const onStageSelect = async (stage: string) => {
    if (stage === 'rejected') {
      setPendingReject(true);
      return;
    }
    setPendingReject(false);
    if (stage === 'hired') {
      await moveStage.mutateAsync({ id: applicationId, stage });
      if (vacancy && vacancy.status !== 'closed') {
        updateVacancy.mutate(
          { status: 'closed' as const },
          {
            onSuccess: () => toast.success('Candidate hired — vacancy closed'),
            onError: () => toast.success('Candidate hired'),
          },
        );
      }
      return;
    }
    await moveStage.mutateAsync({ id: applicationId, stage: stage as ApplicationStage });
    toast.success(`Moved to ${stageMeta(stage as ApplicationStage).label}`);
  };

  const confirmReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Please enter a reason before rejecting');
      return;
    }
    await moveStage.mutateAsync({
      id: applicationId,
      stage: 'rejected',
      reason,
    });
    setRejectReason('');
    setPendingReject(false);
    toast.success('Moved to Rejected');
  };

  const handleRunEvaluation = async (forceReparseCv = false) => {
    try {
      await evaluateApp.mutateAsync({ applicationId, forceReparseCv });
      toast.success('AI evaluation updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not run AI evaluation');
    }
  };

  const startEditVerdict = () => {
    setTierDraft(application.match_tier ?? 'adjacent');
    setScoreDraft(application.match_score != null ? String(application.match_score) : '');
    setSummaryDraft(assessment?.summary ?? '');
    setStrengthsDraft((assessment?.strengths ?? []).join('\n'));
    setTransferableDraft((assessment?.transferable_skills ?? []).join('\n'));
    setGapsDraft((assessment?.gaps_or_risks ?? []).join('\n'));
    setEditingVerdict(true);
  };

  const handleSaveVerdict = async () => {
    const parsedScore = scoreDraft.trim() === '' ? null : Number(scoreDraft);
    await saveOverride.mutateAsync({
      applicationId,
      override: {
        currentAssessment: assessment,
        currentTier: application.match_tier,
        currentScore: application.match_score,
        nextTier: tierDraft,
        nextScore: parsedScore != null && Number.isFinite(parsedScore) ? parsedScore : null,
        summary: summaryDraft,
        strengths: strengthsDraft.split('\n'),
        transferableSkills: transferableDraft.split('\n'),
        gapsOrRisks: gapsDraft.split('\n'),
        interviewQuestions: assessment?.interview_questions ?? [],
      },
    });
    setEditingVerdict(false);
    toast.success('Assessment updated');
  };

  // Build a single clean subtitle line without repeating experience multiple times
  const subtitleParts: string[] = [];
  if (candidate?.headline) subtitleParts.push(candidate.headline);
  if (parsedNotes.location) subtitleParts.push(parsedNotes.location);
  if (
    candidate?.years_experience != null &&
    !(candidate.headline ?? '').toLowerCase().includes('yr')
  ) {
    subtitleParts.push(`${candidate.years_experience} yrs exp`);
  }
  subtitleParts.push(`Applied ${formatRelative(application.applied_at)}`);

  // Contact & document text links (Call · WhatsApp · Email · LinkedIn · Cover Letter)
  const contactLinks: { label: string; href?: string; onClick?: () => void }[] = [];
  if (contact?.phone_e164) {
    contactLinks.push({ label: 'Call', href: `tel:${contact.phone_e164}` });
    contactLinks.push({
      label: 'WhatsApp',
      href: `https://wa.me/${contact.phone_e164.replace('+', '')}`,
    });
  }
  if (contact?.email) {
    contactLinks.push({ label: 'Email', href: `mailto:${contact.email}` });
  }
  if (parsedNotes.linkedInUrl) {
    contactLinks.push({ label: 'LinkedIn', href: parsedNotes.linkedInUrl });
  }
  if (parsedNotes.coverLetterPath) {
    contactLinks.push({
      label: 'Cover Letter PDF',
      onClick: () => void openCoverLetter(),
    });
  }

  const tierStyle = application.match_tier
    ? AI_BOX_STYLES[application.match_tier]
    : AI_BOX_STYLES.unscored;

  const badgeLabel =
    application.match_tier && application.match_tier !== 'unscored'
      ? `${application.match_score != null ? `${Math.round(application.match_score)}% ` : ''}${MATCH_TIER_META[application.match_tier].label}`
      : application.match_tier === 'unscored'
        ? 'Manual Read'
        : 'Not Evaluated Yet';

  return (
    <div className="space-y-8">
      {/* =====================================================================
          1. TOP NAVIGATION BAR (OUTSIDE THE CARD, SLIM & STICKY ON CANVAS)
         ===================================================================== */}
      {isFullPage && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border-strong bg-canvas/95 py-3 backdrop-blur-sm">
          <button
            className="inline-flex items-center gap-2 text-md font-semibold text-ink transition-colors hover:text-primary"
            onClick={() => void navigate(`/recruitment/${vacancyId}`)}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to {vacancy?.title ?? 'vacancy pipeline'}</span>
          </button>

          <div className="flex items-center gap-4">
            {ordered.length >= 2 && (
              <button
                className="inline-flex items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3.5 py-1.5 text-base font-semibold text-ink transition-colors hover:bg-surface-sunken"
                onClick={scrollToCompare}
                type="button"
              >
                <Scale className="h-4 w-4 text-primary" />
                Compare candidates
              </button>
            )}

            {ordered.length > 1 && currentIndex >= 0 && (
              <div className="flex items-center gap-2 text-md font-medium text-ink">
                <button
                  className={cn(
                    'inline-flex items-center gap-1 rounded-control px-2 py-1 transition-colors',
                    prevApp
                      ? 'text-ink hover:bg-surface-sunken'
                      : 'cursor-not-allowed text-ink-muted/60',
                  )}
                  disabled={!prevApp}
                  onClick={() =>
                    prevApp &&
                    void navigate(`/recruitment/${vacancyId}/applications/${prevApp.id}`)
                  }
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <span className="font-bold tabular-nums text-ink">
                  {currentIndex + 1} / {ordered.length}
                </span>
                <button
                  className={cn(
                    'inline-flex items-center gap-1 rounded-control px-2 py-1 transition-colors',
                    nextApp
                      ? 'text-ink hover:bg-surface-sunken'
                      : 'cursor-not-allowed text-ink-muted/60',
                  )}
                  disabled={!nextApp}
                  onClick={() =>
                    nextApp &&
                    void navigate(`/recruitment/${vacancyId}/applications/${nextApp.id}`)
                  }
                  type="button"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          2. UNIFIED SINGLE HERO CARD (OPTION A — PROFILE + AI SUMMARY)
         ===================================================================== */}
      <div className="rounded-card border border-border-strong bg-surface p-7 shadow-2xs">
        {/* Top Half: Candidate Identity on Left | Open CV + Stage Dropdown on Right */}
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold text-ink">
                {contact?.full_name ?? 'Unnamed candidate'}
              </h1>

              {/* Interactive 1–5 Star Rating */}
              {candidate && (
                <span className="inline-flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      aria-label={`Rate ${n} out of 5`}
                      className="p-0.5"
                      key={n}
                      onClick={() =>
                        updateCandidate.mutate({ rating: candidate.rating === n ? null : n })
                      }
                      type="button"
                    >
                      <Star
                        className={cn(
                          'h-5 w-5 transition-colors',
                          candidate.rating != null && candidate.rating >= n
                            ? 'fill-current text-primary'
                            : 'text-ink-muted',
                        )}
                      />
                    </button>
                  ))}
                </span>
              )}
            </div>

            {/* Single Clean Subtitle Line */}
            <p className="mt-1.5 text-md font-medium text-ink">
              {subtitleParts.join(' · ')}
            </p>

            {/* Clean Inline Contact Links (`Call · WhatsApp · Email · LinkedIn`) */}
            {contactLinks.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-md font-semibold text-primary">
                {contactLinks.map((item, idx) => (
                  <span className="inline-flex items-center gap-2" key={item.label}>
                    {idx > 0 && <span className="text-ink-muted">·</span>}
                    {item.href ? (
                      <a
                        className="hover:underline"
                        href={item.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <button
                        className="hover:underline"
                        onClick={item.onClick}
                        type="button"
                      >
                        {item.label}
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right Side: Only [Open CV] and [Stage: New v] */}
          <div className="flex flex-col items-end gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              {candidate && (
                <Button
                  className="h-10 px-5 text-md font-semibold"
                  onClick={() => void downloadCv()}
                  type="button"
                  variant="primary"
                >
                  Open CV
                </Button>
              )}

              <Select onValueChange={(v) => void onStageSelect(v)} value={application.stage}>
                <SelectTrigger className="h-10 w-44 border-border-strong bg-surface text-md font-semibold text-ink">
                  <span>
                    Stage: <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rejection Reason Input ONLY appears when user selects "Rejected" */}
            {pendingReject && (
              <div className="flex flex-wrap items-center gap-2 rounded-control border border-danger/40 bg-danger-soft/50 p-2.5">
                <Input
                  className="h-9 w-64 border-border-strong bg-surface text-base text-ink"
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection…"
                  value={rejectReason}
                />
                <Button onClick={() => void confirmReject()} size="sm" variant="danger">
                  Confirm Reject
                </Button>
                <Button
                  onClick={() => {
                    setPendingReject(false);
                    setRejectReason('');
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Thin Horizontal Divider inside the Unified Card */}
        <hr className="my-6 border-border-strong" />

        {/* Bottom Half of the Unified Card: Softly Tinted AI Summary Box */}
        <div className={cn('rounded-control p-5', tierStyle.box)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'rounded-control px-3.5 py-1 text-base font-bold tabular-nums shadow-2xs',
                  tierStyle.pill,
                )}
              >
                {badgeLabel}
              </span>
              <span className="font-display text-md font-bold text-ink">
                AI summary says:
              </span>
              {assessment?.overridden_by_name && (
                <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-bold text-primary">
                  Adjusted by {assessment.overridden_by_name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!editingVerdict && (
                <button
                  className="rounded-control border border-border-strong bg-surface px-3.5 py-1.5 text-base font-semibold text-ink transition-colors hover:bg-surface-sunken"
                  onClick={startEditVerdict}
                  type="button"
                >
                  Edit
                </button>
              )}
              <button
                className="inline-flex items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3.5 py-1.5 text-base font-semibold text-ink transition-colors hover:bg-surface-sunken disabled:opacity-50"
                disabled={evaluateApp.isPending}
                onClick={() => void handleRunEvaluation(false)}
                type="button"
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', evaluateApp.isPending && 'animate-spin')}
                />
                {evaluateApp.isPending
                  ? 'Evaluating…'
                  : assessment
                    ? 'Re-evaluate'
                    : 'Evaluate with AI'}
              </button>
            </div>
          </div>

          <p className="mt-3 text-md font-medium leading-relaxed text-ink">
            {assessment?.summary ??
              'Not evaluated yet. Click Re-evaluate to score this candidate’s CV, cover letter, and screening answers against the job description.'}
          </p>

          {/* Practical Hindrance / Dealbreaker Flags surfaced right inside the Hero Card */}
          {(assessment?.hindrance_flags?.length ?? 0) > 0 && (
            <div className="mt-4 space-y-2.5">
              {assessment!.hindrance_flags.map((flag, idx) => (
                <div
                  className={cn(
                    'rounded-control border px-4 py-3 text-ink',
                    flag.severity === 'blocker'
                      ? 'border-danger/50 bg-danger-soft/85'
                      : 'border-warning/60 bg-warning-soft/90',
                  )}
                  key={`${flag.title}-${idx}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle
                      className={cn(
                        'h-4 w-4 shrink-0',
                        flag.severity === 'blocker' ? 'text-danger' : 'text-warning',
                      )}
                    />
                    <span
                      className={cn(
                        'rounded-pill px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                        flag.severity === 'blocker'
                          ? 'bg-danger text-primary-ink'
                          : 'bg-warning text-primary-ink',
                      )}
                    >
                      {flag.severity === 'blocker' ? 'Hindrance Flag' : 'Confirm First'}
                    </span>
                    <span className="text-md font-bold text-ink">{flag.title}</span>
                  </div>
                  {flag.detail && (
                    <p className="mt-1.5 text-base font-medium leading-snug text-ink">
                      {flag.detail}
                    </p>
                  )}
                  {flag.confirm_prompt && (
                    <p className="mt-1.5 text-base font-semibold leading-snug text-ink">
                      Suggested check with candidate:{' '}
                      <span className="font-medium">{flag.confirm_prompt}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inline Override Editor when Edit is clicked */}
          {editingVerdict && (
            <div className="mt-5 space-y-4 rounded-card border border-border-strong bg-surface p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm font-semibold text-ink">Match tier</Label>
                  <Select
                    onValueChange={(v) => setTierDraft(v as ApplicationMatchTier)}
                    value={tierDraft}
                  >
                    <SelectTrigger className="mt-1 bg-surface text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MATCH_TIER_META) as ApplicationMatchTier[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {MATCH_TIER_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-semibold text-ink">Match score (0–100%)</Label>
                  <Input
                    className="mt-1 bg-surface text-base"
                    disabled={tierDraft === 'unscored'}
                    max={100}
                    min={0}
                    onChange={(e) => setScoreDraft(e.target.value)}
                    placeholder="e.g. 82"
                    type="number"
                    value={scoreDraft}
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-ink">Recruiter brief / summary</Label>
                <Textarea
                  className="mt-1 min-h-0 bg-surface text-md"
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  placeholder="2–3 sentence summary of how this candidate fits the role…"
                  rows={2}
                  value={summaryDraft}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                  <Label className="text-sm font-semibold text-ink">Strengths (one per line)</Label>
                  <Textarea
                    className="mt-1 min-h-0 bg-surface text-base"
                    onChange={(e) => setStrengthsDraft(e.target.value)}
                    rows={3}
                    value={strengthsDraft}
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-ink">
                    Transferable / Adjacent Fit (one per line)
                  </Label>
                  <Textarea
                    className="mt-1 min-h-0 bg-surface text-base"
                    onChange={(e) => setTransferableDraft(e.target.value)}
                    rows={3}
                    value={transferableDraft}
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-ink">
                    Gaps or Risks (one per line)
                  </Label>
                  <Textarea
                    className="mt-1 min-h-0 bg-surface text-base"
                    onChange={(e) => setGapsDraft(e.target.value)}
                    rows={3}
                    value={gapsDraft}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button onClick={() => setEditingVerdict(false)} size="sm" variant="ghost">
                  Cancel
                </Button>
                <Button
                  disabled={saveOverride.isPending}
                  onClick={() => void handleSaveVerdict()}
                  size="sm"
                  variant="primary"
                >
                  {saveOverride.isPending ? 'Saving…' : 'Save assessment'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          SECTION 1: 1. APPLICATION & CV DETAILS (CLEAN BOLD HEADING ON CANVAS)
         ===================================================================== */}
      <section className="scroll-mt-20 space-y-4" id="section-screening-cv">
        <h2 className="font-display text-xl font-bold text-ink">1. Application &amp; CV Details</h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 6 cols: Screening Question Responses + Documents */}
          <div className="space-y-6 lg:col-span-6">
            <div className="rounded-card border border-border-strong bg-surface p-6 shadow-2xs">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-ink">
                  Screening Question Responses
                </h3>
                <span className="rounded-pill bg-primary-soft px-3 py-0.5 text-sm font-bold text-primary">
                  {screeningEntries.length} answered
                </span>
              </div>

              {screeningEntries.length === 0 ? (
                <p className="text-md font-medium text-ink-secondary">
                  No screening questions were answered on this application.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {screeningEntries.map(([key, val]) => {
                    const matchedQ = (vacancy?.screening_questions ?? []).find(
                      (q) => q.id === key,
                    );
                    const prompt = matchedQ ? matchedQ.question : key;
                    const answerText = formatAnswer(val);

                    return (
                      <div
                        className="rounded-control border border-border-strong bg-surface-sunken/40 p-4"
                        key={key}
                      >
                        <p className="text-base font-semibold text-ink-secondary">{prompt}</p>
                        <p className="mt-1 text-md font-bold text-ink">{answerText}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cover Letter & Documents inside the same left column card */}
              {(parsedNotes.coverLetterPath || parsedNotes.cleanCoverNote) && (
                <div className="mt-6 border-t border-border-strong pt-5">
                  <h4 className="mb-3 font-display text-md font-bold text-ink">
                    Cover Letter &amp; Application Note
                  </h4>

                  {parsedNotes.coverLetterPath && (
                    <div className="flex items-center justify-between gap-3 rounded-control border border-border-strong bg-surface-sunken/40 p-3.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-md font-bold text-ink">
                            {parsedNotes.coverLetterFilename ?? 'Cover Letter PDF'}
                          </p>
                          <p className="text-sm font-medium text-ink-secondary">
                            Uploaded cover letter document
                          </p>
                        </div>
                      </div>
                      <Button onClick={() => void openCoverLetter()} size="sm" variant="primary">
                        Open Cover Letter
                      </Button>
                    </div>
                  )}

                  {parsedNotes.cleanCoverNote && (
                    <p className="mt-3 whitespace-pre-line text-md leading-relaxed text-ink">
                      {parsedNotes.cleanCoverNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right 6 cols: CV Highlights & Practical Facts */}
          <div className="space-y-6 lg:col-span-6">
            <div className="rounded-card border border-border-strong bg-surface p-6 shadow-2xs space-y-5">
              <h3 className="font-display text-lg font-bold text-ink">
                CV Highlights &amp; Practical Facts
              </h3>

              {/* Practical Facts Row */}
              <div className="grid grid-cols-2 gap-3 rounded-control border border-border-strong bg-surface-sunken/40 p-4 sm:grid-cols-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                    Experience
                  </span>
                  <p className="mt-0.5 text-md font-bold text-ink">
                    {candidate?.years_experience != null
                      ? `${candidate.years_experience} years`
                      : 'Not stated'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                    Location
                  </span>
                  <p className="mt-0.5 text-md font-bold text-ink">
                    {parsedNotes.location ?? 'Not stated'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                    Salary Expect.
                  </span>
                  <p className="mt-0.5 text-md font-bold text-ink">
                    {candidate?.salary_expectation_ugx != null &&
                    candidate.salary_expectation_ugx > 0
                      ? formatUGX(BigInt(candidate.salary_expectation_ugx))
                      : 'Not stated'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                    Availability
                  </span>
                  <p className="mt-0.5 text-md font-bold text-ink">
                    {candidate?.availability
                      ? (AVAILABILITY_LABELS[candidate.availability] ?? candidate.availability)
                      : 'Not stated'}
                  </p>
                </div>
              </div>

              {parsedCv && parsedCv.readability !== 'unreadable' && parsedCv.summary && (
                <div>
                  <p className="mb-1.5 text-sm font-bold uppercase tracking-wide text-ink">
                    Extracted CV Summary
                  </p>
                  <p className="text-md leading-relaxed text-ink">{parsedCv.summary}</p>
                </div>
              )}

              {parsedCv && parsedCv.qualifications.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink">
                    Qualifications &amp; Certifications
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {parsedCv.qualifications.map((q) => (
                      <span
                        className="rounded-pill border border-primary/30 bg-primary-soft px-3.5 py-1 text-base font-bold text-primary"
                        key={q}
                      >
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {candidate && candidate.skills.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink">
                    Skills ({candidate.skills.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {candidate.skills.map((s) => (
                      <span
                        className="rounded-pill border border-border-strong bg-surface-sunken px-3.5 py-1 text-base font-semibold text-ink"
                        key={s}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: 2. AI MATCH BREAKDOWN & TRANSFERABLE EVIDENCE
         ===================================================================== */}
      <section className="scroll-mt-20 space-y-4" id="section-ai-match">
        <h2 className="font-display text-xl font-bold text-ink">
          2. AI Match Breakdown &amp; Transferable Evidence
        </h2>

        <MatchBreakdownSection
          assessment={assessment}
          isEvaluating={evaluateApp.isPending}
          onEvaluate={() => void handleRunEvaluation(false)}
        />
      </section>

      {/* =====================================================================
          SECTION 3: 3. INTERVIEW PREP & SCHEDULING
         ===================================================================== */}
      <section className="scroll-mt-20 space-y-4" id="section-interview-prep">
        <h2 className="font-display text-xl font-bold text-ink">
          3. Interview Prep &amp; Scheduling
        </h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <InterviewPrepSection
              applicationId={applicationId}
              assessment={assessment}
              isSaving={updateQuestions.isPending}
              onSaveQuestions={async (questions) => {
                await updateQuestions.mutateAsync({
                  applicationId,
                  currentAssessment: assessment,
                  questions,
                });
                toast.success('Interview prep questions saved');
              }}
              questions={prepQuestions}
            />
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-card border border-border-strong bg-surface p-6 shadow-2xs">
              <h3 className="mb-4 font-display text-lg font-bold text-ink">
                Scheduled Interviews &amp; Feedback
              </h3>

              <div className="space-y-3">
                {(interviews ?? []).map((interview) => (
                  <div
                    className="rounded-control border border-border-strong bg-surface-sunken/40 p-4"
                    key={interview.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-md font-bold text-ink">
                        <Calendar className="h-4 w-4 text-primary" />
                        {interview.scheduled_at
                          ? formatDateTime(interview.scheduled_at)
                          : 'No time set'}
                      </span>
                      <StatusChip variant="neutral">{interview.mode ?? 'In person'}</StatusChip>
                    </div>
                    {interview.outcome && (
                      <p className="mt-1.5 text-base font-semibold text-ink">
                        Outcome: {interview.outcome}
                      </p>
                    )}
                    {interview.feedback && (
                      <p className="mt-1.5 text-md text-ink">{interview.feedback}</p>
                    )}
                    {interview.rating != null && interview.rating > 0 && (
                      <p className="mt-1 text-sm font-medium text-ink-secondary">
                        Rated {interview.rating} / 5
                      </p>
                    )}
                    {!interview.feedback && !interview.outcome && (
                      <FeedbackForm
                        interviewId={interview.id}
                        onRecord={recordFeedback.mutateAsync}
                      />
                    )}
                  </div>
                ))}
                {(interviews ?? []).length === 0 && (
                  <p className="text-md font-medium text-ink-secondary">
                    No interviews scheduled yet.
                  </p>
                )}
              </div>

              <div className="mt-6 border-t border-border-strong pt-5">
                <h4 className="mb-3 font-display text-md font-bold text-ink">
                  Schedule a New Interview
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-semibold text-ink">Date &amp; Time</Label>
                    <Input
                      className="mt-1 border-border-strong text-base"
                      onChange={(e) => setNewInterviewAt(e.target.value)}
                      type="datetime-local"
                      value={newInterviewAt}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-ink">Mode</Label>
                    <Select onValueChange={setNewInterviewMode} value={newInterviewMode}>
                      <SelectTrigger className="mt-1 border-border-strong text-base">
                        <SelectValue placeholder="In person" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_person">In person</SelectItem>
                        <SelectItem value="video">Video call</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  className="mt-4 w-full text-base font-semibold"
                  disabled={!newInterviewAt || schedule.isPending}
                  onClick={() => void scheduleNew()}
                  size="sm"
                  variant="primary"
                >
                  <Calendar className="mr-1.5 h-4 w-4" />
                  Schedule interview
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: 4. TEAM NOTES & ACTIVITY LOG
         ===================================================================== */}
      <section className="scroll-mt-20 space-y-4" id="section-notes">
        <h2 className="font-display text-xl font-bold text-ink">
          4. Team Notes &amp; Activity Log
        </h2>

        <div className="rounded-card border border-border-strong bg-surface p-6 shadow-2xs">
          <div className="mb-5 flex gap-2.5">
            <Textarea
              className="min-h-0 border-border-strong text-md text-ink"
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add an internal recruiter note on this application…"
              rows={2}
              value={note}
            />
            <Button
              className="shrink-0 self-end"
              disabled={!note.trim() || addNote.isPending}
              onClick={() => void submitNote()}
              size="icon"
              variant="primary"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <ol className="space-y-3">
            {(timeline ?? []).map((a) => (
              <li className="flex gap-3" key={a.id}>
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="whitespace-pre-line text-md font-medium text-ink">{a.body}</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-secondary">
                    {formatDateTime(a.occurred_at)}
                  </p>
                </div>
              </li>
            ))}
            {(timeline ?? []).length === 0 && (
              <li className="text-md font-medium text-ink-secondary">No activity recorded yet.</li>
            )}
          </ol>
        </div>
      </section>

      {/* =====================================================================
          SECTION 5: 5. COMPARE CANDIDATES SIDE-BY-SIDE
         ===================================================================== */}
      {ordered.length >= 2 && (
        <section className="scroll-mt-20 space-y-4" id="section-compare">
          <h2 className="font-display text-xl font-bold text-ink">
            5. Compare Candidates Side-by-Side
          </h2>

          <CandidateCompareMatrix
            applications={ordered}
            primaryApplicationId={applicationId}
            vacancy={vacancy}
            vacancyId={vacancyId}
          />
        </section>
      )}
    </div>
  );
}

function MatchBreakdownSection({
  assessment,
  isEvaluating,
  onEvaluate,
}: {
  assessment: ApplicationAiAssessment | null;
  isEvaluating: boolean;
  onEvaluate: () => void;
}) {
  if (!assessment) {
    return (
      <div className="rounded-card border border-border-strong bg-surface p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-primary" />
        <h3 className="mt-2 font-display text-lg font-bold text-ink">
          No AI Match Breakdown Yet
        </h3>
        <p className="mx-auto mt-1 max-w-md text-md text-ink-secondary">
          Run the AI evaluator to see the 4-pillar score breakdown, transferable skill analysis,
          and tailored interview questions for this applicant.
        </p>
        <Button
          className="mt-4"
          disabled={isEvaluating}
          onClick={onEvaluate}
          size="sm"
          variant="primary"
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          {isEvaluating ? 'Evaluating…' : 'Evaluate with AI'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 4-Pillar Score Cards — Stacked Full-Width (One Per Row) */}
      {assessment.status === 'scored' && (
        <div className="space-y-3.5">
          <PillarCard
            label="Core Skills & Requirements"
            max={assessment.pillars.core_skills.max}
            note={assessment.pillars.core_skills.note}
            score={assessment.pillars.core_skills.score}
          />
          <PillarCard
            label="Transferable & Industry Context"
            max={assessment.pillars.transferable_and_industry.max}
            note={assessment.pillars.transferable_and_industry.note}
            score={assessment.pillars.transferable_and_industry.score}
          />
          <PillarCard
            label="Experience & Trajectory"
            max={assessment.pillars.experience_and_trajectory.max}
            note={assessment.pillars.experience_and_trajectory.note}
            score={assessment.pillars.experience_and_trajectory.score}
          />
          <PillarCard
            label="Cover Note & Practicals"
            max={assessment.pillars.practical_and_cover_note.max}
            note={assessment.pillars.practical_and_cover_note.note}
            score={assessment.pillars.practical_and_cover_note.score}
          />
        </div>
      )}

      {/* Full-Width Stacked Evidence Cards */}
      <div className="space-y-4">
        {/* 1. Strengths & Direct Evidence */}
        <div className="overflow-hidden rounded-card border-2 border-success/50 bg-surface shadow-2xs">
          <div className="flex items-center gap-3 border-b border-success/30 bg-success-soft px-5 py-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success text-primary-ink">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <h4 className="font-display text-lg font-bold text-success-ink">
              Strengths &amp; Direct Evidence
            </h4>
          </div>
          <div className="p-5">
            {assessment.strengths.length > 0 ? (
              <ul className="space-y-2.5 text-md leading-relaxed text-ink">
                {assessment.strengths.map((s, idx) => (
                  <li className="flex gap-3" key={idx}>
                    <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
                    <span className="font-medium">{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-md font-medium text-ink-secondary">
                No direct role strengths highlighted.
              </p>
            )}
          </div>
        </div>

        {/* 2. Why They Translate (Human Factor / Adjacent Fit) */}
        <div className="overflow-hidden rounded-card border-2 border-info/50 bg-surface shadow-2xs">
          <div className="flex items-center gap-3 border-b border-info/30 bg-info-soft px-5 py-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-info text-primary-ink">
              <Compass className="h-4 w-4" />
            </span>
            <h4 className="font-display text-lg font-bold text-info-ink">
              Why They Translate (Human Factor &amp; Adjacent Fit)
            </h4>
          </div>
          <div className="p-5">
            {assessment.transferable_skills.length > 0 ? (
              <ul className="space-y-2.5 text-md leading-relaxed text-ink">
                {assessment.transferable_skills.map((s, idx) => (
                  <li className="flex gap-3" key={idx}>
                    <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-info" />
                    <span className="font-medium">{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-md font-medium text-ink-secondary">
                No adjacent crossovers noted.
              </p>
            )}
          </div>
        </div>

        {/* 3. Gaps / Risks to Verify */}
        <div className="overflow-hidden rounded-card border-2 border-danger/50 bg-surface shadow-2xs">
          <div className="flex items-center gap-3 border-b border-danger/30 bg-danger-soft px-5 py-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-danger text-primary-ink">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h4 className="font-display text-lg font-bold text-danger-ink">
              Gaps / Risks to Verify in Interview
            </h4>
          </div>
          <div className="p-5">
            {assessment.gaps_or_risks.length > 0 ? (
              <ul className="space-y-2.5 text-md leading-relaxed text-ink">
                {assessment.gaps_or_risks.map((s, idx) => (
                  <li className="flex gap-3" key={idx}>
                    <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />
                    <span className="font-medium">{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-md font-medium text-ink-secondary">No major gaps flagged.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-width Pillar Card with a filled semantic header band and 16px (`text-md`) body text.
 */
function PillarCard({
  label,
  score,
  max,
  note,
}: {
  label: string;
  score: number;
  max: number;
  note: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((score / max) * 100))) : 0;

  const headerBandStyle =
    pct >= 70
      ? 'bg-success-soft border-b border-success/30 text-success-ink'
      : pct >= 45
        ? 'bg-warning-soft border-b border-warning/30 text-warning-ink'
        : 'bg-danger-soft border-b border-danger/30 text-danger-ink';

  const barColor = pct >= 70 ? 'bg-success' : pct >= 45 ? 'bg-warning' : 'bg-danger';
  const badgeStyle =
    pct >= 70
      ? 'bg-success text-primary-ink'
      : pct >= 45
        ? 'bg-warning text-primary-ink'
        : 'bg-danger text-primary-ink';

  return (
    <div className="overflow-hidden rounded-card border border-border-strong bg-surface shadow-2xs">
      <div className={cn('flex items-center justify-between gap-3 px-5 py-2.5', headerBandStyle)}>
        <h4 className="font-display text-md font-bold">{label}</h4>
        <span
          className={cn(
            'rounded-pill px-3 py-0.5 text-base font-bold tabular-nums shadow-2xs',
            badgeStyle,
          )}
        >
          {score} / {max} ({pct}%)
        </span>
      </div>

      <div className="p-5">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        {note && <p className="mt-2.5 text-md font-medium leading-relaxed text-ink">{note}</p>}
      </div>
    </div>
  );
}

function InterviewPrepSection({
  questions,
  isSaving,
  onSaveQuestions,
}: {
  applicationId: string;
  assessment: ApplicationAiAssessment | null;
  questions: InterviewPrepQuestion[];
  isSaving: boolean;
  onSaveQuestions: (questions: InterviewPrepQuestion[]) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState('');
  const [whyDraft, setWhyDraft] = useState('');
  const [questionDraft, setQuestionDraft] = useState('');

  const startAdd = () => {
    setEditingId(null);
    setTopicDraft('');
    setWhyDraft('');
    setQuestionDraft('');
    setAdding(true);
  };

  const startEditQuestion = (q: InterviewPrepQuestion) => {
    setAdding(false);
    setEditingId(q.id);
    setTopicDraft(q.topic);
    setWhyDraft(q.why_ask);
    setQuestionDraft(q.question);
  };

  const handleSaveNew = async () => {
    if (!questionDraft.trim()) return;
    const newQ: InterviewPrepQuestion = {
      id: `iq_${Date.now()}`,
      topic: topicDraft.trim() || 'Recruiter probe',
      why_ask: whyDraft.trim(),
      question: questionDraft.trim(),
      source: 'human',
    };
    await onSaveQuestions([...questions, newQ]);
    setAdding(false);
  };

  const handleSaveEdited = async (id: string) => {
    if (!questionDraft.trim()) return;
    const next = questions.map((q) =>
      q.id === id
        ? {
            ...q,
            topic: topicDraft.trim() || 'Follow-up',
            why_ask: whyDraft.trim(),
            question: questionDraft.trim(),
          }
        : q,
    );
    await onSaveQuestions(next);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await onSaveQuestions(questions.filter((q) => q.id !== id));
  };

  return (
    <div className="rounded-card border border-border-strong bg-surface p-6 shadow-2xs">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Questions to Probe in Interview
          </h3>
          <p className="text-sm font-medium text-ink-secondary">
            Tailored questions based on missing details, adjacent transitions, or claims to verify.
          </p>
        </div>
        {!adding && (
          <Button onClick={startAdd} size="sm" variant="primary">
            <Plus className="mr-1 h-4 w-4" />
            Add question
          </Button>
        )}
      </div>

      {questions.length === 0 && !adding ? (
        <p className="text-md font-medium text-ink-secondary">
          No interview prep questions yet. Run AI evaluation or add your own questions for the call.
        </p>
      ) : (
        <div className="space-y-3.5">
          {questions.map((q, idx) =>
            editingId === q.id ? (
              <div
                className="space-y-3 rounded-control border border-border-strong bg-surface-sunken/50 p-4"
                key={q.id}
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Input
                    className="border-border-strong bg-surface text-base"
                    onChange={(e) => setTopicDraft(e.target.value)}
                    placeholder="Topic (e.g. URA EFRIS depth)"
                    value={topicDraft}
                  />
                  <Input
                    className="border-border-strong bg-surface text-base"
                    onChange={(e) => setWhyDraft(e.target.value)}
                    placeholder="Why ask (what was unclear on CV)"
                    value={whyDraft}
                  />
                </div>
                <Textarea
                  className="min-h-0 border-border-strong bg-surface text-md"
                  onChange={(e) => setQuestionDraft(e.target.value)}
                  placeholder="Exact question to ask the candidate…"
                  rows={2}
                  value={questionDraft}
                />
                <div className="flex justify-end gap-2">
                  <Button onClick={() => setEditingId(null)} size="sm" variant="ghost">
                    Cancel
                  </Button>
                  <Button
                    disabled={isSaving || !questionDraft.trim()}
                    onClick={() => void handleSaveEdited(q.id)}
                    size="sm"
                    variant="primary"
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="rounded-control border border-border-strong bg-surface-sunken/40 p-4"
                key={q.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-ink">
                      {idx + 1}
                    </span>
                    <span className="rounded-pill border border-border-strong bg-surface px-3 py-0.5 text-base font-bold text-ink">
                      {q.topic}
                    </span>
                    <span className="text-sm font-medium text-ink-secondary">
                      {q.source === 'human' ? 'Added by recruiter' : 'AI suggested'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={`Edit question ${idx + 1}`}
                      className="rounded p-1.5 text-ink-secondary hover:bg-surface hover:text-ink"
                      onClick={() => startEditQuestion(q)}
                      type="button"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Delete question ${idx + 1}`}
                      className="rounded p-1.5 text-ink-secondary hover:bg-surface hover:text-danger"
                      onClick={() => void handleDelete(q.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-2.5 text-md font-bold leading-snug text-ink">{q.question}</p>
                {q.why_ask && (
                  <p className="mt-1.5 text-base leading-relaxed text-ink">
                    <strong className="font-bold text-primary">Why probe:</strong> {q.why_ask}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {adding && (
        <div className="mt-4 space-y-3 rounded-control border border-border-strong bg-surface-sunken/50 p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Input
              className="border-border-strong bg-surface text-base"
              onChange={(e) => setTopicDraft(e.target.value)}
              placeholder="Topic (e.g. Team management scale)"
              value={topicDraft}
            />
            <Input
              className="border-border-strong bg-surface text-base"
              onChange={(e) => setWhyDraft(e.target.value)}
              placeholder="Why ask (optional note)"
              value={whyDraft}
            />
          </div>
          <Textarea
            className="min-h-0 border-border-strong bg-surface text-md"
            onChange={(e) => setQuestionDraft(e.target.value)}
            placeholder="Write the question to ask in the interview…"
            rows={2}
            value={questionDraft}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAdding(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={isSaving || !questionDraft.trim()}
              onClick={() => void handleSaveNew()}
              size="sm"
              variant="primary"
            >
              Add question
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackForm({
  interviewId,
  onRecord,
}: {
  interviewId: string;
  onRecord: (input: {
    interviewId: string;
    feedback?: string | null;
    rating?: number | null;
    outcome?: string | null;
  }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState('');
  const [outcome, setOutcome] = useState('');

  const submit = async () => {
    await onRecord({
      interviewId,
      feedback: feedback.trim() || null,
      rating: rating ? Number(rating) : null,
      outcome: outcome || null,
    });
    setFeedback('');
    setRating('');
    setOutcome('');
    setOpen(false);
  };

  if (!open) {
    return (
      <Button className="mt-2" onClick={() => setOpen(true)} size="sm" variant="secondary">
        Record feedback
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        className="min-h-0 bg-surface text-base"
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback…"
        rows={2}
        value={feedback}
      />
      <div className="flex gap-2">
        <Select onValueChange={setRating} value={rating}>
          <SelectTrigger className="w-28 bg-surface text-base">
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((r) => (
              <SelectItem key={r} value={String(r)}>
                {r} / 5
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={setOutcome} value={outcome}>
          <SelectTrigger className="flex-1 bg-surface text-base">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="fail">Fail</SelectItem>
            <SelectItem value="pending">Undecided</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => void submit()} size="sm" variant="primary">
          Save
        </Button>
      </div>
    </div>
  );
}

function formatAnswer(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(formatAnswer).join(', ');
  return JSON.stringify(val);
}

import { useState } from 'react';
import {
  Phone,
  Mail,
  MessageCircle,
  FileText,
  Send,
  Star,
  Calendar,
  Sparkles,
  Pencil,
  Plus,
  Trash2,
  HelpCircle,
  RefreshCw,
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
import { formatDateTime, formatRelative, formatUGX } from '@/lib/format';
import { cvSignedUrl } from './recruitment-api';
import { PIPELINE_STAGES, stageMeta } from './recruitment-meta';
import { MatchBadge } from './match-badge';
import {
  MATCH_TIER_META,
  parseAiAssessment,
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
} from './use-recruitment';

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
          <ApplicationDetailBody applicationId={applicationId} vacancyId={vacancyId} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ApplicationDetailBody({
  applicationId,
  vacancyId,
}: {
  applicationId: string;
  vacancyId: string;
}) {
  const { data: applications } = useApplications(vacancyId);
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

  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [newInterviewAt, setNewInterviewAt] = useState('');
  const [newInterviewMode, setNewInterviewMode] = useState('');
  const [showSidebarPrep, setShowSidebarPrep] = useState(true);

  if (!application) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  const contact = application.candidateContact;
  const candidate = application.candidate;
  const meta = stageMeta(application.stage);
  const assessment = parseAiAssessment(application.ai_assessment);
  const prepQuestions = assessment?.interview_questions ?? [];

  const submitNote = async () => {
    const body = note.trim();
    if (!body) return;
    await addNote.mutateAsync(body);
    setNote('');
  };

  const downloadCv = async () => {
    if (!candidate) return;
    const url = await cvSignedUrl(candidate.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('No CV on file for this candidate');
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
  };

  const onMove = async (stage: string) => {
    const reason = stage === 'rejected' ? rejectReason.trim() || undefined : undefined;
    if (stage === 'rejected' && !reason) {
      toast.error('Please enter a reason before rejecting');
      return;
    }
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
    if (stage === 'rejected') {
      await moveStage.mutateAsync({
        id: applicationId,
        stage: 'rejected',
        ...(reason ? { reason } : {}),
      });
    } else {
      await moveStage.mutateAsync({ id: applicationId, stage: stage as ApplicationStage });
    }
    setRejectReason('');
  };

  const handleRunEvaluation = async (forceReparseCv = false) => {
    try {
      await evaluateApp.mutateAsync({ applicationId, forceReparseCv });
      toast.success('AI evaluation updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not run AI evaluation');
    }
  };

  return (
    <div className="flex max-h-[88vh] flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-surface p-6 pr-12">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold text-ink">
              {contact?.full_name ?? 'Unnamed candidate'}
            </h2>
            {candidate?.headline && (
              <p className="mt-0.5 text-sm text-ink-secondary">{candidate.headline}</p>
            )}
            {application.vacancy && (
              <p className="mt-0.5 text-sm text-ink-secondary">{application.vacancy.title}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {application.match_tier && (
              <MatchBadge score={application.match_score} tier={application.match_tier} />
            )}
            <StatusChip variant={meta.tone}>{meta.label}</StatusChip>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {contact?.phone_e164 && (
            <>
              <QuickAction href={`tel:${contact.phone_e164}`} icon={Phone} label="Call" />
              <QuickAction
                href={`https://wa.me/${contact.phone_e164.replace('+', '')}`}
                icon={MessageCircle}
                label="WhatsApp"
              />
            </>
          )}
          {contact?.email && (
            <QuickAction href={`mailto:${contact.email}`} icon={Mail} label="Email" />
          )}
          {candidate && (
            <button
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-sunken"
              onClick={() => void downloadCv()}
              type="button"
            >
              <FileText className="h-3.5 w-3.5" />
              CV
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
        {/* Left / Main column: AI Match, Interview Prep, Screening responses & Activity */}
        <div className="border-b border-border lg:col-span-7 lg:border-b-0 lg:border-r">
          {/* AI Match & Recruiter Brief */}
          <AiAssessmentSection
            applicationId={applicationId}
            assessment={assessment}
            isEvaluating={evaluateApp.isPending}
            isSavingOverride={saveOverride.isPending}
            matchScore={application.match_score}
            matchTier={application.match_tier}
            onEvaluate={handleRunEvaluation}
            onSaveOverride={async (override) => {
              await saveOverride.mutateAsync({ applicationId, override });
              toast.success('Assessment updated');
            }}
          />

          {/* Targeted Interview Prep & Questions to Probe */}
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

          {/* Screening Responses */}
          {application.screening_answers &&
            Object.keys(application.screening_answers).length > 0 && (
              <div className="border-b border-border p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                    Screening Question Responses
                  </h3>
                  <span className="rounded bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">
                    {Object.keys(application.screening_answers).length} answered
                  </span>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(application.screening_answers).map(([key, val]) => {
                    const matchedQ = (vacancy?.screening_questions ?? []).find((q) => q.id === key);
                    const prompt = matchedQ ? matchedQ.question : key;
                    const answerText = formatAnswer(val);

                    return (
                      <div
                        className="rounded-control border border-border bg-surface-sunken/40 p-3 text-xs"
                        key={key}
                      >
                        <p className="font-medium text-ink-secondary">{prompt}</p>
                        <p className="mt-1 text-sm font-semibold text-ink">{answerText}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Cover Note / Application Note */}
          {application.notes && (
            <div className="border-b border-border p-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Cover Note / Application Note
              </h3>
              <p className="whitespace-pre-line text-sm text-ink">{application.notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="p-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Activity
            </h3>

            <div className="mb-4 flex gap-2">
              <Textarea
                className="min-h-0"
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note…"
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
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                  <div className="min-w-0">
                    <p className="whitespace-pre-line text-sm text-ink">{a.body}</p>
                    <p className="text-xs text-ink-muted">{formatDateTime(a.occurred_at)}</p>
                  </div>
                </li>
              ))}
              {(timeline ?? []).length === 0 && (
                <li className="text-sm text-ink-muted">No activity yet.</li>
              )}
            </ol>
          </div>
        </div>

        {/* Right / Sidebar column: Stage, Facts, Skills, Interviews */}
        <div className="bg-surface-sunken/20 lg:col-span-5">
          {/* Stage control */}
          <div className="border-b border-border p-6">
            <label className="mb-1.5 block text-xs font-semibold text-ink-secondary">
              Move stage
            </label>
            <Select onValueChange={(v) => void onMove(v)} value={application.stage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {application.stage === 'rejected' && (
              <Input
                className="mt-2"
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)"
                value={rejectReason}
              />
            )}
          </div>

          {/* Candidate facts */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-6 text-sm">
            {candidate?.rating != null && candidate.rating > 0 && (
              <Fact label="Rating (Human)">
                <span className="inline-flex items-center gap-1 text-ink">
                  <Star className="h-3.5 w-3.5 fill-current text-warning" />
                  {candidate.rating} / 5
                </span>
              </Fact>
            )}
            {candidate?.years_experience != null && (
              <Fact label="Experience">{candidate.years_experience} yrs</Fact>
            )}
            {candidate?.salary_expectation_ugx != null && candidate.salary_expectation_ugx > 0 && (
              <Fact label="Salary expectation">
                {formatUGX(BigInt(candidate.salary_expectation_ugx))}
              </Fact>
            )}
            {candidate?.availability && <Fact label="Availability">{candidate.availability}</Fact>}
            <Fact label="Applied">{formatRelative(application.applied_at)}</Fact>
            {application.source && <Fact label="Source">{application.source}</Fact>}
          </div>

          {/* Skills */}
          {candidate && candidate.skills.length > 0 && (
            <div className="border-b border-border p-6">
              <label className="mb-2 block text-xs font-semibold text-ink-secondary">Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {candidate.skills.map((s) => (
                  <span
                    className="rounded-pill bg-surface-sunken px-2 py-0.5 text-xs text-ink-secondary"
                    key={s}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Interviews */}
          <div className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                Interviews
              </h3>
              {prepQuestions.length > 0 && (
                <button
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setShowSidebarPrep((v) => !v)}
                  type="button"
                >
                  {showSidebarPrep ? 'Hide' : 'Show'} prep ({prepQuestions.length})
                </button>
              )}
            </div>

            {showSidebarPrep && prepQuestions.length > 0 && (
              <div className="mb-3 rounded-control border border-border bg-surface p-3 text-xs">
                <p className="mb-1.5 flex items-center gap-1 font-semibold text-ink">
                  <HelpCircle className="h-3.5 w-3.5 text-primary" />
                  Questions to ask in interview
                </p>
                <ol className="list-decimal space-y-1.5 pl-4 text-ink-secondary">
                  {prepQuestions.map((q) => (
                    <li key={q.id}>
                      <span className="font-medium text-ink">{q.question}</span>
                      {q.why_ask && <span className="block text-[11px] text-ink-muted">{q.why_ask}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="space-y-2">
              {(interviews ?? []).map((interview) => (
                <div className="rounded-control border border-border bg-surface p-3" key={interview.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                      <Calendar className="h-3.5 w-3.5 text-ink-muted" />
                      {interview.scheduled_at
                        ? formatDateTime(interview.scheduled_at)
                        : 'No time set'}
                    </span>
                    <span className="text-xs text-ink-muted">{interview.mode ?? 'In person'}</span>
                  </div>
                  {interview.outcome && (
                    <p className="mt-1 text-xs text-ink-secondary">Outcome: {interview.outcome}</p>
                  )}
                  {interview.feedback && (
                    <p className="mt-1 text-sm text-ink">{interview.feedback}</p>
                  )}
                  {interview.rating != null && interview.rating > 0 && (
                    <p className="mt-1 text-xs text-ink-muted">Rated {interview.rating} / 5</p>
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
                <p className="text-sm text-ink-muted">No interviews yet.</p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <div>
                <Label className="text-xs">Schedule at</Label>
                <Input
                  className="mt-1"
                  onChange={(e) => setNewInterviewAt(e.target.value)}
                  type="datetime-local"
                  value={newInterviewAt}
                />
              </div>
              <div>
                <Label className="text-xs">Mode</Label>
                <Select onValueChange={setNewInterviewMode} value={newInterviewMode}>
                  <SelectTrigger className="mt-1">
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
              className="mt-2 w-full"
              disabled={!newInterviewAt || schedule.isPending}
              onClick={() => void scheduleNew()}
              size="sm"
              variant="secondary"
            >
              <Calendar className="mr-1.5 h-4 w-4" />
              Schedule interview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiAssessmentSection({
  assessment,
  matchTier,
  matchScore,
  isEvaluating,
  isSavingOverride,
  onEvaluate,
  onSaveOverride,
}: {
  applicationId: string;
  assessment: ApplicationAiAssessment | null;
  matchTier: ApplicationMatchTier | null;
  matchScore: number | null;
  isEvaluating: boolean;
  isSavingOverride: boolean;
  onEvaluate: (forceReparseCv?: boolean) => Promise<void>;
  onSaveOverride: (override: {
    currentAssessment: ApplicationAiAssessment | null;
    currentTier: ApplicationMatchTier | null;
    currentScore: number | null;
    nextTier: ApplicationMatchTier;
    nextScore: number | null;
    summary: string;
    strengths: string[];
    transferableSkills: string[];
    gapsOrRisks: string[];
    interviewQuestions: InterviewPrepQuestion[];
  }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [tierDraft, setTierDraft] = useState<ApplicationMatchTier>(matchTier ?? 'adjacent');
  const [scoreDraft, setScoreDraft] = useState<string>(matchScore != null ? String(matchScore) : '');
  const [summaryDraft, setSummaryDraft] = useState<string>(assessment?.summary ?? '');
  const [strengthsDraft, setStrengthsDraft] = useState<string>(
    (assessment?.strengths ?? []).join('\n'),
  );
  const [transferableDraft, setTransferableDraft] = useState<string>(
    (assessment?.transferable_skills ?? []).join('\n'),
  );
  const [gapsDraft, setGapsDraft] = useState<string>((assessment?.gaps_or_risks ?? []).join('\n'));

  const startEdit = () => {
    setTierDraft(matchTier ?? 'adjacent');
    setScoreDraft(matchScore != null ? String(matchScore) : '');
    setSummaryDraft(assessment?.summary ?? '');
    setStrengthsDraft((assessment?.strengths ?? []).join('\n'));
    setTransferableDraft((assessment?.transferable_skills ?? []).join('\n'));
    setGapsDraft((assessment?.gaps_or_risks ?? []).join('\n'));
    setEditing(true);
  };

  const handleSave = async () => {
    const parsedScore = scoreDraft.trim() === '' ? null : Number(scoreDraft);
    await onSaveOverride({
      currentAssessment: assessment,
      currentTier: matchTier,
      currentScore: matchScore,
      nextTier: tierDraft,
      nextScore: parsedScore != null && Number.isFinite(parsedScore) ? parsedScore : null,
      summary: summaryDraft,
      strengths: strengthsDraft.split('\n'),
      transferableSkills: transferableDraft.split('\n'),
      gapsOrRisks: gapsDraft.split('\n'),
      interviewQuestions: assessment?.interview_questions ?? [],
    });
    setEditing(false);
  };

  return (
    <div className="border-b border-border p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            AI Role Match &amp; Recruiter Brief
          </h3>
          {assessment?.overridden_by_name && (
            <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
              Adjusted by {assessment.overridden_by_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {!editing && (
            <Button onClick={startEdit} size="sm" variant="ghost">
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {assessment ? 'Edit / Override' : 'Set manual match'}
            </Button>
          )}
          <Button
            disabled={isEvaluating}
            onClick={() => void onEvaluate(false)}
            size="sm"
            variant="secondary"
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
            {isEvaluating ? 'Evaluating…' : assessment ? 'Re-evaluate' : 'Evaluate with AI'}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3 rounded-control border border-border bg-surface-sunken/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Match tier</Label>
              <Select
                onValueChange={(v) => setTierDraft(v as ApplicationMatchTier)}
                value={tierDraft}
              >
                <SelectTrigger className="mt-1 bg-surface">
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
              <Label className="text-xs">Match score (0–100%)</Label>
              <Input
                className="mt-1 bg-surface"
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
            <Label className="text-xs">Recruiter brief / summary</Label>
            <Textarea
              className="mt-1 min-h-0 bg-surface"
              onChange={(e) => setSummaryDraft(e.target.value)}
              placeholder="2–3 sentence summary of how this candidate fits the role…"
              rows={2}
              value={summaryDraft}
            />
          </div>

          <div>
            <Label className="text-xs">Strengths (one bullet per line)</Label>
            <Textarea
              className="mt-1 min-h-0 bg-surface"
              onChange={(e) => setStrengthsDraft(e.target.value)}
              placeholder="6 yrs FMCG accounting…"
              rows={2}
              value={strengthsDraft}
            />
          </div>

          <div>
            <Label className="text-xs">
              Transferable / Adjacent Industry Fit (one bullet per line)
            </Label>
            <Textarea
              className="mt-1 min-h-0 bg-surface"
              onChange={(e) => setTransferableDraft(e.target.value)}
              placeholder="Managed shift rosters in logistics — translates directly to manufacturing…"
              rows={2}
              value={transferableDraft}
            />
          </div>

          <div>
            <Label className="text-xs">Gaps or Risks (one bullet per line)</Label>
            <Textarea
              className="mt-1 min-h-0 bg-surface"
              onChange={(e) => setGapsDraft(e.target.value)}
              placeholder="No direct ERP X experience mentioned…"
              rows={2}
              value={gapsDraft}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={() => setEditing(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={isSavingOverride}
              onClick={() => void handleSave()}
              size="sm"
              variant="primary"
            >
              {isSavingOverride ? 'Saving…' : 'Save assessment'}
            </Button>
          </div>
        </div>
      ) : !assessment && !matchTier ? (
        <p className="mt-2 text-xs text-ink-muted">
          Not evaluated yet. Click <strong>Evaluate with AI</strong> to score the CV, cover note, and
          screening responses against this vacancy, or click <strong>Set manual match</strong> to
          record your own assessment.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {matchTier && <MatchBadge score={matchScore} tier={matchTier} />}
            {assessment?.ai_original_tier &&
              assessment.overridden_by_name &&
              (assessment.ai_original_tier !== matchTier ||
                assessment.ai_original_score !== matchScore) && (
                <span className="text-xs text-ink-muted">
                  (AI originally scored {MATCH_TIER_META[assessment.ai_original_tier].shortLabel}
                  {assessment.ai_original_score != null ? ` ${assessment.ai_original_score}%` : ''})
                </span>
              )}
          </div>

          {assessment?.summary && <p className="text-sm text-ink">{assessment.summary}</p>}

          {assessment && assessment.status === 'scored' && (
            <div className="grid grid-cols-1 gap-2.5 rounded-control border border-border bg-surface-sunken/30 p-3.5 sm:grid-cols-2">
              <PillarBar
                label="Core Skills & Requirements"
                max={assessment.pillars.core_skills.max}
                note={assessment.pillars.core_skills.note}
                score={assessment.pillars.core_skills.score}
              />
              <PillarBar
                label="Transferable & Industry Context"
                max={assessment.pillars.transferable_and_industry.max}
                note={assessment.pillars.transferable_and_industry.note}
                score={assessment.pillars.transferable_and_industry.score}
              />
              <PillarBar
                label="Experience & Trajectory"
                max={assessment.pillars.experience_and_trajectory.max}
                note={assessment.pillars.experience_and_trajectory.note}
                score={assessment.pillars.experience_and_trajectory.score}
              />
              <PillarBar
                label="Cover Note & Practicals"
                max={assessment.pillars.practical_and_cover_note.max}
                note={assessment.pillars.practical_and_cover_note.note}
                score={assessment.pillars.practical_and_cover_note.score}
              />
            </div>
          )}

          {assessment && assessment.strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-success">Strengths &amp; Evidence</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink">
                {assessment.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {assessment && assessment.transferable_skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-primary">
                Why They Translate (Adjacent / Human Factor)
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink">
                {assessment.transferable_skills.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {assessment && assessment.gaps_or_risks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-warning">Gaps / Risks to Verify</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink">
                {assessment.gaps_or_risks.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PillarBar({
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
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{label}</span>
        <span className="font-semibold tabular-nums text-ink-secondary">
          {score} / {max}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="text-[11px] text-ink-secondary">{note}</p>}
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
    <div className="border-b border-border p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Interview Prep &amp; Questions to Probe
          </h3>
          <p className="text-xs text-ink-muted">
            Tailored questions based on missing details, adjacent transitions, or claims to verify.
          </p>
        </div>
        {!adding && (
          <Button onClick={startAdd} size="sm" variant="ghost">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add question
          </Button>
        )}
      </div>

      {questions.length === 0 && !adding ? (
        <p className="text-xs text-ink-muted">
          No interview prep questions yet. Run AI evaluation or add your own questions for the call.
        </p>
      ) : (
        <div className="space-y-2.5">
          {questions.map((q, idx) =>
            editingId === q.id ? (
              <div
                className="space-y-2 rounded-control border border-border bg-surface-sunken/40 p-3"
                key={q.id}
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    className="bg-surface text-xs"
                    onChange={(e) => setTopicDraft(e.target.value)}
                    placeholder="Topic (e.g. URA EFRIS depth)"
                    value={topicDraft}
                  />
                  <Input
                    className="bg-surface text-xs"
                    onChange={(e) => setWhyDraft(e.target.value)}
                    placeholder="Why ask (what was unclear on CV)"
                    value={whyDraft}
                  />
                </div>
                <Textarea
                  className="min-h-0 bg-surface text-xs"
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
                className="rounded-control border border-border bg-surface-sunken/30 p-3 text-xs"
                key={q.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">Q{idx + 1}.</span>
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary">
                      {q.topic}
                    </span>
                    <span className="text-[10px] text-ink-muted">
                      {q.source === 'human' ? '· Added by recruiter' : '· AI suggested'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={`Edit question ${idx + 1}`}
                      className="rounded p-1 text-ink-muted hover:bg-surface hover:text-ink"
                      onClick={() => startEditQuestion(q)}
                      type="button"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label={`Delete question ${idx + 1}`}
                      className="rounded p-1 text-ink-muted hover:bg-surface hover:text-danger"
                      onClick={() => void handleDelete(q.id)}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-sm font-medium text-ink">{q.question}</p>
                {q.why_ask && <p className="mt-1 text-xs text-ink-secondary">Why probe: {q.why_ask}</p>}
              </div>
            ),
          )}
        </div>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-control border border-border bg-surface-sunken/40 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              className="bg-surface text-xs"
              onChange={(e) => setTopicDraft(e.target.value)}
              placeholder="Topic (e.g. Team management scale)"
              value={topicDraft}
            />
            <Input
              className="bg-surface text-xs"
              onChange={(e) => setWhyDraft(e.target.value)}
              placeholder="Why ask (optional note)"
              value={whyDraft}
            />
          </div>
          <Textarea
            className="min-h-0 bg-surface text-xs"
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
      <Button className="mt-2" onClick={() => setOpen(true)} size="sm" variant="ghost">
        Record feedback
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        className="min-h-0"
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback…"
        rows={2}
        value={feedback}
      />
      <div className="flex gap-2">
        <Select onValueChange={setRating} value={rating}>
          <SelectTrigger className="w-28">
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
          <SelectTrigger className="flex-1">
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

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
}) {
  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-sunken"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}

/**
 * Screening answers arrive as `unknown` (a JSON object keyed by question id), so
 * a multi-select can be an array and a malformed submission anything at all.
 * String() on those would print "[object Object]" in front of a hiring manager.
 */
function formatAnswer(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(formatAnswer).join(', ');
  return JSON.stringify(val);
}

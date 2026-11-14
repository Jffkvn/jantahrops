import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MessageCircle,
  FileText,
  ExternalLink,
  MapPin,
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
import { MatchBadge } from './match-badge';
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
 * Designed for maximum human readability:
 * - Uncluttered stationary header with large, high-contrast typography
 * - Filled JantaHR teal section banners & filled subheading cards
 * - Full-width single-column 4-pillar cards and evidence cards so eyes never wander across columns
 * - 16px (`text-md`) dark-ink body text throughout
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
    <div className="mx-auto max-w-5xl pb-24">
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
  const [rejectReason, setRejectReason] = useState('');
  const [newInterviewAt, setNewInterviewAt] = useState('');
  const [newInterviewMode, setNewInterviewMode] = useState('');

  if (isLoading || !application) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
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
  const meta = stageMeta(application.stage);
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
    toast.success(`Moved to ${stageMeta(stage as ApplicationStage).label}`);
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
    <div className="space-y-8">
      {/* =====================================================================
          STATIONARY (STICKY) HEADER — UNCLUTTERED, LARGE & HIGH-CONTRAST
         ===================================================================== */}
      <div className="sticky top-0 z-20 -mx-2 bg-canvas/95 px-2 pt-1 pb-2.5 backdrop-blur-sm">
        <div className="rounded-card border-2 border-border-strong bg-surface px-6 py-4 shadow-sm">
          {/* Row 1: Back to Vacancy + Candidate Name & Badges + Prev/Next */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-strong pb-3">
            <div className="flex flex-wrap items-center gap-3">
              {isFullPage && (
                <Button
                  className="-ml-2 text-base font-semibold text-ink"
                  onClick={() => void navigate(`/recruitment/${vacancyId}`)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back to {vacancy?.title ?? 'Pipeline'}
                </Button>
              )}

              {isFullPage && <span className="hidden text-border-strong sm:inline">|</span>}

              <h1 className="font-display text-xl font-bold text-ink">
                {contact?.full_name ?? 'Unnamed candidate'}
              </h1>
              <StatusChip variant={meta.tone}>{meta.label}</StatusChip>
              {application.match_tier && (
                <MatchBadge score={application.match_score} tier={application.match_tier} />
              )}

              {/* Interactive Star Rating */}
              {candidate && (
                <span className="inline-flex items-center gap-0.5 pl-1">
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
                          'h-4 w-4 transition-colors',
                          candidate.rating != null && candidate.rating >= n
                            ? 'fill-current text-warning'
                            : 'text-ink-muted',
                        )}
                      />
                    </button>
                  ))}
                </span>
              )}
            </div>

            {isFullPage && (
              <div className="flex flex-wrap items-center gap-2">
                {ordered.length >= 2 && (
                  <Button
                    onClick={scrollToCompare}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Scale className="mr-1.5 h-4 w-4 text-primary" />
                    Compare candidates
                  </Button>
                )}

                {ordered.length > 1 && currentIndex >= 0 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      disabled={!prevApp}
                      onClick={() =>
                        prevApp &&
                        void navigate(`/recruitment/${vacancyId}/applications/${prevApp.id}`)
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Prev
                    </Button>
                    <span className="px-2 text-base font-bold tabular-nums text-ink">
                      {currentIndex + 1} / {ordered.length}
                    </span>
                    <Button
                      disabled={!nextApp}
                      onClick={() =>
                        nextApp &&
                        void navigate(`/recruitment/${vacancyId}/applications/${nextApp.id}`)
                      }
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Row 2: Headline, Metadata, Contact/CV Buttons & Stage Selector */}
          <div className="mt-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-ink">
                {candidate?.headline && (
                  <span className="font-semibold text-ink">{candidate.headline}</span>
                )}
                {parsedNotes.location && (
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <MapPin className="h-4 w-4 text-primary" />
                    {parsedNotes.location}
                  </span>
                )}
                {candidate?.years_experience != null && (
                  <span className="font-semibold text-ink">
                    · {candidate.years_experience} yrs exp
                  </span>
                )}
                <span className="font-medium text-ink-secondary">
                  · Applied {formatRelative(application.applied_at)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                    className="inline-flex items-center gap-1.5 rounded-control border border-border-strong bg-surface-sunken/70 px-3.5 py-1.5 text-base font-semibold text-ink transition-colors hover:bg-primary-soft hover:text-primary"
                    onClick={() => void downloadCv()}
                    type="button"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    CV Document
                  </button>
                )}
                {parsedNotes.coverLetterPath && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-control border border-border-strong bg-surface-sunken/70 px-3.5 py-1.5 text-base font-semibold text-ink transition-colors hover:bg-primary-soft hover:text-primary"
                    onClick={() => void openCoverLetter()}
                    type="button"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    Cover Letter PDF
                  </button>
                )}
                {parsedNotes.linkedInUrl && (
                  <QuickAction
                    href={parsedNotes.linkedInUrl}
                    icon={ExternalLink}
                    label="LinkedIn"
                  />
                )}
              </div>
            </div>

            {/* Stage Selector + Reject Reason */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold uppercase tracking-wide text-ink">
                Stage:
              </span>
              <Select onValueChange={(v) => void onMove(v)} value={application.stage}>
                <SelectTrigger className="h-9 w-40 border-border-strong bg-surface text-base font-semibold text-ink">
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
              <Input
                className="h-9 w-56 border-border-strong bg-surface text-base text-ink"
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason (if rejecting)"
                value={rejectReason}
              />
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          TOP BANNER: EXECUTIVE AI VERDICT SUMMARY
         ===================================================================== */}
      <VerdictBanner
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

      {/* =====================================================================
          SECTION 1: APPLICATION, SCREENING ANSWERS & CV HIGHLIGHTS (FIRST!)
         ===================================================================== */}
      <section className="scroll-mt-48 space-y-5" id="section-screening-cv">
        <SectionHeading
          number="1"
          subtitle="What the candidate submitted: knockout screening answers, uploaded documents, and extracted CV profile."
          title="Application, Screening Answers & CV Highlights"
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 cols: Screening Question Responses + Cover Letter */}
          <div className="space-y-6 lg:col-span-7">
            {/* Subcard: Screening Question Responses */}
            <div className="overflow-hidden rounded-card border border-border-strong bg-surface shadow-2xs">
              <div className="flex items-center justify-between border-b border-border-strong bg-primary-soft px-6 py-3.5">
                <h3 className="font-display text-md font-bold text-ink">
                  Screening Question Responses
                </h3>
                <span className="rounded-pill bg-primary px-3 py-0.5 text-xs font-bold text-primary-ink">
                  {screeningEntries.length} answered
                </span>
              </div>

              <div className="p-6">
                {screeningEntries.length === 0 ? (
                  <p className="text-md font-medium text-ink-secondary">
                    No screening questions were answered on this application.
                  </p>
                ) : (
                  <div className="space-y-3.5">
                    {screeningEntries.map(([key, val]) => {
                      const matchedQ = (vacancy?.screening_questions ?? []).find(
                        (q) => q.id === key,
                      );
                      const prompt = matchedQ ? matchedQ.question : key;
                      const answerText = formatAnswer(val);

                      return (
                        <div
                          className="rounded-control border border-border-strong bg-surface-sunken/50 p-4"
                          key={key}
                        >
                          <p className="text-base font-semibold text-ink-secondary">{prompt}</p>
                          <p className="mt-1.5 text-md font-bold text-ink">{answerText}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Subcard: Cover Letter & Submitted Documents */}
            <div className="overflow-hidden rounded-card border border-border-strong bg-surface shadow-2xs">
              <div className="border-b border-border-strong bg-primary-soft px-6 py-3.5">
                <h3 className="font-display text-md font-bold text-ink">
                  Cover Letter &amp; Submitted Documents
                </h3>
              </div>

              <div className="p-6">
                <div className="flex flex-wrap gap-3.5">
                  {candidate && (
                    <div className="flex flex-1 items-center justify-between gap-3 rounded-control border border-border-strong bg-surface-sunken/50 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-md font-bold text-ink">Candidate CV</p>
                          <p className="text-sm font-medium text-ink-secondary">
                            Uploaded resume document
                          </p>
                        </div>
                      </div>
                      <Button onClick={() => void downloadCv()} size="sm" variant="primary">
                        Open CV
                      </Button>
                    </div>
                  )}

                  {parsedNotes.coverLetterPath && (
                    <div className="flex flex-1 items-center justify-between gap-3 rounded-control border border-border-strong bg-surface-sunken/50 p-4">
                      <div className="flex min-w-0 items-center gap-3">
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
                </div>

                {parsedNotes.cleanCoverNote ? (
                  <div className="mt-4 rounded-control border border-border-strong bg-surface-sunken/40 p-4">
                    <p className="mb-1.5 text-sm font-bold uppercase tracking-wide text-ink">
                      Written Cover Note
                    </p>
                    <p className="whitespace-pre-line text-md leading-relaxed text-ink">
                      {parsedNotes.cleanCoverNote}
                    </p>
                  </div>
                ) : !parsedNotes.coverLetterPath ? (
                  <p className="mt-4 text-md font-medium text-ink-secondary">
                    No written cover note provided.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right 5 cols: Extracted CV Profile & Candidate Skills */}
          <div className="space-y-6 lg:col-span-5">
            <div className="overflow-hidden rounded-card border border-border-strong bg-surface shadow-2xs">
              <div className="flex items-center gap-2 border-b border-border-strong bg-primary-soft px-6 py-3.5">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-display text-md font-bold text-ink">
                  CV Highlights &amp; Practical Facts
                </h3>
              </div>

              <div className="space-y-5 p-6">
                {/* Practical Facts Grid */}
                <div className="grid grid-cols-2 gap-4 rounded-control border border-border-strong bg-surface-sunken/50 p-4">
                  <div>
                    <span className="text-sm font-semibold text-ink-secondary">Experience</span>
                    <p className="mt-0.5 text-md font-bold text-ink">
                      {candidate?.years_experience != null
                        ? `${candidate.years_experience} years`
                        : 'Not stated'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-ink-secondary">Location</span>
                    <p className="mt-0.5 text-md font-bold text-ink">
                      {parsedNotes.location ?? 'Not stated'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-ink-secondary">
                      Salary Expectation
                    </span>
                    <p className="mt-0.5 text-md font-bold text-ink">
                      {candidate?.salary_expectation_ugx != null &&
                      candidate.salary_expectation_ugx > 0
                        ? formatUGX(BigInt(candidate.salary_expectation_ugx))
                        : 'Not stated'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-ink-secondary">Availability</span>
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

                {parsedCv && parsedCv.industries.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink">
                      Industries Worked In
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {parsedCv.industries.map((ind) => (
                        <span
                          className="rounded-pill border border-border-strong bg-surface-sunken px-3.5 py-1 text-base font-semibold text-ink"
                          key={ind}
                        >
                          {ind}
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
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: DEEP AI MATCH BREAKDOWN & TRANSFERABLE EVIDENCE
         ===================================================================== */}
      <section className="scroll-mt-48 space-y-5" id="section-ai-match">
        <SectionHeading
          number="2"
          subtitle="Full-width 4-pillar scoring breakdown and direct evidence for strengths, transferable skills, and interview gaps."
          title="AI Match Breakdown & Transferable Evidence"
        />

        <MatchBreakdownSection
          assessment={assessment}
          isEvaluating={evaluateApp.isPending}
          onEvaluate={() => void handleRunEvaluation(false)}
        />
      </section>

      {/* =====================================================================
          SECTION 3: INTERVIEW PREP & SCHEDULING
         ===================================================================== */}
      <section className="scroll-mt-48 space-y-5" id="section-interview-prep">
        <SectionHeading
          number="3"
          subtitle="Tailored questions to probe missing details or verify claims during the interview, plus interview scheduling."
          title="Interview Prep & Scheduling"
        />

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
            <div className="overflow-hidden rounded-card border border-border-strong bg-surface shadow-2xs">
              <div className="border-b border-border-strong bg-primary-soft px-6 py-3.5">
                <h3 className="font-display text-md font-bold text-ink">
                  Scheduled Interviews &amp; Feedback
                </h3>
              </div>

              <div className="p-6">
                <div className="space-y-3.5">
                  {(interviews ?? []).map((interview) => (
                    <div
                      className="rounded-control border border-border-strong bg-surface-sunken/50 p-4"
                      key={interview.id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-md font-bold text-ink">
                          <Calendar className="h-4 w-4 text-primary" />
                          {interview.scheduled_at
                            ? formatDateTime(interview.scheduled_at)
                            : 'No time set'}
                        </span>
                        <span className="rounded-pill border border-border-strong bg-surface px-3 py-0.5 text-sm font-semibold text-ink">
                          {interview.mode ?? 'In person'}
                        </span>
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
                  <h4 className="mb-3 text-base font-bold uppercase tracking-wide text-ink">
                    Schedule a New Interview
                  </h4>
                  <div className="grid grid-cols-1 gap-3.5">
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
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: TEAM NOTES & ACTIVITY LOG
         ===================================================================== */}
      <section className="scroll-mt-48 space-y-5" id="section-notes">
        <SectionHeading
          number="4"
          subtitle="Internal team comments and stage movement history for this applicant."
          title="Team Notes & Activity Log"
        />

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

          <ol className="space-y-3.5">
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
          SECTION 5: SIDE-BY-SIDE CANDIDATE COMPARISON (2–3 APPLICANTS)
         ===================================================================== */}
      {ordered.length >= 2 && (
        <section className="scroll-mt-48 space-y-5" id="section-compare">
          <SectionHeading
            number="5"
            subtitle="Pick 1 or 2 other applicants from this vacancy to compare side-by-side against this candidate."
            title="Compare Candidates Side-by-Side"
          />

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

/**
 * Solid Filled JantaHR Petrol-Teal Section Header Banner (`bg-primary text-primary-ink`)
 * so every major section on the page has unmistakable visual separation and contrast.
 */
function SectionHeading({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card bg-primary px-6 py-4 text-primary-ink shadow-xs">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-highlight font-display text-md font-bold text-highlight-ink">
        {number}
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold text-primary-ink">{title}</h2>
        <p className="mt-0.5 text-base font-medium text-primary-ink/90">{subtitle}</p>
      </div>
    </div>
  );
}

const TIER_BANNER_STYLES: Record<
  ApplicationMatchTier,
  { wrapper: string; headerBar: string; scoreBox: string }
> = {
  strong: {
    wrapper: 'border-2 border-success bg-surface',
    headerBar: 'bg-success-soft border-b border-success/40 text-success-ink',
    scoreBox: 'bg-success text-primary-ink',
  },
  adjacent: {
    wrapper: 'border-2 border-info bg-surface',
    headerBar: 'bg-info-soft border-b border-info/40 text-info-ink',
    scoreBox: 'bg-info text-primary-ink',
  },
  partial: {
    wrapper: 'border-2 border-warning bg-surface',
    headerBar: 'bg-warning-soft border-b border-warning/40 text-warning-ink',
    scoreBox: 'bg-warning text-primary-ink',
  },
  low: {
    wrapper: 'border-2 border-danger bg-surface',
    headerBar: 'bg-danger-soft border-b border-danger/40 text-danger-ink',
    scoreBox: 'bg-danger text-primary-ink',
  },
  unscored: {
    wrapper: 'border-2 border-border-strong bg-surface',
    headerBar: 'bg-surface-sunken border-b border-border-strong text-ink',
    scoreBox: 'bg-surface-sunken text-ink',
  },
};

function VerdictBanner({
  assessment,
  matchTier,
  matchScore,
  isEvaluating,
  isSavingOverride,
  onEvaluate,
  onSaveOverride,
}: {
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

  const bannerStyle = matchTier ? TIER_BANNER_STYLES[matchTier] : TIER_BANNER_STYLES.unscored;

  return (
    <div className={cn('overflow-hidden rounded-card shadow-xs', bannerStyle.wrapper)}>
      {/* Filled Top Header Band */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 px-6 py-3.5',
          bannerStyle.headerBar,
        )}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <Sparkles className="h-5 w-5" />
          <span className="font-display text-md font-bold">Executive AI Role Match Verdict</span>
          {matchTier && <MatchBadge score={matchScore} tier={matchTier} />}
          {assessment?.overridden_by_name && (
            <span className="rounded-pill bg-surface px-2.5 py-0.5 text-xs font-bold text-primary">
              Adjusted by {assessment.overridden_by_name}
            </span>
          )}
          {assessment?.ai_original_tier &&
            assessment.overridden_by_name &&
            (assessment.ai_original_tier !== matchTier ||
              assessment.ai_original_score !== matchScore) && (
              <span className="text-sm font-medium">
                (AI originally scored {MATCH_TIER_META[assessment.ai_original_tier].shortLabel}
                {assessment.ai_original_score != null ? ` ${assessment.ai_original_score}%` : ''})
              </span>
            )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!editing && (
            <Button onClick={startEdit} size="sm" variant="secondary">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              {assessment ? 'Edit / Override' : 'Set manual match'}
            </Button>
          )}
          <Button
            disabled={isEvaluating}
            onClick={() => void onEvaluate(false)}
            size="sm"
            variant="primary"
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isEvaluating && 'animate-spin')} />
            {isEvaluating ? 'Evaluating…' : assessment ? 'Re-evaluate' : 'Evaluate with AI'}
          </Button>
        </div>
      </div>

      {/* Verdict Summary Body */}
      <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
        {matchTier && (
          <div
            className={cn(
              'flex h-20 w-24 shrink-0 flex-col items-center justify-center rounded-card font-display shadow-xs',
              bannerStyle.scoreBox,
            )}
          >
            {matchTier !== 'unscored' && matchScore != null ? (
              <>
                <span className="text-xl font-bold leading-none tabular-nums">
                  {Math.round(matchScore)}%
                </span>
                <span className="mt-1.5 text-xs font-bold uppercase tracking-wider">
                  {MATCH_TIER_META[matchTier].shortLabel}
                </span>
              </>
            ) : (
              <span className="px-1 text-center text-sm font-bold">Manual Read</span>
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {assessment?.summary ? (
            <p className="text-md font-medium leading-relaxed text-ink">{assessment.summary}</p>
          ) : (
            <p className="text-md font-medium text-ink-secondary">
              Not evaluated yet. Click <strong>Evaluate with AI</strong> to score this candidate’s
              CV, cover letter, and screening answers against the job description.
            </p>
          )}
        </div>
      </div>

      {editing && (
        <div className="border-t border-border-strong bg-surface-sunken/40 p-6 space-y-4">
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
              <Label className="text-sm font-semibold text-ink">Gaps or Risks (one per line)</Label>
              <Textarea
                className="mt-1 min-h-0 bg-surface text-base"
                onChange={(e) => setGapsDraft(e.target.value)}
                rows={3}
                value={gapsDraft}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
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
      <div className="rounded-card border border-border-strong bg-surface p-10 text-center">
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
    <div className="space-y-6">
      {/* 4-Pillar Score Cards — Stacked Full-Width (One Per Row) so eyes never wander */}
      {assessment.status === 'scored' && (
        <div className="space-y-4">
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

      {/* Full-Width Stacked Evidence Cards with Filled Colored Header Bands */}
      <div className="space-y-5">
        {/* 1. Strengths & Direct Evidence */}
        <div className="overflow-hidden rounded-card border-2 border-success/50 bg-surface shadow-2xs">
          <div className="flex items-center gap-3 border-b border-success/30 bg-success-soft px-6 py-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-success text-primary-ink">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <h4 className="font-display text-lg font-bold text-success-ink">
              Strengths &amp; Direct Evidence
            </h4>
          </div>
          <div className="p-6">
            {assessment.strengths.length > 0 ? (
              <ul className="space-y-3 text-md leading-relaxed text-ink">
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
          <div className="flex items-center gap-3 border-b border-info/30 bg-info-soft px-6 py-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-info text-primary-ink">
              <Compass className="h-5 w-5" />
            </span>
            <h4 className="font-display text-lg font-bold text-info-ink">
              Why They Translate (Human Factor &amp; Adjacent Fit)
            </h4>
          </div>
          <div className="p-6">
            {assessment.transferable_skills.length > 0 ? (
              <ul className="space-y-3 text-md leading-relaxed text-ink">
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
          <div className="flex items-center gap-3 border-b border-danger/30 bg-danger-soft px-6 py-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger text-primary-ink">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h4 className="font-display text-lg font-bold text-danger-ink">
              Gaps / Risks to Verify in Interview
            </h4>
          </div>
          <div className="p-6">
            {assessment.gaps_or_risks.length > 0 ? (
              <ul className="space-y-3 text-md leading-relaxed text-ink">
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
      <div className={cn('flex items-center justify-between gap-3 px-6 py-3.5', headerBandStyle)}>
        <h4 className="font-display text-md font-bold">{label}</h4>
        <span
          className={cn(
            'rounded-pill px-3.5 py-1 text-base font-bold tabular-nums shadow-2xs',
            badgeStyle,
          )}
        >
          {score} / {max} ({pct}%)
        </span>
      </div>

      <div className="p-6">
        <div className="h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
        {note && <p className="mt-3.5 text-md font-medium leading-relaxed text-ink">{note}</p>}
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
    <div className="overflow-hidden rounded-card border border-border-strong bg-surface shadow-2xs">
      <div className="flex items-center justify-between gap-2 border-b border-border-strong bg-primary-soft px-6 py-3.5">
        <div>
          <h3 className="font-display text-md font-bold text-ink">
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

      <div className="p-6">
        {questions.length === 0 && !adding ? (
          <p className="text-md font-medium text-ink-secondary">
            No interview prep questions yet. Run AI evaluation or add your own questions for the
            call.
          </p>
        ) : (
          <div className="space-y-4">
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
                  className="rounded-control border border-border-strong bg-surface-sunken/40 p-5"
                  key={q.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-ink">
                        {idx + 1}
                      </span>
                      <span className="rounded-pill border border-border-strong bg-surface px-3.5 py-0.5 text-base font-bold text-ink">
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
                  <p className="mt-3 text-md font-bold leading-snug text-ink">{q.question}</p>
                  {q.why_ask && (
                    <p className="mt-2 text-base leading-relaxed text-ink">
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
      className="inline-flex items-center gap-1.5 rounded-control border border-border-strong bg-surface-sunken/70 px-3.5 py-1.5 text-base font-semibold text-ink transition-colors hover:bg-primary-soft hover:text-primary"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </a>
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

import { useState } from 'react';
import { Phone, Mail, MessageCircle, FileText, Send, Star, Calendar } from 'lucide-react';
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
import type { ApplicationStage } from '@/types/database';
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
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg" side="right">
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
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [newInterviewAt, setNewInterviewAt] = useState('');
  const [newInterviewMode, setNewInterviewMode] = useState('');

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
      await moveStage.mutateAsync({ id: applicationId, stage: 'rejected', ...(reason ? { reason } : {}) });
    } else {
      await moveStage.mutateAsync({ id: applicationId, stage: stage as ApplicationStage });
    }
    setRejectReason('');
  };

  return (
    <div>
      {/* Header */}
      <div className="border-b border-border bg-surface p-6">
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
          <StatusChip variant={meta.tone}>{meta.label}</StatusChip>
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

      {/* Candidate facts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-6 text-sm">
        {candidate?.rating != null && candidate.rating > 0 && (
          <Fact label="Rating">
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

      {/* Screening Responses */}
      {application.screening_answers && Object.keys(application.screening_answers).length > 0 && (
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
                <div key={key} className="rounded-control border border-border bg-surface-sunken/40 p-3 text-xs">
                  <p className="font-medium text-ink-secondary">{prompt}</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{answerText}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stage control */}
      <div className="border-b border-border p-6">
        <label className="mb-1.5 block text-xs font-semibold text-ink-secondary">Move stage</label>
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

      {/* Interviews */}
      <div className="border-b border-border p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Interviews
          </h3>
        </div>

        <div className="space-y-2">
          {(interviews ?? []).map((interview) => (
            <div className="rounded-control border border-border p-3" key={interview.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <Calendar className="h-3.5 w-3.5 text-ink-muted" />
                  {interview.scheduled_at ? formatDateTime(interview.scheduled_at) : 'No time set'}
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
                <FeedbackForm interviewId={interview.id} onRecord={recordFeedback.mutateAsync} />
              )}
            </div>
          ))}
          {(interviews ?? []).length === 0 && (
            <p className="text-sm text-ink-muted">No interviews yet.</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                <p className="text-sm text-ink">{a.body}</p>
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
  );
}

function FeedbackForm({
  interviewId,
  onRecord,
}: {
  interviewId: string;
  onRecord: (input: { interviewId: string; feedback?: string | null; rating?: number | null; outcome?: string | null }) => Promise<unknown>;
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

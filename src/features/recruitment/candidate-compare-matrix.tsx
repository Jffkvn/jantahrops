import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Scale,
  Trophy,
  FileText,
  Phone,
  MessageCircle,
  ExternalLink,
  MapPin,
  CheckCircle2,
  Compass,
  AlertTriangle,
  Plus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { formatUGX } from '@/lib/format';
import {
  candidateStorageSignedUrl,
  cvSignedUrl,
  type ApplicationWithRelations,
} from './recruitment-api';
import { AVAILABILITY_LABELS, PIPELINE_STAGES, stageMeta } from './recruitment-meta';
import { MatchBadge } from './match-badge';
import {
  MATCH_TIER_META,
  parseAiAssessment,
  parseApplicationNotes,
  parseCvData,
  sortApplicationsByMatch,
} from './ai-matching-schema';
import { useMoveStage } from './use-recruitment';
import type { ApplicationStage, VacancyRow } from '@/types/database';

interface CandidateCompareMatrixProps {
  vacancyId: string;
  vacancy?: VacancyRow | null | undefined;
  applications: ApplicationWithRelations[];
  /** When rendered inside a specific candidate's review page, lock Slot 1 to that application. */
  primaryApplicationId?: string | undefined;
}

/**
 * Side-by-side comparison matrix for 2 or 3 candidates on the same vacancy.
 * Does NOT auto-pick comparison candidates — HR explicitly selects who to compare.
 */
export function CandidateCompareMatrix({
  vacancyId,
  vacancy,
  applications,
  primaryApplicationId,
}: CandidateCompareMatrixProps) {
  const navigate = useNavigate();
  const moveStage = useMoveStage(vacancyId);

  const sortedApps = useMemo(
    () => sortApplicationsByMatch(applications, 'match'),
    [applications],
  );

  // Slot 1 is locked when viewing a specific candidate; otherwise HR chooses Slot 1 & Slot 2.
  const [slot1Id, setSlot1Id] = useState<string>(primaryApplicationId ?? '');
  const [slot2Id, setSlot2Id] = useState<string>('');
  const [slot3Id, setSlot3Id] = useState<string>('');
  const [showThirdSlot, setShowThirdSlot] = useState<boolean>(false);

  const effectiveSlot1Id = primaryApplicationId ?? slot1Id;
  const effectiveSlot2Id = slot2Id && slot2Id !== effectiveSlot1Id ? slot2Id : '';
  const effectiveSlot3Id =
    showThirdSlot &&
    slot3Id &&
    slot3Id !== effectiveSlot1Id &&
    slot3Id !== effectiveSlot2Id
      ? slot3Id
      : '';

  const selectedApps = useMemo(() => {
    const ids = [
      effectiveSlot1Id,
      effectiveSlot2Id,
      ...(showThirdSlot && effectiveSlot3Id ? [effectiveSlot3Id] : []),
    ].filter(Boolean);
    return ids
      .map((id) => sortedApps.find((a) => a.id === id))
      .filter((a): a is ApplicationWithRelations => Boolean(a));
  }, [effectiveSlot1Id, effectiveSlot2Id, effectiveSlot3Id, showThirdSlot, sortedApps]);

  // Collect all unique screening question keys across vacancy + selected applications
  const screeningQuestions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of vacancy?.screening_questions ?? []) {
      map.set(q.id, q.question);
    }
    for (const app of selectedApps) {
      for (const key of Object.keys(app.screening_answers ?? {})) {
        if (!map.has(key)) {
          map.set(key, key);
        }
      }
    }
    return Array.from(map.entries()).map(([id, question]) => ({ id, question }));
  }, [vacancy?.screening_questions, selectedApps]);

  // Compute leader scores so we can highlight the winner in overall match & each pillar
  const maxOverallScore = useMemo(() => {
    const scores = selectedApps
      .map((a) => (a.match_tier !== 'unscored' && a.match_score != null ? a.match_score : -1))
      .filter((s) => s >= 0);
    return scores.length > 0 ? Math.max(...scores) : -1;
  }, [selectedApps]);

  const maxPillarScores = useMemo(() => {
    const getMax = (
      getter: (p: NonNullable<ReturnType<typeof parseAiAssessment>>['pillars']) => number,
    ) => {
      const vals = selectedApps
        .map((a) => {
          const parsed = parseAiAssessment(a.ai_assessment);
          return parsed && parsed.status === 'scored' ? getter(parsed.pillars) : -1;
        })
        .filter((v) => v >= 0);
      return vals.length > 0 ? Math.max(...vals) : -1;
    };
    return {
      core: getMax((p) => p.core_skills.score),
      transferable: getMax((p) => p.transferable_and_industry.score),
      experience: getMax((p) => p.experience_and_trajectory.score),
      practical: getMax((p) => p.practical_and_cover_note.score),
    };
  }, [selectedApps]);

  if (sortedApps.length < 2) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 text-center">
        <Scale className="mx-auto h-7 w-7 text-ink-muted" />
        <h3 className="mt-2 font-display text-base font-semibold text-ink">
          Need at Least 2 Applicants to Compare
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
          This vacancy currently has {sortedApps.length} applicant
          {sortedApps.length === 1 ? '' : 's'}. Once 2 or more candidates are in the pipeline, you
          can compare them side-by-side here.
        </p>
      </div>
    );
  }

  const handleStageChange = async (appId: string, stage: string) => {
    if (stage === 'rejected') {
      toast.info('Open the candidate review page to enter a rejection reason.');
      return;
    }
    await moveStage.mutateAsync({ id: appId, stage: stage as ApplicationStage });
    toast.success(`Moved to ${stageMeta(stage as ApplicationStage).label}`);
  };

  const isReadyToCompare = Boolean(effectiveSlot1Id && effectiveSlot2Id && selectedApps.length >= 2);
  const colGridClass =
    selectedApps.length === 3
      ? 'grid-cols-1 lg:grid-cols-3'
      : 'grid-cols-1 lg:grid-cols-2';

  const primaryCandidateApp = sortedApps.find((a) => a.id === effectiveSlot1Id);

  return (
    <div className="space-y-5 rounded-card border border-border bg-surface p-6">
      {/* Candidate Slot Selectors Row */}
      <div className="flex flex-col gap-4">
        <div
          className={cn(
            'grid gap-4',
            showThirdSlot ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2',
          )}
        >
          {/* Slot 1 */}
          <div className="rounded-control border border-border bg-surface-sunken/40 p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-secondary">
              <span>Candidate 1 {primaryApplicationId ? '(Current Applicant)' : ''}</span>
            </div>
            {primaryApplicationId ? (
              <div className="rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm font-semibold text-ink">
                {formatCandidateOptionLabel(primaryCandidateApp)}
              </div>
            ) : (
              <Select onValueChange={setSlot1Id} value={effectiveSlot1Id}>
                <SelectTrigger className="w-full bg-surface text-sm">
                  <SelectValue placeholder="Select first candidate to compare…" />
                </SelectTrigger>
                <SelectContent>
                  {sortedApps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {formatCandidateOptionLabel(app)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Slot 2 */}
          <div className="rounded-control border border-border bg-surface-sunken/40 p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-secondary">
              <span>Candidate 2 (Choose who to compare with)</span>
              {effectiveSlot2Id && (
                <button
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-danger"
                  onClick={() => {
                    setSlot2Id('');
                    setSlot3Id('');
                    setShowThirdSlot(false);
                  }}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
            <Select onValueChange={setSlot2Id} value={effectiveSlot2Id}>
              <SelectTrigger className="w-full bg-surface text-sm">
                <SelectValue placeholder="Select a candidate from this vacancy…" />
              </SelectTrigger>
              <SelectContent>
                {sortedApps
                  .filter((a) => a.id !== effectiveSlot1Id)
                  .map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {formatCandidateOptionLabel(app)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Slot 3 (Optional) */}
          {showThirdSlot && sortedApps.length >= 3 && (
            <div className="rounded-control border border-border bg-surface-sunken/40 p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-secondary">
                <span>Candidate 3</span>
                <button
                  aria-label="Remove 3rd candidate"
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-danger"
                  onClick={() => {
                    setSlot3Id('');
                    setShowThirdSlot(false);
                  }}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
              <Select onValueChange={setSlot3Id} value={effectiveSlot3Id}>
                <SelectTrigger className="w-full bg-surface text-sm">
                  <SelectValue placeholder="Select a 3rd candidate…" />
                </SelectTrigger>
                <SelectContent>
                  {sortedApps
                    .filter((a) => a.id !== effectiveSlot1Id && a.id !== effectiveSlot2Id)
                    .map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {formatCandidateOptionLabel(app)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Add 3rd candidate button once Candidate 2 is chosen */}
        {isReadyToCompare && !showThirdSlot && sortedApps.length >= 3 && (
          <div className="flex justify-end">
            <Button
              onClick={() => setShowThirdSlot(true)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add 3rd candidate to compare
            </Button>
          </div>
        )}
      </div>

      {/* Empty prompt until HR selects Candidate 2 */}
      {!isReadyToCompare ? (
        <div className="rounded-control border border-dashed border-border-strong bg-surface-sunken/30 px-6 py-8 text-center">
          <Scale className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-2 text-sm font-medium text-ink">
            Pick a candidate in the <strong>Candidate 2</strong> dropdown above to compare them
            side-by-side.
          </p>
          <p className="mt-1 text-xs text-ink-secondary">
            You’ll see their match scores, 4-pillar bars, screening answers, strengths, and gaps
            aligned next to each other.
          </p>
        </div>
      ) : (
        /* Main Comparison Columns */
        <div className={cn('grid gap-5', colGridClass)}>
          {selectedApps.map((app) => {
            const contact = app.candidateContact;
            const candidate = app.candidate;
            const assessment = parseAiAssessment(app.ai_assessment);
            const parsedNotes = parseApplicationNotes(app.notes);
            const parsedCv = parseCvData(candidate?.cv_parsed);
            const isOverallLeader =
              maxOverallScore > 0 &&
              app.match_tier !== 'unscored' &&
              app.match_score === maxOverallScore;

            const tierAccent =
              app.match_tier === 'strong'
                ? 'border-t-4 border-t-success'
                : app.match_tier === 'adjacent'
                  ? 'border-t-4 border-t-info'
                  : app.match_tier === 'partial'
                    ? 'border-t-4 border-t-warning'
                    : app.match_tier === 'low'
                      ? 'border-t-4 border-t-danger'
                      : 'border-t-4 border-t-border-strong';

            return (
              <div
                className={cn(
                  'flex flex-col space-y-5 rounded-card border border-border bg-surface p-5',
                  tierAccent,
                )}
                key={app.id}
              >
                {/* 1. Candidate Profile & Stage Action */}
                <div className="border-b border-border pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        className="text-left font-display text-xl font-semibold text-ink hover:text-primary hover:underline"
                        onClick={() =>
                          void navigate(`/recruitment/${vacancyId}/applications/${app.id}`)
                        }
                        type="button"
                      >
                        {contact?.full_name ?? 'Unnamed candidate'}
                      </button>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-secondary">
                        {candidate?.headline ?? 'No headline'}
                      </p>
                    </div>
                    {isOverallLeader && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-ink">
                        <Trophy className="h-3.5 w-3.5" />
                        Top Match
                      </span>
                    )}
                  </div>

                  {/* Metadata pills */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
                    {parsedNotes.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-ink-muted" />
                        {parsedNotes.location}
                      </span>
                    )}
                    {candidate?.years_experience != null && (
                      <span className="font-semibold text-ink">
                        {candidate.years_experience} yrs exp
                      </span>
                    )}
                    {candidate?.salary_expectation_ugx != null &&
                      candidate.salary_expectation_ugx > 0 && (
                        <span>{formatUGX(BigInt(candidate.salary_expectation_ugx))}</span>
                      )}
                    {candidate?.availability && (
                      <span>
                        {AVAILABILITY_LABELS[candidate.availability] ?? candidate.availability}
                      </span>
                    )}
                  </div>

                  {/* Document & Contact Action Bar */}
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {candidate && (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-sunken/50 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                        onClick={() =>
                          void cvSignedUrl(candidate.id).then((url) => {
                            if (url) window.open(url, '_blank', 'noopener,noreferrer');
                            else toast.error('No CV on file');
                          })
                        }
                        type="button"
                      >
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        CV
                      </button>
                    )}
                    {parsedNotes.coverLetterPath && (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-sunken/50 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                        onClick={() => {
                          if (!parsedNotes.coverLetterPath) return;
                          void candidateStorageSignedUrl(parsedNotes.coverLetterPath).then(
                            (url) => {
                              if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              else toast.error('Could not open cover letter');
                            },
                          );
                        }}
                        type="button"
                      >
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        Cover Letter
                      </button>
                    )}
                    {parsedNotes.linkedInUrl && (
                      <a
                        className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-sunken/50 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                        href={parsedNotes.linkedInUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-primary" />
                        LinkedIn
                      </a>
                    )}
                    {contact?.phone_e164 && (
                      <>
                        <a
                          className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-sunken/50 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                          href={`tel:${contact.phone_e164}`}
                        >
                          <Phone className="h-3.5 w-3.5 text-primary" />
                          Call
                        </a>
                        <a
                          className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-sunken/50 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                          href={`https://wa.me/${contact.phone_e164.replace('+', '')}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-primary" />
                          WhatsApp
                        </a>
                      </>
                    )}
                  </div>

                  {/* Stage Selector right in the column */}
                  <div className="mt-3.5 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                      Stage:
                    </span>
                    <Select
                      onValueChange={(v) => void handleStageChange(app.id, v)}
                      value={app.stage}
                    >
                      <SelectTrigger className="h-9 flex-1 text-sm">
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
                  </div>
                </div>

                {/* 2. AI Verdict & Summary */}
                <div className="rounded-control border border-border bg-surface-sunken/30 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                      AI Verdict
                    </span>
                    {app.match_tier ? (
                      <MatchBadge score={app.match_score} tier={app.match_tier} />
                    ) : (
                      <span className="text-xs text-ink-muted">Not evaluated</span>
                    )}
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink">
                    {assessment?.summary ??
                      (app.match_tier
                        ? MATCH_TIER_META[app.match_tier].label
                        : 'Run AI evaluation on this candidate to see a full comparison.')}
                  </p>
                </div>

                {/* 3. 4-Pillar Score Bars */}
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                    4-Pillar Score Comparison
                  </p>
                  {assessment && assessment.status === 'scored' ? (
                    <>
                      <CompactPillarBar
                        isLeader={
                          maxPillarScores.core > 0 &&
                          assessment.pillars.core_skills.score === maxPillarScores.core
                        }
                        label="Core Skills"
                        max={assessment.pillars.core_skills.max}
                        score={assessment.pillars.core_skills.score}
                      />
                      <CompactPillarBar
                        isLeader={
                          maxPillarScores.transferable > 0 &&
                          assessment.pillars.transferable_and_industry.score ===
                            maxPillarScores.transferable
                        }
                        label="Transferable & Industry"
                        max={assessment.pillars.transferable_and_industry.max}
                        score={assessment.pillars.transferable_and_industry.score}
                      />
                      <CompactPillarBar
                        isLeader={
                          maxPillarScores.experience > 0 &&
                          assessment.pillars.experience_and_trajectory.score ===
                            maxPillarScores.experience
                        }
                        label="Experience & Trajectory"
                        max={assessment.pillars.experience_and_trajectory.max}
                        score={assessment.pillars.experience_and_trajectory.score}
                      />
                      <CompactPillarBar
                        isLeader={
                          maxPillarScores.practical > 0 &&
                          assessment.pillars.practical_and_cover_note.score ===
                            maxPillarScores.practical
                        }
                        label="Cover Note & Practicals"
                        max={assessment.pillars.practical_and_cover_note.max}
                        score={assessment.pillars.practical_and_cover_note.score}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-ink-muted">No pillar scores available.</p>
                  )}
                </div>

                {/* 4. Screening Question Answers (Aligned across columns) */}
                {screeningQuestions.length > 0 && (
                  <div className="space-y-2.5 border-t border-border pt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                      Screening Answers
                    </p>
                    {screeningQuestions.map((q) => {
                      const rawVal = (app.screening_answers ?? {})[q.id];
                      const formatted = formatScreeningValue(rawVal);
                      return (
                        <div
                          className="rounded-control border border-border bg-surface-sunken/25 p-3"
                          key={q.id}
                        >
                          <p className="text-xs font-medium text-ink-secondary">{q.question}</p>
                          <p className="mt-1 text-sm font-semibold text-ink">{formatted}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 5. Top Skills & Qualifications */}
                <div className="space-y-2.5 border-t border-border pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">
                    Skills &amp; Qualifications
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(parsedCv?.qualifications ?? []).map((qual) => (
                      <span
                        className="rounded-pill bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary"
                        key={qual}
                      >
                        {qual}
                      </span>
                    ))}
                    {(candidate?.skills ?? []).slice(0, 8).map((skill) => (
                      <span
                        className="rounded-pill bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-ink"
                        key={skill}
                      >
                        {skill}
                      </span>
                    ))}
                    {(candidate?.skills ?? []).length === 0 &&
                      (parsedCv?.qualifications ?? []).length === 0 && (
                        <span className="text-sm text-ink-muted">No skills listed</span>
                      )}
                  </div>
                </div>

                {/* 6. Key Strengths */}
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-success-ink">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Key Strengths
                  </p>
                  {assessment && assessment.strengths.length > 0 ? (
                    <ul className="space-y-2 text-sm leading-relaxed text-ink">
                      {assessment.strengths.map((s, idx) => (
                        <li className="flex gap-2" key={idx}>
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-muted">—</p>
                  )}
                </div>

                {/* 7. Why They Translate (Adjacent Fit) */}
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-info-ink">
                    <Compass className="h-4 w-4 text-info" />
                    Why They Translate
                  </p>
                  {assessment && assessment.transferable_skills.length > 0 ? (
                    <ul className="space-y-2 text-sm leading-relaxed text-ink">
                      {assessment.transferable_skills.map((s, idx) => (
                        <li className="flex gap-2" key={idx}>
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-muted">—</p>
                  )}
                </div>

                {/* 8. Gaps / Risks */}
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-danger-ink">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                    Gaps / Risks to Verify
                  </p>
                  {assessment && assessment.gaps_or_risks.length > 0 ? (
                    <ul className="space-y-2 text-sm leading-relaxed text-ink">
                      {assessment.gaps_or_risks.map((s, idx) => (
                        <li className="flex gap-2" key={idx}>
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-muted">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompactPillarBar({
  label,
  score,
  max,
  isLeader,
}: {
  label: string;
  score: number;
  max: number;
  isLeader: boolean;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((score / max) * 100))) : 0;
  const barColor = pct >= 70 ? 'bg-success' : pct >= 45 ? 'bg-warning' : 'bg-danger';

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-ink-secondary">
          {isLeader && <Trophy className="h-3.5 w-3.5 text-success" />}
          {score}/{max} ({pct}%)
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatCandidateOptionLabel(app: ApplicationWithRelations | undefined): string {
  if (!app) return 'Select candidate';
  const name = app.candidateContact?.full_name ?? 'Unnamed candidate';
  const scorePart =
    app.match_tier && app.match_tier !== 'unscored' && app.match_score != null
      ? ` — ${Math.round(app.match_score)}% (${MATCH_TIER_META[app.match_tier].shortLabel})`
      : app.match_tier === 'unscored'
        ? ' — Manual Read'
        : ' — Unscored';
  return `${name}${scorePart}`;
}

function formatScreeningValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(formatScreeningValue).join(', ');
  return JSON.stringify(val);
}

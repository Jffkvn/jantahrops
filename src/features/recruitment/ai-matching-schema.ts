import { z } from 'zod';
import type { ApplicationMatchTier } from '@/types/database';
import type { StatusChipVariant } from '@/components/status-chip';

export const cvWorkHistoryItemSchema = z.object({
  role: z.string(),
  company: z.string(),
  industry: z.string().nullable().default(null),
  start_date: z.string().nullable().default(null),
  end_date: z.string().nullable().default(null),
  highlights: z.array(z.string()).default([]),
});

export const cvEducationItemSchema = z.object({
  qualification: z.string(),
  institution: z.string(),
  year: z.string().nullable().default(null),
});

export const cvParsedDataSchema = z.object({
  parser_version: z.number().default(1),
  cv_file_id: z.string().nullable().optional(),
  readability: z.enum(['clear', 'partial', 'unreadable']).default('clear'),
  readability_note: z.string().nullable().default(null),
  summary: z.string().default(''),
  headline_suggested: z.string().nullable().default(null),
  years_experience_estimated: z.number().nullable().default(null),
  skills_extracted: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  industries_text: z.string().optional(),
  qualifications: z.array(z.string()).default([]),
  work_history: z.array(cvWorkHistoryItemSchema).default([]),
  education: z.array(cvEducationItemSchema).default([]),
});

export type CvParsedData = z.infer<typeof cvParsedDataSchema>;

export const pillarScoreSchema = z.object({
  score: z.number().min(0),
  max: z.number().min(1),
  note: z.string().default(''),
});

export const interviewPrepQuestionSchema = z.object({
  id: z.string(),
  topic: z.string().default('Follow-up'),
  why_ask: z.string().default(''),
  question: z.string(),
  source: z.enum(['ai', 'human']).default('ai'),
});

export type InterviewPrepQuestion = z.infer<typeof interviewPrepQuestionSchema>;

export const applicationAiAssessmentSchema = z.object({
  version: z.number().default(1),
  status: z.enum(['scored', 'needs_manual_read', 'error']).default('scored'),
  status_note: z.string().nullable().default(null),
  summary: z.string().default(''),
  pillars: z
    .object({
      core_skills: pillarScoreSchema.default({ score: 0, max: 35, note: '' }),
      transferable_and_industry: pillarScoreSchema.default({ score: 0, max: 30, note: '' }),
      experience_and_trajectory: pillarScoreSchema.default({ score: 0, max: 20, note: '' }),
      practical_and_cover_note: pillarScoreSchema.default({ score: 0, max: 15, note: '' }),
    })
    .default({
      core_skills: { score: 0, max: 35, note: '' },
      transferable_and_industry: { score: 0, max: 30, note: '' },
      experience_and_trajectory: { score: 0, max: 20, note: '' },
      practical_and_cover_note: { score: 0, max: 15, note: '' },
    }),
  strengths: z.array(z.string()).default([]),
  transferable_skills: z.array(z.string()).default([]),
  gaps_or_risks: z.array(z.string()).default([]),
  interview_questions: z.array(interviewPrepQuestionSchema).default([]),
  model: z.string().default('gpt-6-luna'),
  evaluated_at: z.string().default(() => new Date().toISOString()),
  overridden_by: z.string().nullable().optional(),
  overridden_by_name: z.string().nullable().optional(),
  overridden_at: z.string().nullable().optional(),
  ai_original_tier: z
    .enum(['strong', 'adjacent', 'partial', 'low', 'unscored'])
    .nullable()
    .optional(),
  ai_original_score: z.number().nullable().optional(),
});

export type ApplicationAiAssessment = z.infer<typeof applicationAiAssessmentSchema>;

export const MATCH_TIER_META: Record<
  ApplicationMatchTier,
  { label: string; shortLabel: string; tone: StatusChipVariant; rank: number }
> = {
  strong: { label: 'Strong Fit', shortLabel: 'Strong', tone: 'success', rank: 4 },
  adjacent: { label: 'Adjacent Fit', shortLabel: 'Adjacent', tone: 'info', rank: 3 },
  partial: { label: 'Partial Fit', shortLabel: 'Partial', tone: 'warning', rank: 2 },
  low: { label: 'Low Fit', shortLabel: 'Low', tone: 'neutral', rank: 1 },
  unscored: { label: 'Needs Manual Read', shortLabel: 'Manual Read', tone: 'neutral', rank: 0 },
};

export function parseCvData(raw: unknown): CvParsedData | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = cvParsedDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseAiAssessment(raw: unknown): ApplicationAiAssessment | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = applicationAiAssessmentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Computes a safe gap-fill patch for `candidates` from parsed CV data.
 * NEVER overwrites non-empty fields that a recruiter or candidate already supplied.
 */
export function computeCandidateGapFill(
  existing: {
    headline: string | null;
    years_experience: number | null;
    skills: string[];
    work_history: unknown[];
    education: unknown[];
  },
  parsed: CvParsedData,
): {
  headline?: string;
  years_experience?: number;
  skills?: string[];
  work_history?: unknown[];
  education?: unknown[];
} {
  const patch: {
    headline?: string;
    years_experience?: number;
    skills?: string[];
    work_history?: unknown[];
    education?: unknown[];
  } = {};

  if (parsed.readability === 'unreadable') {
    return patch;
  }

  const cleanHeadline = parsed.headline_suggested?.trim();
  if ((!existing.headline || existing.headline.trim() === '') && cleanHeadline) {
    patch.headline = cleanHeadline;
  }

  if (
    existing.years_experience == null &&
    parsed.years_experience_estimated != null &&
    Number.isFinite(parsed.years_experience_estimated) &&
    parsed.years_experience_estimated >= 0
  ) {
    patch.years_experience = Math.round(parsed.years_experience_estimated);
  }

  if ((!existing.skills || existing.skills.length === 0) && parsed.skills_extracted.length > 0) {
    const deduped = Array.from(
      new Set(parsed.skills_extracted.map((s) => s.trim()).filter(Boolean)),
    ).slice(0, 25);
    if (deduped.length > 0) {
      patch.skills = deduped;
    }
  }

  if (
    (!Array.isArray(existing.work_history) || existing.work_history.length === 0) &&
    parsed.work_history.length > 0
  ) {
    patch.work_history = parsed.work_history;
  }

  if (
    (!Array.isArray(existing.education) || existing.education.length === 0) &&
    parsed.education.length > 0
  ) {
    patch.education = parsed.education;
  }

  return patch;
}

export interface OverrideAssessmentInput {
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
  userId: string | null;
  userName: string | null;
  nowIso?: string;
}

/**
 * Applies a human recruiter's edits or override on top of an AI assessment,
 * preserving the original AI tier/score for auditability.
 */
export function applyHumanAssessmentOverride(input: OverrideAssessmentInput): {
  match_tier: ApplicationMatchTier;
  match_score: number | null;
  ai_assessment: ApplicationAiAssessment;
} {
  const now = input.nowIso ?? new Date().toISOString();
  const base =
    input.currentAssessment ??
    applicationAiAssessmentSchema.parse({
      version: 1,
      status: input.nextTier === 'unscored' ? 'needs_manual_read' : 'scored',
      evaluated_at: now,
      model: 'human',
    });

  const clampedScore =
    input.nextTier === 'unscored' || input.nextScore == null || !Number.isFinite(input.nextScore)
      ? null
      : Math.max(0, Math.min(100, Math.round(input.nextScore)));

  const updated: ApplicationAiAssessment = {
    ...base,
    status: input.nextTier === 'unscored' ? 'needs_manual_read' : 'scored',
    summary: input.summary.trim(),
    strengths: input.strengths.map((s) => s.trim()).filter(Boolean),
    transferable_skills: input.transferableSkills.map((s) => s.trim()).filter(Boolean),
    gaps_or_risks: input.gapsOrRisks.map((s) => s.trim()).filter(Boolean),
    interview_questions: input.interviewQuestions
      .map((q) => ({
        ...q,
        topic: q.topic.trim() || 'Follow-up',
        why_ask: q.why_ask.trim(),
        question: q.question.trim(),
      }))
      .filter((q) => q.question.length > 0),
    ai_original_tier:
      base.ai_original_tier !== undefined ? base.ai_original_tier : (input.currentTier ?? null),
    ai_original_score:
      base.ai_original_score !== undefined ? base.ai_original_score : (input.currentScore ?? null),
    overridden_by: input.userId,
    overridden_by_name: input.userName,
    overridden_at: now,
  };

  return {
    match_tier: input.nextTier,
    match_score: clampedScore,
    ai_assessment: updated,
  };
}

/**
 * Sorts applications either by Best Match (`match`) or Newest (`newest`).
 * Scored applications appear before unscored/null ones; ties break by tier rank
 * (`strong` > `adjacent` > `partial` > `low` > `unscored`) then `applied_at` desc.
 */
export function sortApplicationsByMatch<
  T extends {
    match_tier?: ApplicationMatchTier | null;
    match_score?: number | null;
    applied_at: string;
  },
>(rows: readonly T[], sortBy: 'match' | 'newest'): T[] {
  const copy = [...rows];
  if (sortBy === 'newest') {
    return copy.sort((a, b) => b.applied_at.localeCompare(a.applied_at));
  }

  return copy.sort((a, b) => {
    const aScored = a.match_score != null && a.match_tier !== 'unscored';
    const bScored = b.match_score != null && b.match_tier !== 'unscored';
    if (aScored !== bScored) return aScored ? -1 : 1;
    if (!aScored && !bScored) return b.applied_at.localeCompare(a.applied_at);

    const aScore = a.match_score ?? -1;
    const bScore = b.match_score ?? -1;
    if (aScore !== bScore) return bScore - aScore;

    const aRank = a.match_tier ? MATCH_TIER_META[a.match_tier].rank : -1;
    const bRank = b.match_tier ? MATCH_TIER_META[b.match_tier].rank : -1;
    if (aRank !== bRank) return bRank - aRank;

    return b.applied_at.localeCompare(a.applied_at);
  });
}

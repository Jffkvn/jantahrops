import type { StatusChipVariant } from '@/components/status-chip';
import type { VacancyRow } from '@/types/database';
import {
  parseAiAssessment,
  parseApplicationNotes,
  parseCvData,
  sortApplicationsByMatch,
  type ApplicationAiAssessment,
  type CvParsedData,
} from './ai-matching-schema';
import type { ApplicationWithRelations } from './recruitment-api';

export type SiftBucket = 'most_qualified' | 'overqualified' | 'transferable' | 'unqualified';

export const SIFT_BUCKET_ORDER: readonly SiftBucket[] = [
  'most_qualified',
  'overqualified',
  'transferable',
  'unqualified',
] as const;

export interface SiftBucketMeta {
  value: SiftBucket;
  label: string;
  shortLabel: string;
  description: string;
  tone: StatusChipVariant;
}

export const SIFT_BUCKET_META: Record<SiftBucket, SiftBucketMeta> = {
  most_qualified: {
    value: 'most_qualified',
    label: 'Most Qualified (In Target Range)',
    shortLabel: 'Most Qualified',
    description: '0–3 yrs in HR (including fresh HR graduates with internships), right location & core skills',
    tone: 'success',
  },
  overqualified: {
    value: 'overqualified',
    label: 'Overqualified (Senior HR)',
    shortLabel: 'Overqualified',
    description: '4+ yrs specifically in the HR space or holds Manager / Head of HR / Senior HR titles',
    tone: 'info',
  },
  transferable: {
    value: 'transferable',
    label: 'Transferable / Borderline',
    shortLabel: 'Transferable',
    description: 'Adjacent Admin/Operations experience or minor location/skill gap to verify',
    tone: 'warning',
  },
  unqualified: {
    value: 'unqualified',
    label: 'Does Not Qualify',
    shortLabel: 'Does Not Qualify',
    description: 'No relevant HR/Admin foundation or hard knock-out mismatch',
    tone: 'danger',
  },
};

export type LocationStatus = 'kampala' | 'relocate' | 'unable_to_relocate' | 'unspecified';
export type ExcelProficiency = 'Advanced' | 'Intermediate' | 'Basic' | null;

export interface SiftedApplicant {
  application: ApplicationWithRelations;
  bucket: SiftBucket;
  rank: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  linkedInUrl: string | null;
  hasCv: boolean;
  hasCoverLetterFile: boolean;
  coverNoteText: string | null;
  coverLetterSummary: string | null;
  cvParsed: CvParsedData | null;
  assessment: ApplicationAiAssessment | null;
  locationLabel: string;
  locationStatus: LocationStatus;
  isKampalaMetro: boolean;
  canWorkInKampala: boolean;
  excelLevel: ExcelProficiency;
  hrYears: number;
  totalYears: number | null;
  hasHrRole: boolean;
  hasHrEducation: boolean;
  hasSeniorHrTitle: boolean;
  seniorHrRoleLabel: string | null;
  recentRoleLine: string;
  educationLine: string | null;
  whyBucket: string;
  narrative: string;
  strengths: string[];
  watchouts: string[];
}

const SENIOR_HR_TITLE_RE =
  /\b(hr\s+manager|human\s+resources?\s+manager|head\s+of\s+(?:hr|human\s+resources?|people)|people\s+(?:and|&)\s+culture\s+(?:manager|head|director|lead)|hr\s+director|senior\s+(?:hr|human\s+resources?)|hr\s+business\s+partner|hrbp|chief\s+people)\b/i;

const HR_ROLE_OR_INDUSTRY_RE =
  /\b(hr|human\s+resources?|people\s+(?:and|&)\s+culture|talent\s+acquisition|recruit(?:er|ment|ing)|payroll|personnel|employee\s+relations|hris|compensation\s+(?:and|&)\s+benefits|people\s+operations)\b/i;

const HR_EDUCATION_RE =
  /\b(human\s+resource|hrm|b\.?hrm|industrial\s+and\s+organi[sz]ational\s+psychology|organi[sz]ational\s+psychology)\b/i;

const KAMPALA_PLACE_RE =
  /\b(kampala|wakiso|entebbe|kira|mukono|ntinda|nakawa|makindye|rubaga|kawempe|nsangi|bukoto|kololo|bugolobi|kisasi|kyaliwajjala|bweyogerere|nansana|najjera|kiwatule|luzira)\b/i;

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function parseYearMonth(raw: string | null | undefined, now: Date, isEnd = false): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^(current|present|now|to\s*date|ongoing|till\s*date)$/i.test(trimmed)) {
    return now.getFullYear() * 12 + now.getMonth();
  }

  // MM/YYYY or YYYY-MM
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const month = Math.min(11, Math.max(0, Number(slashMatch[1]) - 1));
    const year = Number(slashMatch[2]);
    return clampYearMonth(year * 12 + month, now);
  }

  const isoMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})(?:[/-]\d{1,2})?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Math.min(11, Math.max(0, Number(isoMatch[2]) - 1));
    return clampYearMonth(year * 12 + month, now);
  }

  // "May 2024" or "2024 May"
  const wordFirst = trimmed.match(/^([a-z]{3,9})\s+(\d{4})$/i);
  if (wordFirst?.[1] && wordFirst?.[2]) {
    const m = MONTHS[wordFirst[1].toLowerCase()];
    const y = Number(wordFirst[2]);
    if (m != null && Number.isFinite(y)) {
      return clampYearMonth(y * 12 + m, now);
    }
  }

  const yearOnly = trimmed.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    return clampYearMonth(year * 12 + (isEnd ? 11 : 0), now);
  }

  return null;
}

function clampYearMonth(ym: number, now: Date): number {
  const nowYm = now.getFullYear() * 12 + now.getMonth();
  return Math.min(ym, nowYm);
}

function estimateRoleYears(startDate: string | null | undefined, endDate: string | null | undefined, now: Date): number | null {
  const startYm = parseYearMonth(startDate, now, false);
  if (startYm == null) return null;
  const endYm = parseYearMonth(endDate, now, true) ?? now.getFullYear() * 12 + now.getMonth();
  const months = Math.max(1, endYm - startYm + 1);
  return Math.min(25, months / 12);
}

function parseNumericScreeningAnswer(answers: Record<string, unknown>, keyPattern: RegExp): number | null {
  for (const [key, val] of Object.entries(answers)) {
    if (!keyPattern.test(key)) continue;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string') {
      const m = val.trim().match(/(\d+(?:\.\d+)?)/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

function extractLocationInfo(
  app: ApplicationWithRelations,
  noteLocation: string | null,
): { label: string; status: LocationStatus; isKampalaMetro: boolean; canWorkInKampala: boolean } {
  const answers = app.screening_answers ?? {};
  let screeningLoc: string | null = null;
  for (const [key, val] of Object.entries(answers)) {
    if (/location|kampala|based/i.test(key) && typeof val === 'string' && val.trim()) {
      screeningLoc = val.trim();
      break;
    }
  }

  const raw = screeningLoc || noteLocation || app.candidateContact?.location || '';
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      label: 'Unspecified',
      status: 'unspecified',
      isKampalaMetro: false,
      canWorkInKampala: true,
    };
  }

  if (/unable\s+to\s+relocate|cannot\s+relocate|not\s+ready/i.test(trimmed)) {
    return {
      label: 'Outside Kampala (unable to relocate)',
      status: 'unable_to_relocate',
      isKampalaMetro: false,
      canWorkInKampala: false,
    };
  }

  if (/elsewhere\s+in\s+uganda|outside\s+uganda/i.test(trimmed)) {
    const isOutsideUg = /outside\s+uganda/i.test(trimmed);
    return {
      label: isOutsideUg ? 'Outside Uganda (ready to relocate)' : 'Elsewhere in Uganda (ready for Kampala)',
      status: 'relocate',
      isKampalaMetro: false,
      canWorkInKampala: true,
    };
  }

  if (KAMPALA_PLACE_RE.test(trimmed) || /^yes\b/i.test(trimmed)) {
    const shortLabel = trimmed.length > 36 && /greater\s+kampala/i.test(trimmed)
      ? 'Kampala / Greater Kampala'
      : trimmed;
    return {
      label: shortLabel,
      status: 'kampala',
      isKampalaMetro: true,
      canWorkInKampala: true,
    };
  }

  return {
    label: trimmed,
    status: 'relocate',
    isKampalaMetro: false,
    canWorkInKampala: true,
  };
}

function extractExcelLevel(app: ApplicationWithRelations): ExcelProficiency {
  const answers = app.screening_answers ?? {};
  for (const [key, val] of Object.entries(answers)) {
    if (!/excel/i.test(key) || typeof val !== 'string') continue;
    const low = val.trim().toLowerCase();
    if (low.includes('advanced')) return 'Advanced';
    if (low.includes('intermediate')) return 'Intermediate';
    if (low.includes('basic')) return 'Basic';
  }
  return null;
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatYearsLabel(years: number): string {
  const rounded = roundOneDecimal(years);
  return rounded === 1 ? '1 yr' : `${rounded} yrs`;
}

function resolveOverqualifiedThreshold(vacancy?: VacancyRow | null): number {
  const title = vacancy?.title ?? '';
  const reqs = `${vacancy?.summary ?? ''} ${vacancy?.requirements ?? ''}`;
  if (/\b(senior|lead|manager|director|head\s+of|principal)\b/i.test(title)) {
    return 10;
  }
  const reqYearsMatch = reqs.match(/(\d+)\s*[–-]\s*(\d+)\s*years?/i);
  if (reqYearsMatch) {
    const upper = Number(reqYearsMatch[2]);
    if (upper >= 4) return upper + 3;
  }
  // Entry / assistant role (e.g., HR Assistant 0-2 yrs): 4+ yrs specifically in HR = overqualified
  return 4;
}

function cleanTextBlock(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function splitCompleteSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  if (!matches) {
    const trimmed = text.trim();
    return trimmed ? [trimmed.endsWith('.') ? trimmed : `${trimmed}.`] : [];
  }
  return matches.map((s) => s.trim()).filter(Boolean);
}

const COVER_LETTER_EVAL_SENTENCE_RE =
  /\b(?:cover\s+(?:letter|note)|the\s+letter|application\s+letter|tailored|generic|addresses\s+(?:the|this)\s+(?:role|vacancy|client|project|duties))\b/i;

const BOILERPLATE_SENTENCE_RE =
  /\b(?:salary|expected\s+pay|kampala|location|availability|notice\s+period|immediately|available\s+in|relocate|hindrance)\b/i;

function formatThemeList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Produces a genuine third-person analysis of the candidate's cover letter:
 * keeps only the AI's tailoring critique (without repeating location/availability/salary)
 * and synthesizes the specific HR/client themes highlighted in the submitted text.
 */
export function buildCoverLetterSummary(
  assessment: ApplicationAiAssessment | null,
  coverNoteText: string | null,
  hasCoverLetterFile: boolean,
): string | null {
  const aiPracticalRaw = cleanTextBlock(assessment?.pillars.practical_and_cover_note.note);
  const critiqueSentences = aiPracticalRaw
    ? splitCompleteSentences(aiPracticalRaw).filter(
        (s) =>
          COVER_LETTER_EVAL_SENTENCE_RE.test(s) &&
          !(/\bsalary\b/i.test(s) && !COVER_LETTER_EVAL_SENTENCE_RE.test(s.replace(/[^.]*salary[^.]*/gi, ''))),
      )
    : [];

  // Strip trailing "; salary was not..." clauses attached to a cover-letter sentence.
  const cleanedCritique = critiqueSentences
    .map((s) =>
      s
        .replace(/;\s*no\s+salary[^.]*/gi, '')
        .replace(/;\s*salary\s+was\s+not[^.]*/gi, '')
        .trim(),
    )
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`));

  let textAnalysis: string | null = null;
  if (coverNoteText && coverNoteText.trim()) {
    const mentionsTelecomClient = /\b(?:fibre|fiber|telecom|telecommunications|network\s+maintenance|field\s+technician)\b/i.test(
      coverNoteText,
    );
    const themes: string[] = [];

    if (/\b(?:employee\s+files|personnel\s+files|confidential\s+records|audit[- ]ready|record[- ]keeping|filing\s+system|employee\s+records)\b/i.test(coverNoteText)) {
      themes.push('managing confidential employee files and audit-ready records');
    }
    if (/\b(?:attendance|timesheet|leave\s+track|absence|shift\s+roster|overtime)\b/i.test(coverNoteText)) {
      themes.push('tracking staff attendance, timesheets, and leave');
    }
    if (/\b(?:payroll|nssf|paye|statutory\s+deductions|remittance)\b/i.test(coverNoteText)) {
      themes.push('preparing payroll inputs and NSSF/PAYE compliance');
    }
    if (/\b(?:onboarding|orientation|recruitment|shortlisting|interview\s+coordination|hiring)\b/i.test(coverNoteText)) {
      themes.push('coordinating recruitment and staff onboarding');
    }
    if (/\b(?:project\s+site|field\s+staff|field\s+team|supervisors?|eacop|pipeline|multi[- ]?site)\b/i.test(coverNoteText)) {
      themes.push('following up with field teams and project supervisors');
    }

    const parts: string[] = [];
    if (mentionsTelecomClient && !cleanedCritique.some((s) => /\b(fibre|fiber|telecom)\b/i.test(s))) {
      parts.push("specifically references the client's fibre-network / telecom operations");
    }
    if (themes.length > 0) {
      parts.push(`emphasizes experience in ${formatThemeList(themes)}`);
    }

    if (parts.length > 0) {
      textAnalysis = `In the letter, the candidate ${parts.join(' and ')}.`;
    } else if (cleanedCritique.length === 0) {
      const hasHrKeywords = HR_ROLE_OR_INDUSTRY_RE.test(coverNoteText) || HR_EDUCATION_RE.test(coverNoteText);
      textAnalysis = hasHrKeywords
        ? 'Submitted a brief application letter expressing interest in the HR role without citing specific measurable achievements or client-sector context.'
        : 'Submitted a brief general note without specific HR deliverables or client-sector context.';
    }
  }

  // Filter out empty or non-cover AI sentences only as a safeguard when no cover critique matched
  const fallbackAi =
    cleanedCritique.length === 0 && aiPracticalRaw
      ? splitCompleteSentences(aiPracticalRaw).filter((s) => !BOILERPLATE_SENTENCE_RE.test(s))
      : [];

  const combined = [...cleanedCritique, ...(textAnalysis ? [textAnalysis] : []), ...fallbackAi];
  if (combined.length > 0) {
    return combined.join(' ');
  }

  if (hasCoverLetterFile) {
    return 'Submitted a separate cover letter document (viewable inside JantaHR Ops).';
  }

  return null;
}

/**
 * Classifies an applicant into an actionable triage bucket (`most_qualified`,
 * `overqualified`, `transferable`, `unqualified`) using HR-space seniority,
 * location alignment, Excel proficiency, and AI assessment pillars, and builds
 * a concise hindsight brief for Junior HR triage and Head of HR reporting.
 */
export function classifyApplicationForSift(
  app: ApplicationWithRelations,
  vacancy?: VacancyRow | null,
  nowDate = new Date(),
): SiftedApplicant {
  const candidate = app.candidate;
  const contact = app.candidateContact;
  const fullName = contact?.full_name?.trim() || 'Unnamed candidate';
  const parsedNotes = parseApplicationNotes(app.notes);
  const cvParsed = parseCvData(candidate?.cv_parsed);
  const assessment = parseAiAssessment(app.ai_assessment);
  const answers = app.screening_answers ?? {};

  const locationInfo = extractLocationInfo(app, parsedNotes.location);
  const excelLevel = extractExcelLevel(app);
  const overqualifiedThreshold = resolveOverqualifiedThreshold(vacancy);

  const workHistory =
    cvParsed?.work_history && cvParsed.work_history.length > 0
      ? cvParsed.work_history
      : Array.isArray(candidate?.work_history)
        ? (candidate.work_history as {
            role?: string;
            company?: string;
            industry?: string | null;
            start_date?: string | null;
            end_date?: string | null;
          }[])
        : [];

  const education =
    cvParsed?.education && cvParsed.education.length > 0
      ? cvParsed.education
      : Array.isArray(candidate?.education)
        ? (candidate.education as { qualification?: string; institution?: string; year?: string | null }[])
        : [];

  let hrRoleYearsSum = 0;
  let hasHrRole = false;
  let hasSeniorHrTitle = false;
  let seniorHrRoleLabel: string | null = null;
  let anyTimedRoleCount = 0;
  let allRolesAreHr = workHistory.length > 0;

  for (const item of workHistory) {
    const role = (item.role ?? '').trim();
    const company = (item.company ?? '').trim();
    const industry = (item.industry ?? '').trim();
    const roleCombined = `${role} ${industry}`.trim();
    const isHrRole = HR_ROLE_OR_INDUSTRY_RE.test(roleCombined);
    const isSeniorHr = SENIOR_HR_TITLE_RE.test(role);

    if (isSeniorHr && !hasSeniorHrTitle) {
      hasSeniorHrTitle = true;
      seniorHrRoleLabel = company ? `${role} at ${company}` : role;
    }

    if (isHrRole) {
      hasHrRole = true;
      const yrs = estimateRoleYears(item.start_date, item.end_date, nowDate);
      if (yrs != null) {
        hrRoleYearsSum += yrs;
        anyTimedRoleCount++;
      }
    } else if (role) {
      allRolesAreHr = false;
    }
  }

  // Check current role screening answer and candidate headline for HR & seniority titles.
  const currentRoleAnswer =
    typeof answers.sq_current_role === 'string' ? answers.sq_current_role.trim() : '';
  const headlineText = candidate?.headline || cvParsed?.headline_suggested || currentRoleAnswer || '';
  if (!hasHrRole && HR_ROLE_OR_INDUSTRY_RE.test(`${headlineText} ${currentRoleAnswer}`)) {
    hasHrRole = true;
  }
  if (!hasSeniorHrTitle) {
    if (SENIOR_HR_TITLE_RE.test(currentRoleAnswer)) {
      hasSeniorHrTitle = true;
      seniorHrRoleLabel = currentRoleAnswer;
    } else if (SENIOR_HR_TITLE_RE.test(headlineText)) {
      hasSeniorHrTitle = true;
      seniorHrRoleLabel = headlineText;
    }
  }

  const educationStrings = [
    ...education.map((e) => `${e.qualification ?? ''} ${e.institution ?? ''}`),
    ...(cvParsed?.qualifications ?? []),
  ];
  const hasHrEducation = educationStrings.some((s) => HR_EDUCATION_RE.test(s));

  const screeningHrYears = parseNumericScreeningAnswer(answers, /hr_exp|experience/i);
  const totalYears =
    candidate?.years_experience ?? cvParsed?.years_experience_estimated ?? screeningHrYears ?? null;

  // Estimate HR-specific years accurately without counting unrelated non-HR careers as overqualification.
  let hrYears = 0;
  if (hrRoleYearsSum > 0) {
    hrYears = roundOneDecimal(hrRoleYearsSum);
    // If work history was all HR but missing dates on some roles, consider totalYears/screening if higher.
    if (allRolesAreHr && totalYears != null && totalYears > hrYears && anyTimedRoleCount < workHistory.length) {
      hrYears = totalYears;
    }
  } else if (hasHrRole) {
    hrYears = roundOneDecimal(
      screeningHrYears ?? (allRolesAreHr && totalYears != null ? totalYears : Math.min(totalYears ?? 1, 2)),
    );
  }

  const score = app.match_score ?? null;
  const tier = app.match_tier;
  const hasBlockerFlag =
    assessment?.hindrance_flags.some((f) => f.severity === 'blocker') ?? false;

  const recentWork = workHistory[0];
  const recentRoleLine = recentWork?.role
    ? `${recentWork.role}${recentWork.company ? ` at ${recentWork.company}` : ''}`
    : currentRoleAnswer || candidate?.headline || cvParsed?.headline_suggested || 'Role not stated';

  const topEdu = education[0];
  const educationLine = topEdu?.qualification
    ? `${topEdu.qualification}${topEdu.institution ? ` · ${topEdu.institution}` : ''}`
    : null;

  // Classify into the 4 buckets
  let bucket: SiftBucket;
  const meetsMinimumScore = score == null || score >= 55;
  const qualifiesAsOverqualified =
    (hrYears >= overqualifiedThreshold ||
      (hasSeniorHrTitle &&
        (hrYears >= Math.max(2.5, overqualifiedThreshold - 1.5) ||
          (totalYears ?? 0) >= overqualifiedThreshold))) &&
    tier !== 'low' &&
    meetsMinimumScore &&
    locationInfo.canWorkInKampala;

  const isHardUnqualified =
    !locationInfo.canWorkInKampala ||
    tier === 'low' ||
    (score != null && score < 55) ||
    hasBlockerFlag ||
    (!hasHrRole && !hasHrEducation && (score == null ? tier != null : score < 68));

  const hasHrFoundation = hasHrRole || hasHrEducation;
  const locationReadyForTarget =
    locationInfo.isKampalaMetro || (locationInfo.canWorkInKampala && (score ?? 0) >= 80);
  const excelReadyForTarget = excelLevel !== 'Basic' || (score ?? 0) >= 82;

  const qualifiesForTargetRange =
    !qualifiesAsOverqualified &&
    !isHardUnqualified &&
    hasHrFoundation &&
    hrYears < overqualifiedThreshold &&
    locationReadyForTarget &&
    excelReadyForTarget &&
    (tier === 'strong' || (score != null && score >= 76));

  if (qualifiesAsOverqualified) {
    bucket = 'overqualified';
  } else if (isHardUnqualified) {
    bucket = 'unqualified';
  } else if (qualifiesForTargetRange) {
    bucket = 'most_qualified';
  } else {
    bucket = 'transferable';
  }

  // Construct concise, human-readable hindsight brief explaining WHY the candidate sits in this bucket.
  const strengths =
    assessment?.strengths && assessment.strengths.length > 0
      ? assessment.strengths.slice(0, 3)
      : assessment?.transferable_skills.slice(0, 3) ?? [];

  const watchouts: string[] = [];
  for (const flag of assessment?.hindrance_flags ?? []) {
    watchouts.push(flag.detail ? `${flag.title}: ${flag.detail}` : flag.title);
  }
  for (const gap of assessment?.gaps_or_risks ?? []) {
    if (watchouts.length >= 2) break;
    watchouts.push(gap);
  }

  let whyBucket = '';
  if (bucket === 'most_qualified') {
    const expDesc =
      hrYears > 0
        ? `${formatYearsLabel(hrYears)} direct HR experience`
        : hasHrEducation
          ? 'HR graduate foundation'
          : 'Relevant HR/Admin skills';
    const locDesc = locationInfo.isKampalaMetro
      ? `based in ${locationInfo.label}`
      : locationInfo.label;
    const excelDesc = excelLevel ? `Excel: ${excelLevel}` : null;
    whyBucket =
      [`In target range (${expDesc}), ${locDesc}`, excelDesc].filter(Boolean).join(' · ') + '.';
  } else if (bucket === 'overqualified') {
    const titlePart = seniorHrRoleLabel ? `held senior title (${seniorHrRoleLabel})` : null;
    const yrsPart =
      hrYears >= overqualifiedThreshold
        ? `${formatYearsLabel(hrYears)} specifically in the HR space`
        : totalYears != null
          ? `${formatYearsLabel(totalYears)} experience including senior HR scope`
          : 'senior HR experience';
    whyBucket = `Overqualified for this 0–2 yr Assistant role: ${[yrsPart, titlePart]
      .filter(Boolean)
      .join(' and ')}. Verify salary expectations and appetite for junior execution work.`;
    if (watchouts.length === 0) {
      watchouts.push('Retention & salary risk: confirm they want an entry/junior Assistant scope.');
    }
  } else if (bucket === 'transferable') {
    const reasons: string[] = [];
    if (!hasHrRole && !hasHrEducation) {
      reasons.push(`Background is primarily outside pure HR (${recentRoleLine})`);
    } else if (excelLevel === 'Basic') {
      reasons.push('Self-rated Basic Excel (role uses Excel for attendance & payroll)');
    } else if (!locationInfo.isKampalaMetro && locationInfo.status !== 'unspecified') {
      reasons.push(locationInfo.label);
    } else if (tier === 'unscored' || assessment == null) {
      reasons.push('Awaiting AI evaluation');
    } else {
      reasons.push(`Borderline match (${score ?? 'unscored'}/100) with transferable Admin/Ops experience`);
    }
    if (watchouts[0]) {
      reasons.push(cleanTextBlock(watchouts[0]).replace(/\.+$/, ''));
    }
    whyBucket = `${reasons.join(' · ')}.`;
  } else {
    if (!locationInfo.canWorkInKampala) {
      whyBucket = 'Does not qualify: Based outside Uganda and unable to relocate to Kampala.';
    } else if (hasBlockerFlag && watchouts[0]) {
      whyBucket = `Critical gap: ${cleanTextBlock(watchouts[0])}`;
    } else if (cvParsed?.readability === 'unreadable') {
      whyBucket = 'Needs manual check / low fit: Uploaded CV could not be read automatically.';
    } else {
      whyBucket = `Does not meet core HR/Admin requirements (${recentRoleLine}${
        score != null ? ` · score ${score}/100` : ''
      }).`;
    }
  }

  const hasCoverLetterFile = Boolean(parsedNotes.coverLetterPath);
  const coverLetterSummary = buildCoverLetterSummary(
    assessment,
    parsedNotes.cleanCoverNote,
    hasCoverLetterFile,
  );

  const narrative =
    cleanTextBlock(assessment?.summary) ||
    cleanTextBlock(cvParsed?.summary) ||
    coverLetterSummary ||
    'No summary available yet.';

  return {
    application: app,
    bucket,
    rank: 0,
    fullName,
    email: contact?.email ?? null,
    phone: contact?.phone_e164 ?? null,
    linkedInUrl: parsedNotes.linkedInUrl,
    hasCv: Boolean(candidate?.cv_file_id),
    hasCoverLetterFile,
    coverNoteText: parsedNotes.cleanCoverNote,
    coverLetterSummary,
    cvParsed,
    assessment,
    locationLabel: locationInfo.label,
    locationStatus: locationInfo.status,
    isKampalaMetro: locationInfo.isKampalaMetro,
    canWorkInKampala: locationInfo.canWorkInKampala,
    excelLevel,
    hrYears,
    totalYears,
    hasHrRole,
    hasHrEducation,
    hasSeniorHrTitle,
    seniorHrRoleLabel,
    recentRoleLine,
    educationLine,
    whyBucket,
    narrative,
    strengths,
    watchouts: watchouts.slice(0, 2),
  };
}

export interface SiftGroups {
  most_qualified: SiftedApplicant[];
  overqualified: SiftedApplicant[];
  transferable: SiftedApplicant[];
  unqualified: SiftedApplicant[];
  all: SiftedApplicant[];
}

/**
 * Classifies and ranks all applications for a vacancy into the 4 triage buckets,
 * ordering by AI match score inside each bucket and assigning per-bucket ranks.
 */
export function siftVacancyApplications(
  applications: ApplicationWithRelations[],
  vacancy?: VacancyRow | null,
  nowDate = new Date(),
): SiftGroups {
  const ordered = sortApplicationsByMatch(applications, 'match');
  const groups: SiftGroups = {
    most_qualified: [],
    overqualified: [],
    transferable: [],
    unqualified: [],
    all: [],
  };

  for (const app of ordered) {
    const item = classifyApplicationForSift(app, vacancy, nowDate);
    groups[item.bucket].push(item);
    groups.all.push(item);
  }

  // Within most_qualified, gently prefer candidates already in Kampala over relocation when scores are tied.
  groups.most_qualified.sort((a, b) => {
    const scoreDiff = (b.application.match_score ?? 0) - (a.application.match_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(b.isKampalaMetro) - Number(a.isKampalaMetro);
  });

  for (const key of SIFT_BUCKET_ORDER) {
    groups[key].forEach((entry, idx) => {
      entry.rank = idx + 1;
    });
  }

  return groups;
}

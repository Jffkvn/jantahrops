import { describe, expect, it } from 'vitest';
import {
  applyHumanAssessmentOverride,
  computeCandidateGapFill,
  parseAiAssessment,
  parseCvData,
  sortApplicationsByMatch,
  type CvParsedData,
} from './ai-matching-schema';
import { SHORTLIST_SELECT } from './recruitment-api';

describe('parseCvData & parseAiAssessment', () => {
  it('parses valid structured CV data and rejects malformed input safely', () => {
    const valid = parseCvData({
      parser_version: 1,
      readability: 'clear',
      headline_suggested: 'Senior Accountant & Tax Specialist',
      summary: 'CPA(U) qualified accountant with 7 years in telecom and FMCG.',
      years_experience_estimated: 7,
      skills_extracted: ['Payroll', 'URA PAYE', 'NSSF', 'SAP'],
      industries: ['Telecom', 'FMCG'],
      industries_text: 'Telecom FMCG',
      qualifications: ['CPA(U)', 'B.Com (Makerere University)'],
      work_history: [
        {
          company: 'MTN Uganda',
          role: 'Finance Officer',
          start_date: '2021',
          end_date: 'Present',
          industry: 'Telecom',
          highlights: ['Led monthly PAYE and NSSF filings for 400+ staff'],
        },
      ],
      education: [
        {
          institution: 'Makerere University',
          qualification: 'Bachelor of Commerce',
          year: '2018',
        },
      ],
    });

    expect(valid).not.toBeNull();
    expect(valid?.headline_suggested).toBe('Senior Accountant & Tax Specialist');
    expect(valid?.qualifications).toContain('CPA(U)');
    expect(parseCvData(null)).toBeNull();
    expect(parseCvData('not-an-object')).toBeNull();
  });

  it('parses valid AI assessment including unscored needs_manual_read fallback', () => {
    const unscored = parseAiAssessment({
      version: 1,
      model: 'gpt-4o-mini',
      status: 'needs_manual_read',
      status_note: 'Scanned image PDF without selectable text.',
      summary: 'Needs Manual Read — Scanned image PDF without selectable text.',
      pillars: {
        core_skills: { score: 0, max: 35, note: '' },
        transferable_and_industry: { score: 0, max: 30, note: '' },
        experience_and_trajectory: { score: 0, max: 20, note: '' },
        practical_and_cover_note: { score: 0, max: 15, note: '' },
      },
      strengths: [],
      transferable_skills: [],
      gaps_or_risks: [],
      interview_questions: [
        {
          id: 'q1',
          topic: 'Recent roles',
          question: 'Walk us through your recent roles.',
          why_ask: 'CV could not be automatically parsed.',
          source: 'ai',
        },
      ],
    });

    expect(unscored).not.toBeNull();
    expect(unscored?.status).toBe('needs_manual_read');
    expect(unscored?.status_note).toContain('Scanned image PDF');
    expect(unscored?.interview_questions).toHaveLength(1);
  });
});

describe('computeCandidateGapFill', () => {
  const sampleParsed: CvParsedData = {
    parser_version: 1,
    readability: 'clear',
    readability_note: null,
    headline_suggested: 'Operations Coordinator',
    summary: 'Experienced operations lead across East Africa.',
    years_experience_estimated: 6,
    skills_extracted: ['Logistics', 'Fleet Management', 'Procurement'],
    industries: ['Logistics', 'NGO'],
    industries_text: 'Logistics NGO',
    qualifications: ['Postgraduate Diploma in Project Planning (UMI)'],
    work_history: [
      {
        company: 'Trademark Africa',
        role: 'Logistics Officer',
        start_date: '2020',
        end_date: '2026',
        industry: 'NGO',
        highlights: ['Coordinated cross-border customs clearance'],
      },
    ],
    education: [
      {
        institution: 'Uganda Management Institute (UMI)',
        qualification: 'PGD Project Planning',
        year: '2021',
      },
    ],
  };

  it('fills only blank candidate fields and never overwrites human-entered data', () => {
    const patchForBlank = computeCandidateGapFill(
      {
        headline: null,
        years_experience: null,
        skills: [],
        work_history: [],
        education: [],
      },
      sampleParsed,
    );

    expect(patchForBlank).toEqual({
      headline: 'Operations Coordinator',
      years_experience: 6,
      skills: ['Logistics', 'Fleet Management', 'Procurement'],
      work_history: sampleParsed.work_history,
      education: sampleParsed.education,
    });

    const patchForPopulated = computeCandidateGapFill(
      {
        headline: 'Recruiter Custom Headline',
        years_experience: 8,
        skills: ['Custom Skill'],
        work_history: [{ company: 'Existing Co' }],
        education: [{ institution: 'Existing Uni' }],
      },
      sampleParsed,
    );

    expect(patchForPopulated).toEqual({});
  });

  it('does not gap-fill when CV readability is unreadable', () => {
    const unreadable: CvParsedData = {
      ...sampleParsed,
      readability: 'unreadable',
      readability_note: 'Encrypted PDF',
    };
    const patch = computeCandidateGapFill(
      {
        headline: null,
        years_experience: null,
        skills: [],
        work_history: [],
        education: [],
      },
      unreadable,
    );
    expect(patch).toEqual({});
  });
});

describe('applyHumanAssessmentOverride', () => {
  it('preserves original AI tier and score while recording human override metadata', () => {
    const initial = parseAiAssessment({
      version: 1,
      model: 'gpt-4o-mini',
      status: 'scored',
      summary: 'AI initial summary',
      pillars: {
        core_skills: { score: 20, max: 35, note: 'Some payroll exposure' },
        transferable_and_industry: { score: 18, max: 30, note: 'SACCO operations' },
        experience_and_trajectory: { score: 12, max: 20, note: '4 years tenure' },
        practical_and_cover_note: { score: 8, max: 15, note: 'Kampala based' },
      },
      strengths: ['Some payroll exposure'],
      transferable_skills: ['SACCO branch operations'],
      gaps_or_risks: ['No EFRIS mentioned'],
      interview_questions: [
        {
          id: 'q1',
          topic: 'EFRIS',
          question: 'Have you filed EFRIS returns?',
          why_ask: 'Not listed on CV',
          source: 'ai',
        },
      ],
    });

    const overridden = applyHumanAssessmentOverride({
      currentAssessment: initial,
      currentTier: 'partial',
      currentScore: 58,
      nextTier: 'adjacent',
      nextScore: 76,
      summary: 'Recruiter verified strong SACCO operations crossover.',
      strengths: ['Strong audit track record'],
      transferableSkills: ['High-volume branch reconciliation'],
      gapsOrRisks: ['Needs 2-week EFRIS onboarding'],
      interviewQuestions: initial?.interview_questions ?? [],
      userId: '11111111-1111-1111-1111-111111111111',
      userName: 'Grace Atim',
      nowIso: '2026-11-14T12:00:00.000Z',
    });

    expect(overridden.match_tier).toBe('adjacent');
    expect(overridden.match_score).toBe(76);
    expect(overridden.ai_assessment.ai_original_tier).toBe('partial');
    expect(overridden.ai_assessment.ai_original_score).toBe(58);
    expect(overridden.ai_assessment.overridden_by).toBe('11111111-1111-1111-1111-111111111111');
    expect(overridden.ai_assessment.overridden_by_name).toBe('Grace Atim');
    expect(overridden.ai_assessment.overridden_at).toBe('2026-11-14T12:00:00.000Z');
    expect(overridden.ai_assessment.interview_questions).toHaveLength(1);
  });
});

describe('sortApplicationsByMatch', () => {
  const items = [
    {
      id: 'unscored-new',
      match_score: null,
      match_tier: 'unscored' as const,
      applied_at: '2026-11-14T11:00:00.000Z',
    },
    {
      id: 'adjacent-74',
      match_score: 74,
      match_tier: 'adjacent' as const,
      applied_at: '2026-11-12T09:00:00.000Z',
    },
    {
      id: 'strong-88',
      match_score: 88,
      match_tier: 'strong' as const,
      applied_at: '2026-11-10T09:00:00.000Z',
    },
    {
      id: 'null-tier',
      match_score: null,
      match_tier: null,
      applied_at: '2026-11-14T12:00:00.000Z',
    },
  ];

  it('orders scored applications descending by score and places unscored/null last', () => {
    const sorted = sortApplicationsByMatch(items, 'match');
    expect(sorted.map((i) => i.id)).toEqual([
      'strong-88',
      'adjacent-74',
      'null-tier',
      'unscored-new',
    ]);
  });

  it('orders by applied_at descending when sortBy is newest', () => {
    const sorted = sortApplicationsByMatch(items, 'newest');
    expect(sorted.map((i) => i.id)).toEqual([
      'null-tier',
      'unscored-new',
      'adjacent-74',
      'strong-88',
    ]);
  });
});

describe('Shortlist Pack confidentiality guard', () => {
  it('excludes internal AI assessment and match score columns from SHORTLIST_SELECT', () => {
    expect(SHORTLIST_SELECT).not.toContain('match_tier');
    expect(SHORTLIST_SELECT).not.toContain('match_score');
    expect(SHORTLIST_SELECT).not.toContain('ai_assessment');
    expect(SHORTLIST_SELECT).not.toContain('ai_evaluated_at');
    expect(SHORTLIST_SELECT).not.toContain('recruiter_context');
    expect(SHORTLIST_SELECT).not.toMatch(/^\s*\*\s*,/m);
  });
});

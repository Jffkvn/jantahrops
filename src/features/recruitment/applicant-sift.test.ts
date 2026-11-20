import { describe, expect, it } from 'vitest';
import type { VacancyRow } from '@/types/database';
import type { ApplicationWithRelations } from './recruitment-api';
import { classifyApplicationForSift, siftVacancyApplications } from './applicant-sift';

const NOW = new Date('2026-11-20T09:00:00Z');

const HR_ASSISTANT_VACANCY = {
  id: 'vac-hr-assistant',
  organisation_id: 'org-1',
  title: 'HR Assistant',
  slug: 'hr-assistant',
  summary: 'Entry-level HR support role based in Kampala.',
  description: null,
  requirements:
    '0-2 years of relevant HR or administrative work/internship experience (motivated recent graduates encouraged to apply).',
  location: 'Kampala',
  employment_type: 'full_time',
  salary_min_ugx: null,
  salary_max_ugx: null,
  status: 'open',
  is_public: true,
  published_at: '2026-11-01T00:00:00Z',
  closes_at: null,
  owner_id: null,
  created_by: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  screening_questions: [],
  recruiter_context: null,
  forwarding_emails: [],
} satisfies VacancyRow;

function makeApp(overrides: Partial<ApplicationWithRelations> = {}): ApplicationWithRelations {
  return {
    id: 'app-1',
    vacancy_id: 'vac-hr-assistant',
    candidate_id: 'cand-1',
    source: 'website',
    stage: 'new',
    applied_at: '2026-11-18T09:00:00Z',
    owner_id: null,
    notes: null,
    rejected_reason: null,
    screening_answers: {
      sq_kampala_location: 'Currently in Kampala / Greater Kampala, Uganda',
      sq_excel_level: 'Intermediate',
      sq_hr_exp_years: '2',
      sq_current_role: 'HR Assistant',
    },
    match_tier: 'strong',
    match_score: 82,
    ai_assessment: {
      version: 1,
      status: 'scored',
      status_note: null,
      summary: 'Hands-on HR Assistant in Kampala with strong attendance tracking and filing.',
      hindrance_flags: [],
      pillars: {
        core_skills: { score: 28, max: 35, note: '' },
        transferable_and_industry: { score: 24, max: 30, note: '' },
        experience_and_trajectory: { score: 17, max: 20, note: '' },
        practical_and_cover_note: { score: 13, max: 15, note: '' },
      },
      strengths: ['Payroll & leave admin', 'Intermediate Excel'],
      transferable_skills: ['Client follow-up'],
      gaps_or_risks: [],
      interview_questions: [],
      model: 'gpt-6-luna',
      evaluated_at: '2026-11-18T09:05:00Z',
    },
    ai_evaluated_at: '2026-11-18T09:05:00Z',
    reviewed_at: '2026-11-18T09:05:00Z',
    reviewed_by: null,
    created_at: '2026-11-18T09:00:00Z',
    updated_at: '2026-11-18T09:05:00Z',
    vacancy: { id: 'vac-hr-assistant', title: 'HR Assistant', slug: 'hr-assistant', status: 'open' },
    candidate: {
      id: 'cand-1',
      headline: 'HR Assistant',
      skills: ['Onboarding', 'Excel', 'Filing'],
      rating: null,
      years_experience: 2,
      salary_expectation_ugx: null,
      availability: 'immediate',
      cv_file_id: 'file-1',
      cv_parsed: {
        parser_version: 1,
        readability: 'clear',
        summary: '2 years supporting HR admin in Kampala.',
        years_experience_estimated: 2,
        skills_extracted: ['Onboarding', 'Excel'],
        industries: ['Services'],
        qualifications: ['Bachelor of Human Resource Management'],
        work_history: [
          {
            role: 'HR Assistant',
            company: 'Acme Uganda Ltd',
            industry: 'Services',
            start_date: '01/2025',
            end_date: 'Present',
            highlights: ['Maintained employee files and leave trackers'],
          },
        ],
        education: [
          {
            qualification: 'Bachelor of Human Resource Management',
            institution: 'Makerere University',
            year: '2024',
          },
        ],
      },
    },
    candidateContact: {
      id: 'contact-1',
      full_name: 'Grace Nakato',
      email: 'grace@example.com',
      phone_e164: '+256772111222',
      location: 'Kampala',
    },
    ...overrides,
  };
}

describe('applicant-sift classification', () => {
  it('places a 0-2 yr Kampala HR Assistant in most_qualified', () => {
    const result = classifyApplicationForSift(makeApp(), HR_ASSISTANT_VACANCY, NOW);
    expect(result.bucket).toBe('most_qualified');
    expect(result.isKampalaMetro).toBe(true);
    expect(result.excelLevel).toBe('Intermediate');
    expect(result.hrYears).toBeLessThan(4);
    expect(result.whyBucket).toContain('target range');
  });

  it('places a fresh B.HRM graduate with a 6-month HR internship in most_qualified', () => {
    const freshGrad = makeApp({
      id: 'app-grad',
      match_tier: 'strong',
      match_score: 76,
      screening_answers: {
        sq_kampala_location: 'Currently in Kampala / Greater Kampala, Uganda',
        sq_excel_level: 'Intermediate',
        sq_hr_exp_years: '0.5',
        sq_current_role: 'HR Intern',
      },
      candidate: {
        id: 'cand-grad',
        headline: 'HR Graduate & Intern',
        skills: ['Recruitment', 'Excel'],
        rating: null,
        years_experience: 1,
        salary_expectation_ugx: null,
        availability: 'immediate',
        cv_file_id: 'file-grad',
        cv_parsed: {
          parser_version: 1,
          readability: 'clear',
          summary: 'Recent B.HRM graduate with HR internship experience.',
          years_experience_estimated: 1,
          skills_extracted: ['HR Admin'],
          industries: [],
          qualifications: ['Bachelor of Human Resource Management'],
          work_history: [
            {
              role: 'Human Resources Intern',
              company: 'KCCA',
              industry: 'Public Sector',
              start_date: '05/2026',
              end_date: '10/2026',
              highlights: ['Assisted with onboarding and leave filing'],
            },
          ],
          education: [
            {
              qualification: 'Bachelor of Human Resource Management',
              institution: 'MUBS',
              year: '2026',
            },
          ],
        },
      },
    });
    const result = classifyApplicationForSift(freshGrad, HR_ASSISTANT_VACANCY, NOW);
    expect(result.bucket).toBe('most_qualified');
    expect(result.hasHrEducation).toBe(true);
    expect(result.hrYears).toBeLessThan(1.5);
  });

  it('flags 4+ years in HR or senior HR titles as overqualified', () => {
    const seniorHr = makeApp({
      id: 'app-senior',
      match_tier: 'strong',
      match_score: 88,
      screening_answers: {
        sq_kampala_location: 'Currently in Kampala / Greater Kampala, Uganda',
        sq_excel_level: 'Advanced',
        sq_hr_exp_years: '6',
        sq_current_role: 'HR Manager',
      },
      candidate: {
        id: 'cand-senior',
        headline: 'Human Resources Manager',
        skills: ['HR Strategy', 'Payroll', 'Labor Law'],
        rating: null,
        years_experience: 6,
        salary_expectation_ugx: null,
        availability: 'one_month',
        cv_file_id: 'file-senior',
        cv_parsed: {
          parser_version: 1,
          readability: 'clear',
          summary: '6 years leading HR teams.',
          years_experience_estimated: 6,
          skills_extracted: ['HR Strategy'],
          industries: ['Manufacturing'],
          qualifications: ['Master of Human Resource Management'],
          work_history: [
            {
              role: 'HR Manager',
              company: 'BigCo Uganda',
              industry: 'Manufacturing',
              start_date: '01/2023',
              end_date: 'Present',
              highlights: ['Led team of 4 HR officers'],
            },
            {
              role: 'Human Resources Officer',
              company: 'MidCo Ltd',
              industry: 'Logistics',
              start_date: '01/2020',
              end_date: '12/2022',
              highlights: ['Managed payroll for 200 employees'],
            },
          ],
          education: [],
        },
      },
    });
    const result = classifyApplicationForSift(seniorHr, HR_ASSISTANT_VACANCY, NOW);
    expect(result.bucket).toBe('overqualified');
    expect(result.hasSeniorHrTitle).toBe(true);
    expect(result.hrYears).toBeGreaterThanOrEqual(4);
    expect(result.whyBucket).toContain('HR Manager at BigCo Uganda');
  });

  it('does NOT misclassify 5+ years of non-HR sales/admin experience with <1 yr HR as overqualified', () => {
    const switcher = makeApp({
      id: 'app-switch',
      match_tier: 'adjacent',
      match_score: 62,
      screening_answers: {
        sq_kampala_location: 'Currently in Kampala / Greater Kampala, Uganda',
        sq_excel_level: 'Intermediate',
        sq_hr_exp_years: '5',
        sq_current_role: 'Sales Coordinator',
      },
      ai_assessment: {
        version: 1,
        status: 'scored',
        status_note: null,
        summary: '5 years in retail sales & admin coordination; minimal direct HR exposure.',
        hindrance_flags: [],
        pillars: {
          core_skills: { score: 17, max: 35, note: '' },
          transferable_and_industry: { score: 22, max: 30, note: '' },
          experience_and_trajectory: { score: 13, max: 20, note: '' },
          practical_and_cover_note: { score: 10, max: 15, note: '' },
        },
        strengths: ['Spreadsheet reporting'],
        transferable_skills: ['Client follow-up'],
        gaps_or_risks: ['No formal HR systems experience'],
        interview_questions: [],
        model: 'gpt-6-luna',
        evaluated_at: '2026-11-18T09:05:00Z',
      },
      candidate: {
        id: 'cand-switch',
        headline: 'Sales & Admin Coordinator',
        skills: ['Sales', 'Excel'],
        rating: null,
        years_experience: 6,
        salary_expectation_ugx: null,
        availability: 'immediate',
        cv_file_id: 'file-switch',
        cv_parsed: {
          parser_version: 1,
          readability: 'clear',
          summary: 'Experienced in retail sales coordination.',
          years_experience_estimated: 6,
          skills_extracted: ['Sales'],
          industries: ['Retail'],
          qualifications: ['Bachelor of Commerce'],
          work_history: [
            {
              role: 'Sales Coordinator',
              company: 'RetailCo',
              industry: 'Retail',
              start_date: '01/2021',
              end_date: 'Present',
              highlights: ['Managed sales commissions'],
            },
            {
              role: 'HR Intern',
              company: 'Startup Ltd',
              industry: 'Tech',
              start_date: '06/2020',
              end_date: '11/2020',
              highlights: ['Filed leave forms'],
            },
          ],
          education: [],
        },
      },
    });
    const result = classifyApplicationForSift(switcher, HR_ASSISTANT_VACANCY, NOW);
    expect(result.bucket).toBe('transferable');
    expect(result.hrYears).toBeLessThan(1);
    expect(result.totalYears).toBe(6);
  });

  it('places outside-Uganda non-relocating or low-fit candidates into unqualified', () => {
    const nonRelocating = makeApp({
      id: 'app-far',
      screening_answers: {
        sq_kampala_location: 'Outside Uganda and unable to relocate to Kampala',
        sq_excel_level: 'Advanced',
      },
    });
    expect(classifyApplicationForSift(nonRelocating, HR_ASSISTANT_VACANCY, NOW).bucket).toBe('unqualified');

    const lowFit = makeApp({
      id: 'app-low',
      match_tier: 'low',
      match_score: 32,
    });
    expect(classifyApplicationForSift(lowFit, HR_ASSISTANT_VACANCY, NOW).bucket).toBe('unqualified');
  });

  it('places strong non-HR office administrators into transferable rather than most_qualified or overqualified', () => {
    const officeAdmin = makeApp({
      id: 'app-admin',
      match_tier: 'adjacent',
      match_score: 77,
      screening_answers: {
        sq_kampala_location: 'Currently in Kampala / Greater Kampala, Uganda',
        sq_excel_level: 'Advanced',
        sq_hr_exp_years: '0',
        sq_current_role: 'Office Administrator',
      },
      candidate: {
        id: 'cand-admin',
        headline: 'Office Administrator',
        skills: ['Excel', 'Filing'],
        rating: null,
        years_experience: 5,
        salary_expectation_ugx: null,
        availability: 'immediate',
        cv_file_id: 'file-admin',
        cv_parsed: {
          parser_version: 1,
          readability: 'clear',
          summary: '5 years in procurement and office administration.',
          years_experience_estimated: 5,
          skills_extracted: ['Excel'],
          industries: ['IT'],
          qualifications: ['Bachelor of Procurement'],
          work_history: [
            {
              role: 'Office Administrator',
              company: 'TechCo',
              industry: 'IT',
              start_date: '01/2021',
              end_date: 'Present',
              highlights: ['Managed vendor files'],
            },
          ],
          education: [
            {
              qualification: 'Bachelor of Procurement',
              institution: 'MUBS',
              year: '2020',
            },
          ],
        },
      },
    });
    expect(classifyApplicationForSift(officeAdmin, HR_ASSISTANT_VACANCY, NOW).bucket).toBe('transferable');
  });

  it('ranks applications inside each sift bucket cleanly', () => {
    const a1 = makeApp({ id: 'a1', match_score: 79, match_tier: 'strong' });
    const a2 = makeApp({
      id: 'a2',
      match_score: 91,
      match_tier: 'strong',
      candidateContact: { id: 'c2', full_name: 'Top Scorer', email: null, phone_e164: null },
    });
    const groups = siftVacancyApplications([a1, a2], HR_ASSISTANT_VACANCY, NOW);
    expect(groups.most_qualified).toHaveLength(2);
    expect(groups.most_qualified[0]?.application.id).toBe('a2');
    expect(groups.most_qualified[0]?.rank).toBe(1);
    expect(groups.most_qualified[1]?.rank).toBe(2);
  });
});

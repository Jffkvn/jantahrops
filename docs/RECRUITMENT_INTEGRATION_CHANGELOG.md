# JantaHR OPs — Recruitment & Dynamic Screening System Documentation

> **Repository**: `/Users/jeffadhaya/Documents/Anti gravity Projects/JantaHR OPs`  
> **Last Updated**: 29 September 2026  
> **Status**: Verified (104/104 Tests Passing)  

---

## 1. Overview & Purpose

This document details the enhancements made to the **JantaHR OPs** recruitment module to enable:
1. Publishing job vacancies directly to the public website (`jantahr.com/jobs`).
2. Creating and managing custom, role-specific **Screening Questions** on each vacancy.
3. Automatically ingesting candidate applications, uploaded CVs, cover letters, and screening answers into the internal recruitment CRM.

---

## 2. Where to Access in the OPs Interface

```
Sidebar Navigation (localhost:5180)
├── Today
├── Pipeline (Leads, Contacts, Organisations)
├── Delivery
│   ├── Projects
│   ├── Recruitment  <-- 📍 CLICK HERE to manage Vacancies & Candidate Pipelines
│   ├── Talent Pool
│   └── Academy
└── Money / Workspace
```

### 2.1 Managing Vacancies & Adding Screening Questions
1. Navigate to **Delivery > Recruitment** (`/recruitment`).
2. Click **"+ New Vacancy"** (or click an existing vacancy row in the list).
3. In the slide-over editor sheet (`VacancyEditorSheet`), scroll past the *Requirements* field.
4. Locate the **"Screening Questions"** card:
   - Click **"+ Add question"**
   - Enter your prompt (e.g., *"How many years of commercial payroll experience do you have?"*)
   - Choose the Answer Type:
     * **Numeric**: for years of experience, scores, headcounts.
     * **Short text**: for free-form responses or certifications.
     * **Yes / No**: boolean radio selection.
     * **Dropdown list**: single selection from comma-separated options (e.g., `QuickBooks, SAP, Tally, Sage`).
   - Check the **Mandatory** toggle if the candidate cannot submit without answering.
   - Click **"Add to vacancy"**.
5. Toggle **"Public job board"** to active and click **"Save changes"** (or **"Create vacancy"**).
6. The vacancy and its custom questions are immediately published to the live website.

### 2.2 Reviewing Candidate Applications & Answers
1. In **Delivery > Recruitment**, select a vacancy to open its **Candidate Pipeline** Kanban board.
2. When candidates apply from the website, a candidate card automatically appears in the **"New"** stage.
3. Click any candidate card to open their detail sheet (`ApplicationDetailSheet`):
   - **Candidate Profile**: Full name, email, phone, location, LinkedIn link.
   - **Resume / CV**: View or download the uploaded document.
   - **Cover Letter**: Recorded in the application's notes section.
   - **Screening Question Responses**: A dedicated card displaying the vacancy's exact questions paired with the candidate's answers.
   - **Stage Controls**: Move the candidate to *Screened*, *Shortlisted*, *Interview*, *Offered*, or *Hired*.

---

## 3. Database Schema Changes

### Migration File: `supabase/migrations/20260929000000_screening_questions.sql`
```sql
-- 1. Vacancies: add screening_questions JSONB array
alter table public.vacancies
  add column if not exists screening_questions jsonb default '[]'::jsonb not null;

comment on column public.vacancies.screening_questions is
  'Array of custom screening questions: [{id, question, type, required, options?}]';

-- 2. Applications: add screening_answers JSONB object
alter table public.applications
  add column if not exists screening_answers jsonb default '{}'::jsonb not null;

comment on column public.applications.screening_answers is
  'Key-value map of question IDs to candidate responses: {"sq_1": "answer"}';
```

---

## 4. TypeScript Definitions (`src/types/database.ts`)

```ts
export type ScreeningQuestionType = 'text' | 'number' | 'select' | 'boolean';

export interface ScreeningQuestionRow {
  id: string;
  question: string;
  type: ScreeningQuestionType;
  required: boolean;
  options?: string[];
}

export type VacancyRow = {
  // ... existing fields ...
  screening_questions: ScreeningQuestionRow[];
};

export type ApplicationRow = {
  // ... existing fields ...
  screening_answers: Record<string, unknown>;
  notes: string | null;
};
```

---

## 5. API & Edge Functions

### 5.1 Public Vacancies Feed (`supabase/functions/public-jobs/index.ts`)
- Edge function serving active vacancies to the public website.
- Queries `public.vacancies` for `is_public = true` and `status = 'open'`.
- Includes `screening_questions` in the SQL `select(...)`.
- Maps `screening_questions` to `screeningQuestions` in the response array:
  ```json
  {
    "jobs": [
      {
        "id": "uuid",
        "slug": "head-of-finance",
        "title": "Head of Finance",
        "screeningQuestions": [...]
      }
    ]
  }
  ```

### 5.2 Candidate Registration (`supabase/functions/public-candidates/index.ts`)
- Manages candidate intake and CV uploads.
- Updated `RegistrationPayload` interface to accept:
  * `screeningAnswers?: Record<string, unknown>`
  * `notes?: string` (contains cover letter and supplementary info)
- When creating the application for `vacancySlug`, automatically inserts `screening_answers` and `notes` into `public.applications`.

### 5.3 Recruitment Service (`src/features/recruitment/recruitment-api.ts`)
- Updated `createVacancy` to accept and insert `screeningQuestions`.
- Updated `updateVacancy` with bidirectional camelCase-to-snake_case mapping to ensure database column integrity:
  ```ts
  if (patch.screening_questions !== undefined) dbPatch.screening_questions = patch.screening_questions;
  else if (patch.screeningQuestions !== undefined) dbPatch.screening_questions = patch.screeningQuestions;
  ```

---

## 6. Test Verification
- All test suites passing: **20 test files, 104 unit & integration tests**.
- Ran: `npm test -- --run` -> **0 failures**.
- Build command: `npm run build` -> **0 TypeScript errors, bundle verified**.

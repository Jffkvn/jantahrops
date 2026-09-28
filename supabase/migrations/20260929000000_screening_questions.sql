-- Migration: Add screening_questions to vacancies and screening_answers to applications
-- Enables hiring managers to define custom role-specific questions in the vacancy editor
-- and records candidate responses upon application submission.

-- 1. Vacancies: screening_questions JSONB array
alter table public.vacancies
  add column if not exists screening_questions jsonb default '[]'::jsonb not null;

comment on column public.vacancies.screening_questions is
  'Array of custom screening questions: [{id, question, type, required, options?}]';

-- 2. Applications: screening_answers JSONB object
alter table public.applications
  add column if not exists screening_answers jsonb default '{}'::jsonb not null;

comment on column public.applications.screening_answers is
  'Key-value map of question IDs to candidate responses: {"sq_1": "answer"}';

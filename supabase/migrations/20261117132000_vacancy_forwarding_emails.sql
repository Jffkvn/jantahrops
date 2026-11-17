-- Add optional per-vacancy external application forwarding recipients.
-- When set by JantaHR staff, new applications submitted via jantahr.com for
-- that vacancy also trigger a client-ready email copy (screening answers,
-- cover letter / notes, and CV download / attachment) to these addresses.
-- Never exposed on GET /public-jobs.

alter table public.vacancies
  add column if not exists forwarding_emails text[] not null default '{}';

comment on column public.vacancies.forwarding_emails is
  'Optional internal-only recipient email list (e.g. external client HR Lead) that receives a client-ready application copy on new submissions. Never exposed on GET /public-jobs.';

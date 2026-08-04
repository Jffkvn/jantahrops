-- JantaHR Ops — Recruitment Foundation
-- Vacancies, candidates (talent pool), applications, interviews; candidate CV
-- storage; the candidate_waiting signal; full-text search over candidates.
-- The public job-board and candidate-registration endpoints live in Edge
-- Functions; this migration is only the schema, storage, rules and search.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
create type public.vacancy_status    as enum ('draft','open','paused','closed');
create type public.employment_type   as enum ('full_time','part_time','contract','temporary','internship');
create type public.application_stage as enum
  ('new','screened','shortlisted','interview_scheduled','interviewed',
   'rejected','offered','hired','talent_pool');
create type public.availability_status as enum ('immediate','one_month','three_months','not_looking');

-- ---------------------------------------------------------------------------
-- 2. Vacancies
-- ---------------------------------------------------------------------------
create table public.vacancies (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null, -- the client hiring
  title           text not null,
  slug            text not null unique,
  summary         text,
  description     text,
  requirements    text,
  location        text,
  employment_type public.employment_type,
  salary_min_ugx  bigint,
  salary_max_ugx  bigint,
  status          public.vacancy_status not null default 'draft',
  is_public       boolean not null default false,     -- shows on the website job board
  published_at    timestamptz,
  closes_at       date,
  owner_id        uuid references public.profiles(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint vacancies_salary_range check (
    salary_min_ugx is null or salary_max_ugx is null or salary_max_ugx >= salary_min_ugx
  )
);

create index vacancies_status_idx        on public.vacancies (status);
create index vacancies_is_public_idx     on public.vacancies (is_public);
create index vacancies_organisation_idx  on public.vacancies (organisation_id);
create index vacancies_owner_idx         on public.vacancies (owner_id);
create index vacancies_slug_idx          on public.vacancies (slug);
create index vacancies_created_idx       on public.vacancies (created_at desc);

create trigger vacancies_set_updated_at
  before update on public.vacancies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Candidates (the talent pool — one profile per contact)
-- ---------------------------------------------------------------------------
create table public.candidates (
  id                    uuid primary key default gen_random_uuid(),
  contact_id            uuid not null references public.contacts(id) on delete cascade,
  headline              text,
  years_experience      integer,
  skills                text[] not null default '{}',
  education             jsonb not null default '[]',
  work_history          jsonb not null default '[]',
  salary_expectation_ugx bigint,
  availability          public.availability_status,
  cv_file_id            uuid,                          -- → candidate_files
  cv_parsed             jsonb,                         -- AI-populated later
  cv_parsed_at          timestamptz,                   -- AI-populated later
  rating                integer,                       -- 1..5, internal
  is_available          boolean not null default true,
  source                text,
  notes                 text,
  owner_id              uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (contact_id)                                  -- one candidate profile per person
);

create index candidates_is_available_idx on public.candidates (is_available);
create index candidates_owner_idx        on public.candidates (owner_id);
create index candidates_created_idx      on public.candidates (created_at desc);
create index candidates_skills_idx       on public.candidates using gin (skills);

-- Full-text search over the candidate's own columns (name lives on contacts and
-- is searched via a join in the API). Generated tsvector, GIN-indexed.
-- array_to_string is STABLE, not immutable, so it cannot appear directly in a
-- generated column — it goes through this thin immutable wrapper.
create or replace function public.array_to_text(a text[])
returns text
language sql immutable
as $$ select array_to_string(a, ' ') $$;

alter table public.candidates
  add column search_tsv tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(headline, '') || ' ' ||
      public.array_to_text(skills) || ' ' ||
      coalesce(notes, '')
    )
  ) stored;
create index candidates_search_idx on public.candidates using gin (search_tsv);

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Applications (one per person per vacancy)
-- ---------------------------------------------------------------------------
create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  vacancy_id      uuid not null references public.vacancies(id) on delete cascade,
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  source          text,
  stage           public.application_stage not null default 'new',
  applied_at      timestamptz not null default now(),
  owner_id        uuid references public.profiles(id) on delete set null,
  notes           text,
  rejected_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (vacancy_id, candidate_id)                    -- one application per person per vacancy
);

create index applications_vacancy_idx   on public.applications (vacancy_id);
create index applications_candidate_idx on public.applications (candidate_id);
create index applications_stage_idx     on public.applications (stage);
create index applications_owner_idx     on public.applications (owner_id);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Stage-change logging: every path produces the same 'application' timeline entry.
create or replace function public.log_application_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.activities (subject_type, subject_id, type, body, meta, user_id)
    values (
      'application', new.id, 'stage_change',
      format('Application moved from %s to %s', old.stage, new.stage),
      jsonb_build_object('from', old.stage, 'to', new.stage),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger applications_log_stage_change
  after update on public.applications
  for each row execute function public.log_application_stage_change();

-- ---------------------------------------------------------------------------
-- 5. Interviews
-- ---------------------------------------------------------------------------
create table public.interviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  scheduled_at   timestamptz,
  mode           text,                                 -- 'in_person'|'video'|'phone'
  panel          text[] not null default '{}',
  feedback       text,
  rating         integer,                              -- 1..5
  outcome        text,                                 -- 'pass'|'fail'|'hold'
  created_at     timestamptz not null default now()
);

create index interviews_application_idx on public.interviews (application_id);

-- ---------------------------------------------------------------------------
-- 6. RLS — authenticated read/write, admin delete (same shape as the spine)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'vacancies', 'candidates', 'applications', 'interviews', 'candidate_files'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security;', t);
      execute format(
        'create policy %I_select on public.%I for select to authenticated using (true);',
        t, t);
      execute format(
        'create policy %I_insert on public.%I for insert to authenticated with check (true);',
        t, t);
      execute format(
        'create policy %I_update on public.%I for update to authenticated using (true) with check (true);',
        t, t);
      execute format(
        'create policy %I_delete on public.%I for delete to authenticated using (public.is_admin());',
        t, t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Candidate files (CV storage — private bucket + metadata table)
-- ---------------------------------------------------------------------------
create table public.candidate_files (
  id          uuid primary key default gen_random_uuid(),
  bucket      text not null default 'candidates',
  path        text not null,
  filename    text not null,
  mime        text not null,
  size_bytes  integer not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index candidate_files_bucket_idx on public.candidate_files (bucket, path);

alter table public.candidate_files enable row level security;
create policy candidate_files_select on public.candidate_files for select to authenticated using (true);
create policy candidate_files_insert on public.candidate_files for insert to authenticated with check (true);
create policy candidate_files_delete on public.candidate_files for delete to authenticated using (public.is_admin());

-- The bucket is PRIVATE: signed URLs only. No public read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidates',
  'candidates',
  false,
  10485760,  -- 10 MB cap
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy candidate_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'candidates');
create policy candidate_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'candidates');
create policy candidate_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'candidates' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Signal rule — candidate_waiting
-- ---------------------------------------------------------------------------
-- Replaces generate_signals() to add the recruitment rule alongside lead_going_cold.
create or replace function public.generate_signals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Expire cold-lead signals that have since been actioned.
  update public.signals s
  set status = 'expired'
  where s.status = 'open'
    and s.kind = 'lead_going_cold'
    and not exists (
      select 1
      from public.leads l
      left join lateral (
        select max(a.occurred_at) as last_at
        from public.activities a
        where a.subject_type = 'lead' and a.subject_id = l.id
      ) la on true
      where l.id = s.subject_id
        and l.stage in ('new','contacted','qualified','proposal_sent','negotiation')
        and l.next_action_at is null
        and greatest(l.created_at, coalesce(la.last_at, l.created_at)) < now() - interval '7 days'
    );

  -- Insert cold-lead signals for leads that qualify.
  insert into public.signals
    (kind, severity, subject_type, subject_id, title, detail, evidence, suggested_action)
  select
    'lead_going_cold',
    'warn',
    'lead',
    l.id,
    coalesce(c.full_name, 'A lead') || ' has gone quiet',
    'No next action is set and there has been no activity for over a week.',
    jsonb_build_object(
      'days_quiet',
      floor(extract(epoch from now() - greatest(l.created_at, coalesce(la.last_at, l.created_at))) / 86400)::int,
      'stage', l.stage
    ),
    'Set a follow-up, or log a call'
  from public.leads l
  left join public.contacts c on c.id = l.contact_id
  left join lateral (
    select max(a.occurred_at) as last_at
    from public.activities a
    where a.subject_type = 'lead' and a.subject_id = l.id
  ) la on true
  where l.stage in ('new','contacted','qualified','proposal_sent','negotiation')
    and l.next_action_at is null
    and greatest(l.created_at, coalesce(la.last_at, l.created_at)) < now() - interval '7 days'
    and not exists (
      select 1 from public.signals s
      where s.status = 'open' and s.kind = 'lead_going_cold' and s.subject_id = l.id
    )
    and not exists (
      select 1 from public.signals s
      where s.kind = 'lead_going_cold' and s.subject_id = l.id
        and s.status = 'dismissed' and s.dismissed_at > now() - interval '3 days'
    )
  on conflict do nothing;

  -- Expire candidate_waiting signals whose application has moved or had activity.
  update public.signals s
  set status = 'expired'
  where s.status = 'open'
    and s.kind = 'candidate_waiting'
    and not exists (
      select 1
      from public.applications a
      left join lateral (
        select max(x.occurred_at) as last_at
        from public.activities x
        where x.subject_type = 'application' and x.subject_id = a.id
      ) la on true
      where a.id = s.subject_id
        and a.stage in ('new','screened','shortlisted','interview_scheduled')
        and greatest(a.applied_at, coalesce(la.last_at, a.applied_at)) < now() - interval '5 days'
    );

  -- Insert candidate_waiting signals for applications stuck > 5 days.
  insert into public.signals
    (kind, severity, subject_type, subject_id, title, detail, evidence, suggested_action)
  select
    'candidate_waiting',
    'warn',
    'application',
    a.id,
    coalesce(c.full_name, 'A candidate') || ' is waiting on you for ' || coalesce(v.title, 'a role'),
    'The application has been at this stage with no activity for over 5 days.',
    jsonb_build_object(
      'days_stale',
      floor(extract(epoch from
        now() - greatest(a.applied_at, coalesce(la.last_at, a.applied_at))) / 86400)::int,
      'stage', a.stage
    ),
    'Move stage or send an update'
  from public.applications a
  join public.candidates can on can.id = a.candidate_id
  join public.contacts c on c.id = can.contact_id
  left join public.vacancies v on v.id = a.vacancy_id
  left join lateral (
    select max(x.occurred_at) as last_at
    from public.activities x
    where x.subject_type = 'application' and x.subject_id = a.id
  ) la on true
  where a.stage in ('new','screened','shortlisted','interview_scheduled')
    and greatest(a.applied_at, coalesce(la.last_at, a.applied_at)) < now() - interval '5 days'
    and not exists (
      select 1 from public.signals s
      where s.status = 'open' and s.kind = 'candidate_waiting' and s.subject_id = a.id
    )
    and not exists (
      select 1 from public.signals s
      where s.kind = 'candidate_waiting' and s.subject_id = a.id
        and s.status = 'dismissed' and s.dismissed_at > now() - interval '3 days'
    )
  on conflict do nothing;
end;
$$;

grant execute on function public.generate_signals() to authenticated;
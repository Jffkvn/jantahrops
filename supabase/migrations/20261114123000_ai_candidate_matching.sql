-- JantaHR Ops — AI Candidate Matching, Transferable-Skill Scoring & Interview Prep
-- (Prompt 3.3)
--
-- 1. Optional internal `recruiter_context` on vacancies (never exposed on
--    GET /public-jobs; when null, evaluator uses Uganda/East Africa industry
--    standards).
-- 2. Per-application AI match columns (`match_tier`, `match_score`,
--    `ai_assessment`, `ai_evaluated_at`).
-- 3. Extend `v_candidate_search` to index parsed CV summary & industries.
-- 4. Server-side Talent Pool matcher `match_talent_pool_for_vacancy` to surface
--    existing available candidates (~2,000+ pool) who fit a vacancy.

-- ---------------------------------------------------------------------------
-- 1. Vacancy internal recruiter context
-- ---------------------------------------------------------------------------
alter table public.vacancies
  add column if not exists recruiter_context text;

comment on column public.vacancies.recruiter_context is
  'Optional internal-only notes for AI screening (preferred industries, pace, dealbreakers). Never exposed on GET /public-jobs. When null, AI uses Uganda/East Africa industry standards.';

-- ---------------------------------------------------------------------------
-- 2. Application match columns
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.application_match_tier as enum (
    'strong',      -- 80..100: checks core requirements + context
    'adjacent',    -- 65..85:  strong transferable / adjacent industry fit
    'partial',     -- 45..64:  meets some criteria, notable gaps
    'low',         -- 0..44:   missing fundamental requirements
    'unscored'     -- unreadable CV or insufficient data; needs manual read
  );
exception
  when duplicate_object then null;
end $$;

alter table public.applications
  add column if not exists match_tier      public.application_match_tier,
  add column if not exists match_score     integer,
  add column if not exists ai_assessment   jsonb,
  add column if not exists ai_evaluated_at timestamptz;

do $$ begin
  alter table public.applications
    add constraint applications_match_score_range
      check (match_score is null or (match_score >= 0 and match_score <= 100));
exception
  when duplicate_object then null;
end $$;

create index if not exists applications_vacancy_match_idx
  on public.applications (vacancy_id, match_score desc nulls last);

comment on column public.applications.match_tier is
  'AI or recruiter-overridden role fit tier: strong | adjacent | partial | low | unscored. Internal only.';
comment on column public.applications.match_score is
  '0..100 role fit score for this vacancy (null when unscored). Internal only.';
comment on column public.applications.ai_assessment is
  'Structured rubric breakdown, strengths, transferable skills, gaps, interview questions, and human override metadata. Internal only.';

-- ---------------------------------------------------------------------------
-- 3. Extend v_candidate_search with parsed CV summary and industries
-- ---------------------------------------------------------------------------
create or replace view public.v_candidate_search as
  select
    c.id,
    c.contact_id,
    c.owner_id,
    c.headline,
    c.skills,
    c.years_experience,
    c.availability,
    c.salary_expectation_ugx,
    c.is_available,
    c.needs_review,
    c.created_at,
    ct.full_name,
    lower(
      coalesce(ct.full_name, '') || ' ' ||
      coalesce(ct.email, '') || ' ' ||
      coalesce(ct.phone_e164, '') || ' ' ||
      coalesce(c.headline, '') || ' ' ||
      coalesce(array_to_string(c.skills, ' '), '') || ' ' ||
      coalesce(c.cv_parsed->>'summary', '') || ' ' ||
      coalesce(c.cv_parsed->>'industries_text', '')
    ) as search_text
  from public.candidates c
  left join public.contacts ct on ct.id = c.contact_id;

alter view public.v_candidate_search set (security_invoker = on);
revoke all on public.v_candidate_search from anon;
grant select on public.v_candidate_search to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Server-side Talent Pool matcher for a vacancy
-- ---------------------------------------------------------------------------
create or replace function public.match_talent_pool_for_vacancy(
  p_vacancy_id uuid,
  p_limit integer default 20
)
returns table (
  candidate_id           uuid,
  contact_id             uuid,
  full_name              text,
  email                  text,
  phone_e164             text,
  headline               text,
  skills                 text[],
  years_experience       integer,
  salary_expectation_ugx bigint,
  availability           public.availability_status,
  rating                 integer,
  cv_parsed              jsonb,
  matched_skills         text[],
  relevance_score        integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_vacancy       public.vacancies%rowtype;
  v_industry      text;
  v_corpus        text;
  v_title_context text;
  v_safe_limit    integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  select * into v_vacancy
    from public.vacancies
   where id = p_vacancy_id;

  if not found then
    return;
  end if;

  if v_vacancy.organisation_id is not null then
    select o.industry into v_industry
      from public.organisations o
     where o.id = v_vacancy.organisation_id;
  end if;

  v_corpus := lower(
    coalesce(v_vacancy.title, '') || ' ' ||
    coalesce(v_vacancy.summary, '') || ' ' ||
    coalesce(v_vacancy.description, '') || ' ' ||
    coalesce(v_vacancy.requirements, '') || ' ' ||
    coalesce(v_vacancy.recruiter_context, '') || ' ' ||
    coalesce(v_industry, '')
  );

  v_title_context := lower(
    coalesce(v_vacancy.title, '') || ' ' ||
    coalesce(v_vacancy.summary, '') || ' ' ||
    coalesce(v_industry, '')
  );

  return query
  with candidate_eval as (
    select
      c.id as c_id,
      c.contact_id as c_contact_id,
      ct.full_name as c_full_name,
      ct.email as c_email,
      ct.phone_e164 as c_phone_e164,
      c.headline as c_headline,
      c.skills as c_skills,
      c.years_experience as c_years_experience,
      c.salary_expectation_ugx as c_salary_expectation_ugx,
      c.availability as c_availability,
      c.rating as c_rating,
      c.cv_parsed as c_cv_parsed,
      c.created_at as c_created_at,
      array(
        select s
        from unnest(c.skills) as s
        where length(trim(s)) >= 2
          and position(lower(trim(s)) in v_corpus) > 0
      ) as c_matched_skills,
      greatest(
        word_similarity(lower(v_vacancy.title), lower(coalesce(c.headline, ''))),
        word_similarity(lower(v_vacancy.title), lower(coalesce(c.cv_parsed->>'summary', ''))),
        word_similarity(lower(coalesce(v_industry, '')), lower(coalesce(c.cv_parsed->>'industries_text', ''))),
        similarity(
          v_title_context,
          lower(
            coalesce(c.headline, '') || ' ' ||
            coalesce(array_to_string(c.skills, ' '), '') || ' ' ||
            coalesce(c.cv_parsed->>'summary', '')
          )
        )
      ) as c_text_sim
    from public.candidates c
    left join public.contacts ct on ct.id = c.contact_id
    where c.is_available = true
      and not exists (
        select 1
          from public.applications a
         where a.vacancy_id = p_vacancy_id
           and a.candidate_id = c.id
      )
  ),
  scored as (
    select
      ce.*,
      least(
        98,
        least(cardinality(ce.c_matched_skills) * 18, 54)
        + round(coalesce(ce.c_text_sim, 0) * 32)::integer
        + case
            when (cardinality(ce.c_matched_skills) > 0 or coalesce(ce.c_text_sim, 0) >= 0.12)
                 and coalesce(ce.c_years_experience, 0) > 0
            then least(ce.c_years_experience * 2, 8)
            else 0
          end
        + case
            when (cardinality(ce.c_matched_skills) > 0 or coalesce(ce.c_text_sim, 0) >= 0.12)
                 and v_vacancy.salary_max_ugx is not null
                 and ce.c_salary_expectation_ugx is not null
                 and ce.c_salary_expectation_ugx > 0
                 and ce.c_salary_expectation_ugx <= v_vacancy.salary_max_ugx
            then 4
            else 0
          end
      )::integer as c_score
    from candidate_eval ce
    where cardinality(ce.c_matched_skills) > 0
       or coalesce(ce.c_text_sim, 0) >= 0.12
  )
  select
    s.c_id,
    s.c_contact_id,
    s.c_full_name,
    s.c_email,
    s.c_phone_e164,
    s.c_headline,
    s.c_skills,
    s.c_years_experience,
    s.c_salary_expectation_ugx,
    s.c_availability,
    s.c_rating,
    s.c_cv_parsed,
    s.c_matched_skills,
    s.c_score
  from scored s
  order by s.c_score desc, coalesce(s.c_rating, 0) desc, s.c_created_at desc
  limit v_safe_limit;
end;
$$;

revoke all on function public.match_talent_pool_for_vacancy(uuid, integer) from public, anon;
grant execute on function public.match_talent_pool_for_vacancy(uuid, integer) to authenticated, service_role;

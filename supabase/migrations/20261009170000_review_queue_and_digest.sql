-- 1. "New from the website" review queue.
-- 2. The weekday morning digest email, scheduled with pg_cron.
--
-- REVIEW QUEUE
-- Website submissions used to land silently: a lead in the New column, a CV in
-- a talent pool of ~2,000. reviewed_at marks whether a person has looked at a
-- record yet. The Today page lists everything unreviewed; the morning digest
-- counts it.
--
-- Only records that arrive from outside are unreviewed. Anything a signed-in
-- person creates in the app is reviewed by definition (they are looking at
-- it), and so is anything the bulk CV importer creates (import_batch set).
-- The public edge functions run as service role (no auth.uid()), so their rows
-- start unreviewed.

alter table public.leads
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.applications
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null;
alter table public.candidates
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null;

-- Everything already in Ops has been seen; the queue starts empty.
update public.leads        set reviewed_at = created_at where reviewed_at is null;
update public.applications set reviewed_at = created_at where reviewed_at is null;
update public.candidates   set reviewed_at = created_at where reviewed_at is null;

create index leads_unreviewed_idx        on public.leads (created_at desc)        where reviewed_at is null;
create index applications_unreviewed_idx on public.applications (created_at desc) where reviewed_at is null;
create index candidates_unreviewed_idx   on public.candidates (created_at desc)   where reviewed_at is null;

comment on column public.leads.reviewed_at is
  'Null = arrived from the website and nobody has looked yet (Today → New from the website).';
comment on column public.applications.reviewed_at is
  'Null = arrived from the website and nobody has looked yet (Today → New from the website).';
comment on column public.candidates.reviewed_at is
  'Null = registered on the website and nobody has looked yet (Today → New from the website).';

create or replace function public.mark_reviewed_when_created_in_app()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;
  return new;
end;
$$;

-- Candidates also count as reviewed when the bulk importer creates them.
create or replace function public.mark_candidate_reviewed_when_created_in_app()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null or new.import_batch is not null then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger leads_mark_reviewed
  before insert on public.leads
  for each row execute function public.mark_reviewed_when_created_in_app();
create trigger applications_mark_reviewed
  before insert on public.applications
  for each row execute function public.mark_reviewed_when_created_in_app();
create trigger candidates_mark_reviewed
  before insert on public.candidates
  for each row execute function public.mark_candidate_reviewed_when_created_in_app();

-- MORNING DIGEST
-- pg_cron calls the daily-digest edge function at 07:30 Kampala time (04:30
-- UTC), Monday to Saturday, matching office days. The function is deployed
-- without JWT verification and instead checks a shared secret header. The
-- secret lives in Supabase Vault (name: digest_cron_secret) and in the
-- function's environment (DIGEST_CRON_SECRET); it is never in this file.
-- Until the Vault secret exists the call is rejected, which is harmless.

create extension if not exists pg_net;

select cron.unschedule('daily-digest')
where exists (select 1 from cron.job where jobname = 'daily-digest');

select cron.schedule(
  'daily-digest',
  '30 4 * * 1-6',
  $cron$
    select net.http_post(
      url     := 'https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/daily-digest',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-digest-secret', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret'),
          ''
        )
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

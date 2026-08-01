-- JantaHR Ops — signals engine.
--
-- A signal is a flagged problem with evidence and a suggested action. The
-- architecture is hybrid by design: deterministic SQL RULES find the candidates
-- (cheap, explainable, never wrong about "is this overdue"); a model layer can
-- later rank them and draft the action. This migration ships the rules; the
-- model layer plugs in without schema change.
--
-- Every signal is a row — auditable, dismissible, and it never silently
-- vanishes. Dismissing one suppresses it for a cooldown so nothing nags.

create type public.signal_severity as enum ('info', 'warn', 'urgent');
create type public.signal_status as enum ('open', 'dismissed', 'actioned', 'expired');

create table public.signals (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null,               -- 'lead_going_cold', ...
  severity         public.signal_severity not null default 'warn',
  subject_type     text not null,               -- 'lead', 'organisation', ...
  subject_id       uuid not null,
  title            text not null,               -- the human sentence
  detail           text,
  evidence         jsonb not null default '{}', -- the facts that fired it
  suggested_action text,
  action_payload   jsonb not null default '{}',
  status           public.signal_status not null default 'open',
  generated_at     timestamptz not null default now(),
  dismissed_by     uuid references public.profiles (id) on delete set null,
  dismissed_at     timestamptz
);

-- At most ONE open signal per (kind, subject). The generation function relies
-- on this to stay idempotent under concurrency.
create unique index signals_one_open_per_subject
  on public.signals (kind, subject_type, subject_id)
  where status = 'open';

create index signals_status_idx  on public.signals (status, severity);
create index signals_subject_idx on public.signals (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- Rule engine
-- ---------------------------------------------------------------------------
-- Runs the deterministic rules: expires signals whose condition no longer
-- holds, then inserts new ones. Idempotent — safe to call on every Day View
-- load and on a nightly cron. security definer so it can write signals
-- regardless of the caller's RLS.
--
-- Rule 1 — lead_going_cold: an active-stage lead with NO next action set and no
-- activity for over a week. This is the lead you'd otherwise forget entirely —
-- distinct from the Day View, which shows leads that DO have a follow-up due.
create or replace function public.generate_signals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Expire cold-lead signals that have since been actioned (a next action set,
  -- or the lead moved to a terminal stage, or new activity logged).
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

  -- Insert cold-lead signals for leads that qualify and don't already have an
  -- open one, skipping any dismissed in the last 3 days (cooldown).
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
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.signals enable row level security;

-- Read and dismiss (update) for any signed-in user. Inserts happen only through
-- generate_signals() (security definer). Admin may delete.
create policy signals_select on public.signals for select to authenticated using (true);
create policy signals_update on public.signals for update to authenticated using (true) with check (true);
create policy signals_delete on public.signals for delete to authenticated using (public.is_admin());

grant execute on function public.generate_signals() to authenticated;

-- ---------------------------------------------------------------------------
-- Nightly cron (best-effort — the Day View also generates on load, so signals
-- are never stale even if pg_cron is unavailable).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'generate-signals-nightly',
      '0 3 * * *',                       -- 03:00 UTC = 06:00 EAT
      $cron$ select public.generate_signals(); $cron$
    );
  end if;
exception when others then
  -- Non-fatal: on-load generation covers us.
  null;
end $$;

-- JantaHR Ops — Phase 4: Projects
--
-- The delivery side of the business: an engagement you have been contracted to
-- do, what it is worth, what it has cost, and whether it is on track.
--
-- Scope is deliberately narrow. This is not project management software — there
-- are no dependencies, no Gantt, no assignments, no per-task time. A two-person
-- consultancy does not need them and would not maintain them. What it needs is
-- to know, per engagement: what did we promise, when is the next thing due, and
-- are we making money on this.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
create type public.project_stage as enum (
  'planned',
  'active',
  'waiting_on_client',   -- the reason a Ugandan consultancy project actually stalls
  'under_review',
  'completed',
  'archived'
);

create type public.milestone_status as enum ('pending', 'in_progress', 'done', 'blocked');

-- ---------------------------------------------------------------------------
-- 2. Internal day rate
-- ---------------------------------------------------------------------------
-- Project profit is an ESTIMATE: contracted value − direct expenses −
-- (days logged × internal day rate). The rate is a single company-wide number,
-- so it belongs on company_profile next to the other figures that drive money
-- maths. It is nullable on purpose: until it is set, the UI shows cost and
-- profit as unavailable rather than inventing a rate and printing a confident
-- wrong number.
alter table public.company_profile
  add column internal_day_rate_ugx bigint;

comment on column public.company_profile.internal_day_rate_ugx is
  'What a day of our time costs us, in whole UGX. Drives estimated project profit. Null = not set; profit is shown as unavailable rather than guessed.';

-- ---------------------------------------------------------------------------
-- 3. Projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references public.organisations (id) on delete restrict,
  contact_id           uuid references public.contacts (id) on delete set null,
  name                 text not null,
  project_type         text,                        -- recruitment | training | hr_setup | advisory | other
  owner_id             uuid references public.profiles (id) on delete set null,
  stage                public.project_stage not null default 'planned',
  start_date           date,
  end_date             date,
  contracted_value_ugx bigint not null default 0,
  description          text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint projects_value_nonneg check (contracted_value_ugx >= 0),
  -- A project that ends before it starts is a data-entry slip, not a state the
  -- rest of the app should have to reason about.
  constraint projects_dates_ordered check (end_date is null or start_date is null or end_date >= start_date)
);

-- `on delete restrict` above is deliberate: deleting an organisation that still
-- has projects would silently orphan its delivery history and its P&L.

create index projects_organisation_idx on public.projects (organisation_id);
create index projects_stage_idx        on public.projects (stage);
create index projects_owner_idx        on public.projects (owner_id);
create index projects_end_date_idx     on public.projects (end_date);

-- ---------------------------------------------------------------------------
-- 4. Milestones
-- ---------------------------------------------------------------------------
create table public.project_milestones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null,
  due_date     date,
  status       public.milestone_status not null default 'pending',
  position     integer not null default 0,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index project_milestones_project_idx on public.project_milestones (project_id, position);
create index project_milestones_due_idx     on public.project_milestones (due_date)
  where status <> 'done';

-- Keep completed_at in step with status, in the database rather than in every
-- caller. A `done` milestone with no completion date cannot be reported on, and
-- a re-opened one carrying a stale date is worse than carrying none.
create or replace function public.sync_milestone_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger project_milestones_sync_completed
  before insert or update on public.project_milestones
  for each row execute function public.sync_milestone_completed_at();

-- ---------------------------------------------------------------------------
-- 5. Time entries
-- ---------------------------------------------------------------------------
-- Stored in DAYS, not hours.
--
-- The build plan's table sketch said `hours numeric(4,1)`, but its own prose
-- says "log by the half-day, once a week" and defines profit as
-- "days logged × internal day rate". Storing hours would force every read to
-- divide by a working-day length nobody has specified — 8? 8.5? — and bake that
-- guess into the profit figure. Storing what is actually entered makes the
-- stated formula exact and removes the assumption entirely.
create table public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  work_date  date not null,
  days       numeric(4, 2) not null,
  note       text,
  created_at timestamptz not null default now(),

  -- Half-day granularity, and nobody works more than a week in one entry.
  constraint time_entries_days_sane check (days > 0 and days <= 7),
  constraint time_entries_half_day check (days * 2 = round(days * 2))
);

create index time_entries_project_idx on public.time_entries (project_id, work_date desc);
create index time_entries_user_idx    on public.time_entries (user_id, work_date desc);

-- ---------------------------------------------------------------------------
-- 6. Wire up the expense link that was left dangling
-- ---------------------------------------------------------------------------
-- `expenses.project_id` was added in the finance migration as a bare uuid,
-- because projects did not exist yet. Now it can be a real foreign key. Any
-- pre-existing value that points nowhere is cleared first so the constraint can
-- be added without failing.
update public.expenses
   set project_id = null
 where project_id is not null
   and not exists (select 1 from public.projects p where p.id = expenses.project_id);

alter table public.expenses
  add constraint expenses_project_id_fkey
  foreign key (project_id) references public.projects (id) on delete set null;

create index if not exists expenses_project_idx on public.expenses (project_id);

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger project_milestones_set_updated_at
  before update on public.project_milestones
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Row level security — same shape as the rest of the app
-- ---------------------------------------------------------------------------
alter table public.projects           enable row level security;
alter table public.project_milestones enable row level security;
alter table public.time_entries       enable row level security;

create policy projects_select on public.projects
  for select to authenticated using (true);
create policy projects_insert on public.projects
  for insert to authenticated with check (true);
create policy projects_update on public.projects
  for update to authenticated using (true) with check (true);
create policy projects_delete on public.projects
  for delete to authenticated using (public.is_admin());

create policy project_milestones_select on public.project_milestones
  for select to authenticated using (true);
create policy project_milestones_insert on public.project_milestones
  for insert to authenticated with check (true);
create policy project_milestones_update on public.project_milestones
  for update to authenticated using (true) with check (true);
-- Milestones are working notes, not records: anyone may remove one they added
-- in error. Deleting the PROJECT still needs an admin, and that cascades.
create policy project_milestones_delete on public.project_milestones
  for delete to authenticated using (true);

create policy time_entries_select on public.time_entries
  for select to authenticated using (true);
create policy time_entries_insert on public.time_entries
  for insert to authenticated with check (true);
-- Your own time is yours to correct; an admin can fix anyone's. Editing a
-- colleague's logged days silently changes the profit figure on their project.
create policy time_entries_update on public.time_entries
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy time_entries_delete on public.time_entries
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. Estimated P&L
-- ---------------------------------------------------------------------------
-- One row per project with every number the P&L needs, so the UI never
-- assembles money from several round trips and never re-implements the formula.
--
-- `labour_cost_ugx` and `estimated_profit_ugx` are NULL when the internal day
-- rate is unset. That is the honest answer, and it forces the UI to say "set
-- your day rate" instead of quietly showing a profit equal to the full
-- contracted value.
--
-- security_invoker so the base tables' RLS applies to the caller. Without it a
-- view runs as its owner and becomes a hole straight through RLS — exactly the
-- leak found in v_candidate_search on 9 Aug.
create view public.v_project_pnl
with (security_invoker = on) as
  select
    p.id as project_id,
    p.contracted_value_ugx,
    coalesce(e.expenses_ugx, 0)::bigint  as expenses_ugx,
    coalesce(t.days_logged, 0)::numeric  as days_logged,
    coalesce(d.invoiced_ugx, 0)::bigint  as invoiced_ugx,
    coalesce(d.received_ugx, 0)::bigint  as received_ugx,
    case when cp.internal_day_rate_ugx is null then null
         else round(coalesce(t.days_logged, 0) * cp.internal_day_rate_ugx)::bigint
    end as labour_cost_ugx,
    case when cp.internal_day_rate_ugx is null then null
         else (p.contracted_value_ugx
               - coalesce(e.expenses_ugx, 0)
               - round(coalesce(t.days_logged, 0) * cp.internal_day_rate_ugx))::bigint
    end as estimated_profit_ugx
  from public.projects p
  cross join (select internal_day_rate_ugx from public.company_profile where id) cp
  left join (
    select project_id, sum(amount_ugx) as expenses_ugx
    from public.expenses
    where project_id is not null
    group by project_id
  ) e on e.project_id = p.id
  left join (
    select project_id, sum(days) as days_logged
    from public.time_entries
    group by project_id
  ) t on t.project_id = p.id
  left join (
    -- Invoices raised against this project, and what has actually landed.
    -- Cancelled invoices are excluded; they were never owed.
    select
      doc.related_id as project_id,
      sum(doc.total_ugx) as invoiced_ugx,
      sum(coalesce(pay.paid_ugx, 0)) as received_ugx
    from public.documents doc
    left join (
      -- Received + withheld: under Ugandan WHT the client pays 94% to us and
      -- 6% to URA on our behalf, and the invoice is settled by the sum. From
      -- the project's point of view the whole amount came in.
      select document_id, sum(amount_received_ugx + wht_withheld_ugx) as paid_ugx
      from public.payments
      group by document_id
    ) pay on pay.document_id = doc.id
    where doc.type = 'invoice'
      and doc.related_type = 'project'
      and doc.related_id is not null
      and doc.status <> 'cancelled'
    group by doc.related_id
  ) d on d.project_id = p.id;

comment on view public.v_project_pnl is
  'Per-project estimated P&L. labour_cost and estimated_profit are NULL when company_profile.internal_day_rate_ugx is unset — the UI must say so rather than imply a profit.';

revoke all on public.v_project_pnl from anon;
grant select on public.v_project_pnl to authenticated;

-- JantaHR Ops — Phase 5, slice 1: Academy spine
--
-- Training is JantaHR's most common revenue line. This is the back office for
-- it: what we teach, when we run it, who is on it, whether they have paid, and
-- who actually turned up.
--
-- Scope is the staff-facing spine only. Lessons, progress and certificates are
-- slice 2; a student-facing portal is slice 3. The shape below is chosen so
-- those bolt on rather than force a rewrite — see "designed for the portal"
-- at the end of this file.
--
-- Data model informed by reading classroomio/classroomio and frappe/lms (both
-- AGPL-3.0, neither forked — see ACADEMY_BUILD_VS_FORK.md in the authoring
-- folder). Three things were taken from them and they are marked below.

-- ---------------------------------------------------------------------------
-- 1. Staff vs student boundary
-- ---------------------------------------------------------------------------
-- Today every authenticated user is staff: `handle_new_user` gives every new
-- auth user a profile row, and every policy in the app reads `to authenticated
-- using (true)`. The moment a STUDENT can log in, that reading becomes wrong —
-- they would be `authenticated` and could read every cohort, contact and
-- invoice in the business.
--
-- This helper makes the boundary explicit now, while it is free. Today it is
-- exactly equivalent to `true`, because every auth user has a profile. When the
-- portal lands, students get auth accounts WITHOUT a profile row (or with a
-- non-staff role) and every policy written against `is_staff()` keeps its
-- meaning without being revisited.
--
-- security definer for the same reason is_admin() is: a policy on profiles that
-- plainly selects from profiles would recurse.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  );
$$;

comment on function public.is_staff() is
  'True when the caller is a member of staff. Equivalent to `true` today — every auth user has a profile — but the boundary the student portal will need.';

grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------------
create type public.delivery_mode as enum ('live_online', 'in_person', 'self_paced', 'hybrid');

create type public.cohort_status as enum ('planned', 'open', 'running', 'completed', 'cancelled');

-- Entitlement is a STATE, not a checkbox.
--
-- frappe/lms models this as `lms_payment.payment_received`, a boolean, which
-- cannot express "invoiced but unpaid" or "paid but not yet started", and has
-- nowhere to record WHEN access was granted. The progression below is the one
-- thing that lets the Academy grow without rework.
create type public.enrolment_status as enum (
  'registered',   -- they have a place
  'invoiced',     -- an invoice exists against the enrolment
  'paid',         -- that invoice settled; entitled_at is set
  'active',       -- attending
  'completed',
  'dropped'
);

-- ---------------------------------------------------------------------------
-- 3. Courses — what we teach
-- ---------------------------------------------------------------------------
create table public.courses (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  slug                  text not null unique,
  summary               text,
  description           text,
  outline               jsonb not null default '[]'::jsonb,
  price_ugx             bigint not null default 0,
  corporate_price_ugx   bigint,
  duration_label        text,                    -- '3 days', '6 evenings'
  -- TAKEN FROM classroomio (`course.compliance.retakeIntervalMonths`).
  -- HR compliance training expires and has to be retaken; this is what makes a
  -- certificate's expiry derivable, and it turns "whose certificate lapses next
  -- quarter" into a sales list rather than a guess.
  retake_interval_months integer,
  is_public             boolean not null default false,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint courses_price_nonneg check (price_ugx >= 0),
  constraint courses_corporate_price_nonneg check (corporate_price_ugx is null or corporate_price_ugx >= 0),
  constraint courses_retake_sane check (retake_interval_months is null or retake_interval_months between 1 and 120)
);

create index courses_public_idx on public.courses (is_public) where is_public;

-- ---------------------------------------------------------------------------
-- 4. Cohorts — when we run it
-- ---------------------------------------------------------------------------
-- Deliberately different from classroomio, where `course.group_id` means a
-- course belongs to ONE group. A training business runs the same course again
-- and again, so here one course has many cohorts over time and the course is
-- the reusable thing.
create table public.cohorts (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses (id) on delete restrict,
  name           text not null,
  start_date     date,
  end_date       date,
  delivery_mode  public.delivery_mode not null default 'in_person',
  capacity       integer,
  location       text,
  meeting_url    text,
  facilitator_id uuid references public.profiles (id) on delete set null,
  status         public.cohort_status not null default 'planned',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint cohorts_capacity_sane check (capacity is null or capacity > 0),
  constraint cohorts_dates_ordered check (end_date is null or start_date is null or end_date >= start_date)
);

-- `on delete restrict` on course_id: deleting a course that has been run would
-- silently orphan every enrolment and attendance record attached to it.

create index cohorts_course_idx on public.cohorts (course_id);
create index cohorts_status_idx on public.cohorts (status);
create index cohorts_start_idx  on public.cohorts (start_date);

-- ---------------------------------------------------------------------------
-- 5. Enrolments — who is on it
-- ---------------------------------------------------------------------------
-- Keyed to a CONTACT, never to a staff profile or a separate student table.
-- This is the whole reason we did not fork an LMS: someone who attended a
-- course in March and applies for a job in September is one person here, not
-- two unrelated records in two systems.
create table public.enrolments (
  id              uuid primary key default gen_random_uuid(),
  cohort_id       uuid not null references public.cohorts (id) on delete cascade,
  contact_id      uuid not null references public.contacts (id) on delete restrict,
  -- Who is paying, when a company sends delegates. Often not the student's own
  -- employer field — the invoice goes to whoever agreed to pay.
  organisation_id uuid references public.organisations (id) on delete set null,
  status          public.enrolment_status not null default 'registered',
  entitled_at     timestamptz,
  source          text,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One place per person per cohort. classroomio enforces the same thing on
  -- `groupmember`, and it is the constraint that stops a double booking
  -- becoming a double invoice.
  constraint enrolments_one_per_cohort unique (cohort_id, contact_id)
);

create index enrolments_cohort_idx  on public.enrolments (cohort_id);
create index enrolments_contact_idx on public.enrolments (contact_id);
create index enrolments_status_idx  on public.enrolments (status);

-- Enrolling makes someone a student on the shared spine, so they show up
-- correctly everywhere else in the app rather than only inside Academy.
create or replace function public.add_student_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contact_roles (contact_id, role)
  values (new.contact_id, 'student')
  on conflict do nothing;
  return new;
end;
$$;

create trigger enrolments_add_student_role
  after insert on public.enrolments
  for each row execute function public.add_student_role();

-- ---------------------------------------------------------------------------
-- 6. Entitlement from a settled invoice
-- ---------------------------------------------------------------------------
-- The join between Academy and Finance, and the reason neither candidate LMS
-- fitted: entitlement here is earned by a Ugandan VAT invoice settling under
-- 6% WHT, which `settle_invoice()` already computes as
-- received + withheld >= total. Rather than reimplement any of that, this
-- watches the document status that function already maintains.
--
-- An invoice is linked to an enrolment through the existing polymorphic
-- columns: documents.related_type = 'enrolment', related_id = <enrolment id>.
create or replace function public.sync_enrolment_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.related_type is distinct from 'enrolment' or new.related_id is null then
    return new;
  end if;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.enrolments
       set status = case when status in ('completed', 'dropped') then status else 'paid' end,
           entitled_at = coalesce(entitled_at, now())
     where id = new.related_id;

  elsif old.status = 'paid' and new.status is distinct from 'paid' then
    -- A reversed payment revokes access. Silently leaving someone entitled
    -- after their payment was undone is worse than the surprise of revoking:
    -- it means the one state the Academy is built around no longer reflects
    -- whether the money arrived. Completed enrolments keep their history.
    update public.enrolments
       set status = case when status in ('completed', 'dropped') then status else 'invoiced' end,
           entitled_at = null
     where id = new.related_id
       and status not in ('completed', 'dropped');
  end if;

  return new;
end;
$$;

create trigger documents_sync_enrolment_entitlement
  after update of status on public.documents
  for each row execute function public.sync_enrolment_entitlement();

-- Raising the invoice at all moves the enrolment off 'registered', so the
-- roster distinguishes "has a place" from "has been billed".
create or replace function public.mark_enrolment_invoiced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.related_type = 'enrolment' and new.related_id is not null and new.type = 'invoice' then
    update public.enrolments
       set status = 'invoiced'
     where id = new.related_id
       and status = 'registered';
  end if;
  return new;
end;
$$;

create trigger documents_mark_enrolment_invoiced
  after insert on public.documents
  for each row execute function public.mark_enrolment_invoiced();

-- ---------------------------------------------------------------------------
-- 7. Sessions and attendance
-- ---------------------------------------------------------------------------
-- The build plan sketched `enrolments.attendance jsonb`. TAKEN FROM
-- classroomio's `group_attendance(lesson_id, student_id, is_present)` instead:
-- one row per session per student.
--
-- A blob cannot answer "who missed session 3?" or "what is attendance across
-- the cohort?" without every caller parsing it, and it cannot be indexed or
-- constrained. Rows can.
create table public.cohort_sessions (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid not null references public.cohorts (id) on delete cascade,
  title        text not null,
  session_date date,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index cohort_sessions_cohort_idx on public.cohort_sessions (cohort_id, position);

create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.cohort_sessions (id) on delete cascade,
  enrolment_id uuid not null references public.enrolments (id) on delete cascade,
  is_present   boolean not null default false,
  noted_at     timestamptz not null default now(),
  noted_by     uuid references public.profiles (id) on delete set null,

  -- One mark per person per session; marking twice is a correction, not a
  -- second record.
  constraint attendance_one_per_session unique (session_id, enrolment_id)
);

create index attendance_enrolment_idx on public.attendance (enrolment_id);

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers
-- ---------------------------------------------------------------------------
create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();
create trigger cohorts_set_updated_at
  before update on public.cohorts
  for each row execute function public.set_updated_at();
create trigger enrolments_set_updated_at
  before update on public.enrolments
  for each row execute function public.set_updated_at();
create trigger cohort_sessions_set_updated_at
  before update on public.cohort_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Row level security — staff only, explicitly
-- ---------------------------------------------------------------------------
-- Every policy says `is_staff()` rather than `true`. Identical behaviour today;
-- the difference appears the day a student can log in.
alter table public.courses         enable row level security;
alter table public.cohorts         enable row level security;
alter table public.enrolments      enable row level security;
alter table public.cohort_sessions enable row level security;
alter table public.attendance      enable row level security;

create policy courses_select on public.courses
  for select to authenticated using (public.is_staff());
create policy courses_write on public.courses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy courses_delete on public.courses
  for delete to authenticated using (public.is_admin());

create policy cohorts_select on public.cohorts
  for select to authenticated using (public.is_staff());
create policy cohorts_write on public.cohorts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy cohorts_delete on public.cohorts
  for delete to authenticated using (public.is_admin());

create policy enrolments_select on public.enrolments
  for select to authenticated using (public.is_staff());
create policy enrolments_write on public.enrolments
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy enrolments_delete on public.enrolments
  for delete to authenticated using (public.is_admin());

-- Sessions and attendance are working records: staff may correct them freely,
-- including removing a session added in error.
create policy cohort_sessions_all on public.cohort_sessions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy attendance_all on public.attendance
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 10. Cohort roster view
-- ---------------------------------------------------------------------------
-- security_invoker so base-table RLS applies to the caller, and anon revoked.
-- A view without this runs as its owner and is a hole straight through RLS —
-- exactly the leak found in v_candidate_search on 9 Aug.
create view public.v_cohort_summary
with (security_invoker = on) as
  select
    c.id as cohort_id,
    count(e.id)::integer                                             as enrolled,
    count(e.id) filter (where e.entitled_at is not null)::integer    as entitled,
    count(e.id) filter (where e.status = 'registered')::integer      as unbilled,
    case
      when c.capacity is null then null
      else greatest(c.capacity - count(e.id), 0)::integer
    end                                                              as seats_left
  from public.cohorts c
  left join public.enrolments e on e.cohort_id = c.id
  group by c.id, c.capacity;

comment on view public.v_cohort_summary is
  'Per-cohort roster counts: enrolled, entitled (paid), unbilled, and seats left. Null seats_left means uncapped.';

revoke all on public.v_cohort_summary from anon;
grant select on public.v_cohort_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Designed for the portal (slice 3)
-- ---------------------------------------------------------------------------
-- Three choices here exist so the student portal does not force a rewrite:
--
--   * enrolments.contact_id — a student is a person on the shared spine, so a
--     portal login maps to a contact that already exists.
--   * entitlement as a state with entitled_at — "can this person see the
--     materials" is already answerable, and already driven by real money.
--   * is_staff() on every policy — student policies get added alongside these
--     rather than requiring each one to be reasoned about again.
--
-- Slice 2 adds lessons, progress and certificates (a separate table with
-- issued_at and expires_at, derived from courses.retake_interval_months —
-- taken from classroomio and frappe, both of which model certificates as
-- records with an expiry rather than as columns on the enrolment).

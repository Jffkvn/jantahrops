-- JantaHR Ops — the data spine.
--
-- Everything in the product traces back to two tables: organisations (one row
-- per company) and contacts (one row per person). A person who is a lead today,
-- a candidate next year and a course student after that is ONE contact row the
-- whole time — roles are a junction table, never a `type` column.
--
-- activities is the polymorphic timeline every module writes to. tasks is the
-- shared to-do list. Both are created here so later features attach to them
-- rather than reinventing them.

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------
create type public.contact_role as enum (
  'lead', 'candidate', 'student', 'client_contact', 'partner'
);

create type public.activity_type as enum (
  'note', 'call', 'email', 'whatsapp', 'meeting',
  'stage_change', 'document', 'payment', 'system'
);

create type public.task_priority as enum ('low', 'medium', 'high');
create type public.task_status   as enum ('open', 'done');

-- ---------------------------------------------------------------------------
-- organisations
-- ---------------------------------------------------------------------------
create table public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  industry    text,
  tin         text,
  country     text not null default 'UG',
  district    text,
  address     text,
  website     text,
  is_client   boolean not null default false,
  status      text not null default 'active',
  notes       text,
  owner_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index organisations_name_idx     on public.organisations (name);
create index organisations_is_client_idx on public.organisations (is_client);
create index organisations_owner_idx    on public.organisations (owner_id);

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text,
  phone_e164      text,
  whatsapp        text,
  organisation_id uuid references public.organisations (id) on delete set null,
  job_title       text,
  location        text,
  source          text,
  notes           text,
  owner_id        uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Identity guards. Email is matched case-insensitively; phone is stored in
-- normalised E.164 by the application (lib/phone.ts) before insert. Partial
-- indexes so multiple contacts may legitimately have NO email or phone.
create unique index contacts_email_unique
  on public.contacts (lower(email)) where email is not null;
create unique index contacts_phone_unique
  on public.contacts (phone_e164) where phone_e164 is not null;
create index contacts_organisation_idx on public.contacts (organisation_id);
create index contacts_owner_idx        on public.contacts (owner_id);

-- Full-text search over name, email and phone. A generated tsvector column
-- keeps the index maintenance in the database rather than the application.
alter table public.contacts
  add column search_tsv tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(full_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(phone_e164, '')
    )
  ) stored;
create index contacts_search_idx on public.contacts using gin (search_tsv);

-- ---------------------------------------------------------------------------
-- contact_roles — junction. One person can hold several roles at once.
-- ---------------------------------------------------------------------------
create table public.contact_roles (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  role       public.contact_role not null,
  since      timestamptz not null default now(),
  meta       jsonb not null default '{}',
  primary key (contact_id, role)
);

create index contact_roles_role_idx on public.contact_roles (role);

-- ---------------------------------------------------------------------------
-- activities — polymorphic timeline. subject_type is a free string
-- ('contact', 'organisation', 'lead', ...) so any module can attach without a
-- schema change; (subject_type, subject_id) is indexed for the timeline query.
-- ---------------------------------------------------------------------------
create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id   uuid not null,
  type         public.activity_type not null default 'note',
  body         text,
  meta         jsonb not null default '{}',
  occurred_at  timestamptz not null default now(),
  user_id      uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index activities_subject_idx
  on public.activities (subject_type, subject_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- tasks — shared to-do list, polymorphically linkable to any record.
-- ---------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  due_at       timestamptz,
  assignee_id  uuid references public.profiles (id) on delete set null,
  priority     public.task_priority not null default 'medium',
  status       public.task_status not null default 'open',
  related_type text,
  related_id   uuid,
  completed_at timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_status_idx   on public.tasks (status);
create index tasks_due_idx      on public.tasks (due_at);
create index tasks_related_idx  on public.tasks (related_type, related_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (set_updated_at() defined in the profiles migration)
-- ---------------------------------------------------------------------------
create trigger organisations_set_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- The team is two to four people who all work the same pipeline. Any signed-in
-- user may read and write; only an admin may delete. Anonymous users get
-- nothing (every policy is scoped `to authenticated`, RLS denies by default).
-- Per-record ownership lives in owner_id for assignment and filtering, not for
-- hiding rows from colleagues.
do $$
declare t text;
begin
  foreach t in array array[
    'organisations', 'contacts', 'contact_roles', 'activities', 'tasks'
  ]
  loop
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
  end loop;
end $$;

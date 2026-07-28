-- JantaHR Ops — profiles and access control
--
-- Apply by pasting into the Supabase SQL editor for project
-- qjsgqskigjqrzjftunhg, or with `supabase db push` once the project is linked.
--
-- Do NOT run this twice. It creates a type, a table, four functions, two
-- triggers and four policies. If it has already been applied, write a new
-- migration instead of editing or re-running this one.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- Three values, deliberately. There is no permissions framework and no roles
-- admin UI. `admin` may change roles and delete; everyone else may not.
create type public.user_role as enum ('admin', 'staff', 'intern');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  phone          text,
  role           public.user_role not null default 'staff',
  avatar_file_id uuid,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. Created automatically by on_auth_user_created; never inserted by the application.';

create index profiles_role_idx      on public.profiles (role);
create index profiles_is_active_idx on public.profiles (is_active);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Automatic profile creation
-- ---------------------------------------------------------------------------
-- Nothing in the application ever inserts into profiles, which is why there is
-- no INSERT policy below. security definer is required so the trigger can write
-- to public.profiles while running from an insert on auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Admin check
-- ---------------------------------------------------------------------------
-- IMPORTANT: security definer, so this bypasses RLS on profiles.
-- A policy on profiles that plainly SELECTs from profiles would re-trigger the
-- same policy and recurse infinitely. This helper is the standard escape hatch.
-- Do not inline this query into the policies below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Any signed-in user may read all profiles. Two to four colleagues who all need
-- to see who owns which lead; hiding them from each other would be theatre.
-- Anonymous users get nothing: every policy is scoped `to authenticated`, and
-- RLS denies by default.
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_delete_admin
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Column-level guard
-- ---------------------------------------------------------------------------
-- A policy grants or denies access to a ROW, not to a column. Without this
-- trigger any staff member could promote themselves to admin by updating their
-- own profile — which profiles_update_own explicitly permits them to do.
create or replace function public.enforce_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only an admin may change a profile role';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_role_change
  before update on public.profiles
  for each row execute function public.enforce_role_change();

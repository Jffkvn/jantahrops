-- Fix: `FOR ALL` silently granted DELETE to every staff member.
--
-- The academy migration paired a broad write policy with a narrow delete one:
--
--   create policy courses_write  on courses for all    using (is_staff());
--   create policy courses_delete on courses for delete using (is_admin());
--
-- Postgres RLS policies are PERMISSIVE by default, and permissive policies for
-- the same command are OR'd. `FOR ALL` covers DELETE, so the effective rule was
-- `is_staff() OR is_admin()` — which is just `is_staff()`. The admin-only
-- policy did nothing at all, and any colleague could delete a course, a cohort
-- and its whole roster, or an enrolment with its attendance history.
--
-- Caught by a live test asserting a staff delete leaves the row in place; it
-- type-checked perfectly and no unit test could have seen it.
--
-- The fix is to stop using FOR ALL where a narrower command is also policed,
-- and spell out each command — the shape the rest of the app already uses.

drop policy if exists courses_write    on public.courses;
drop policy if exists cohorts_write    on public.cohorts;
drop policy if exists enrolments_write on public.enrolments;

create policy courses_insert on public.courses
  for insert to authenticated with check (public.is_staff());
create policy courses_update on public.courses
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cohorts_insert on public.cohorts
  for insert to authenticated with check (public.is_staff());
create policy cohorts_update on public.cohorts
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy enrolments_insert on public.enrolments
  for insert to authenticated with check (public.is_staff());
create policy enrolments_update on public.enrolments
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- cohort_sessions and attendance keep their FOR ALL policies deliberately:
-- they are working records with no separate delete policy to be overridden, and
-- staff are meant to be able to remove a session added in error.

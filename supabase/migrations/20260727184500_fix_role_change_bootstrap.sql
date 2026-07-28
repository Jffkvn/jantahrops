-- Fix: enforce_role_change made the system impossible to bootstrap.
--
-- The service-role key bypasses RLS POLICIES but not TRIGGERS. is_admin()
-- resolves auth.uid() from the request JWT, which is NULL for a service-role
-- request, for the SQL editor, and for a migration. So the original trigger
-- refused every role change made from a trusted server-side context — including
-- the very first one, which is what promotes the first admin. There was no way
-- to create an admin at all.
--
-- The fix only relaxes the check when there is no end user in context
-- (auth.uid() is null). That is not a hole: every policy on profiles is scoped
-- `to authenticated`, so an anonymous request is rejected by RLS long before it
-- can reach this trigger. The only callers that arrive here with a null uid are
-- ones that already hold the service-role key or direct database access — and
-- anyone holding those can rewrite the table regardless of what this trigger
-- says.
--
-- Found by running the RLS suite against a real database. A mocked test would
-- have passed.

create or replace function public.enforce_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null          -- an end user is making this request
     and not public.is_admin() then
    raise exception 'only an admin may change a profile role';
  end if;
  return new;
end;
$$;

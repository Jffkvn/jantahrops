-- Close a data leak: every view in this schema was readable by `anon`.
--
-- A Postgres view runs as its OWNER by default, so row level security on the
-- base tables does not apply to whoever queries the view. Supabase also grants
-- default privileges on new objects in `public` to both `anon` and
-- `authenticated`. Together that means a view over an RLS-protected table is
-- an open door — and the anon key is shipped in the browser bundle, so the door
-- is open to anyone who loads the site.
--
-- Confirmed against the live project before this migration: an anonymous
-- client could read v_candidate_search in full — every candidate's name,
-- email, phone, headline and skills, roughly 2,000 people who sent us a CV in
-- confidence — and could enumerate contact ids through v_business_contacts.
--
-- `security_invoker = on` (PG15+) makes the view execute as the CALLER, so the
-- base tables' RLS applies normally. The explicit REVOKE is belt and braces:
-- even if a future view is created without security_invoker, anon has no grant.

alter view public.v_candidate_search  set (security_invoker = on);
alter view public.v_business_contacts set (security_invoker = on);
alter view public.v_invoice_balances  set (security_invoker = on);

revoke all on public.v_candidate_search  from anon;
revoke all on public.v_business_contacts from anon;
revoke all on public.v_invoice_balances  from anon;

grant select on public.v_candidate_search  to authenticated;
grant select on public.v_business_contacts to authenticated;
grant select on public.v_invoice_balances  to authenticated;

-- Stop the default grant from re-opening this for anything created later.
alter default privileges in schema public revoke all on tables from anon;

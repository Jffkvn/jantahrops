-- "Business contacts" — the default Contacts view.
--
-- A recruitment business deals with two different populations: candidates you
-- PLACE (searched by skill, moved through pipelines — that is the Talent Pool)
-- and contacts you SELL TO (an HR manager who signs an invoice). Both are one
-- row in `contacts` with roles attached, which is right for the data model, but
-- wrong for the UI: ~2,000 imported CVs drown the handful of people you
-- actually do business with.
--
-- This view is the filter. It returns every contact EXCEPT those whose only
-- role is `candidate`. Someone who is both a candidate and a client contact
-- stays — they are genuinely both. Contacts with no roles at all also stay
-- (a manually added person before any role is assigned).
--
-- Doing it in SQL rather than the client matters: the alternative was sending
-- thousands of ids in a URL, which breaks past a few hundred.

create or replace view public.v_business_contacts as
  select c.id
  from public.contacts c
  where not exists (
    select 1 from public.contact_roles r where r.contact_id = c.id
  )
  or exists (
    select 1 from public.contact_roles r
    where r.contact_id = c.id and r.role <> 'candidate'
  );

comment on view public.v_business_contacts is
  'Contact ids excluding candidate-only people. Backs the default Contacts list; the Talent Pool covers candidates.';

-- Views inherit RLS from their base tables, and contacts is already
-- authenticated-read. Grant so PostgREST can expose it.
grant select on public.v_business_contacts to authenticated;

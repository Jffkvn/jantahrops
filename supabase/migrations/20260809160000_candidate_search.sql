-- Talent Pool search — done in SQL, because the client could not do it at all.
--
-- The previous implementation resolved a name search by selecting matching
-- ids from `contacts` and then filtering `candidates.id` with them. Those are
-- different keys: a contact id never equals a candidate id, so searching the
-- Talent Pool by name returned nothing, every time. Verified against the live
-- data — "Michael" matched 14 contacts and produced 0 candidates.
--
-- Two further problems came with that shape, and both are fixed by moving the
-- work into the database:
--
--   * PostgREST caps any response at 1,000 rows, so the id list silently
--     truncated once the pool grew past that. It is already at ~2,000.
--   * Those ids were then sent back up as an `in.(...)` filter in a URL.
--     A few hundred UUIDs is already a very long URL; a few thousand is not
--     a request any server will accept.
--
-- The view joins the candidate to their contact and flattens everything
-- searchable into one lowercase column, so a single ILIKE covers name, email,
-- phone, headline and skills. At this scale (~2,000 rows) a sequential scan is
-- sub-millisecond; when it stops being, the index below is the place to look.

create or replace view public.v_candidate_search as
  select
    c.id,
    c.contact_id,
    c.owner_id,
    c.headline,
    c.skills,
    c.years_experience,
    c.availability,
    c.salary_expectation_ugx,
    c.is_available,
    c.needs_review,
    c.created_at,
    ct.full_name,
    lower(
      coalesce(ct.full_name, '') || ' ' ||
      coalesce(ct.email, '') || ' ' ||
      coalesce(ct.phone_e164, '') || ' ' ||
      coalesce(c.headline, '') || ' ' ||
      coalesce(array_to_string(c.skills, ' '), '')
    ) as search_text
  from public.candidates c
  left join public.contacts ct on ct.id = c.contact_id;

comment on view public.v_candidate_search is
  'Candidates joined to their contact with one flattened, lowercased search column. Backs Talent Pool search and paging; replaces a client-side id-list join that compared contact ids against candidate ids and so never matched.';

-- Trigram indexes: ILIKE '%term%' cannot use a btree, and this is the one
-- query on these tables that a person sits and waits for.
--
-- Name and headline are covered. Skills deliberately are not: `array_to_string`
-- is STABLE rather than IMMUTABLE, so Postgres refuses to index an expression
-- containing it, and the alternatives (a stored generated column, a trigger) buy
-- little at ~2,000 rows where a scan is around a millisecond. A skills-only term
-- therefore falls back to a sequential scan — the place to revisit if the pool
-- reaches five figures.
create extension if not exists pg_trgm;

create index if not exists candidates_headline_trgm
  on public.candidates
  using gin (lower(coalesce(headline, '')) gin_trgm_ops);

create index if not exists contacts_full_name_trgm
  on public.contacts
  using gin (lower(full_name) gin_trgm_ops);

-- Views inherit RLS from their base tables; candidates and contacts are both
-- already authenticated-read. Grant so PostgREST can expose the view.
grant select on public.v_candidate_search to authenticated;

-- JantaHR Ops — inbound web submissions log.
--
-- Every public form POST is recorded here first, keyed by an idempotency string
-- (lead_type + email + submitted_at). The unique constraint is what makes the
-- endpoint safe to call twice: a double-submit hits the same key and is turned
-- away without creating a second lead. It doubles as a raw audit log of exactly
-- what the website sent, and a per-IP rate-limit source.

create table public.web_submissions (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text not null unique,
  lead_type        text not null,
  payload          jsonb not null,
  contact_id       uuid references public.contacts (id) on delete set null,
  lead_id          uuid references public.leads (id) on delete set null,
  ip               text,
  created_at       timestamptz not null default now()
);

create index web_submissions_ip_idx      on public.web_submissions (ip, created_at desc);
create index web_submissions_created_idx on public.web_submissions (created_at desc);

-- RLS on. Only the service role (used by the Edge Function) writes here; that
-- role bypasses RLS entirely. Authenticated staff may READ the log for support.
-- No anon access, no client writes.
alter table public.web_submissions enable row level security;

create policy web_submissions_select_staff
  on public.web_submissions for select
  to authenticated
  using (true);

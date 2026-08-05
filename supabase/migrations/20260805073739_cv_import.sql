-- Bulk CV import support.
--
-- The one-off importer ingests ~3,600 email attachments into the talent pool.
-- Two things it needs that the live app does not:
--   1. a way to tag what came from a batch, so an import can be found (and, if
--      it goes wrong, unwound) without guessing from `source` text;
--   2. a way to flag records a human should glance at — name extraction from a
--      CV is ~2/3 accurate, so some rows land with a wrong or missing name.
--      Flagged rows still import: the CV itself is attached and is the truth.

alter table public.candidates
  add column import_batch  text,
  add column needs_review  boolean not null default false,
  add column review_reason text;

comment on column public.candidates.import_batch is
  'Batch id for bulk-imported candidates, e.g. cv-import-2026-08. Null for candidates created through the app or the public endpoint.';
comment on column public.candidates.needs_review is
  'True when the importer was not confident (no contact key, implausible name, thin text, possible duplicate). Filterable in the talent pool.';

-- Partial index: we only ever query for the ones needing attention.
create index candidates_needs_review_idx
  on public.candidates (needs_review) where needs_review;
create index candidates_import_batch_idx
  on public.candidates (import_batch) where import_batch is not null;

-- ---------------------------------------------------------------------------
-- Idempotency for the importer.
-- ---------------------------------------------------------------------------
-- Keyed on the SHA-256 of the file's BYTES, not its name: the same CV arrives
-- under different names ("CV.pdf", "Mail_Attachment.pdf"), and the corpus has
-- literal duplicates. Re-running the importer must skip what is already in.
create table public.cv_import_files (
  file_sha256   text primary key,
  original_name text not null,
  doc_type      text not null,              -- cv | cover_letter | certificate | ...
  candidate_id  uuid references public.candidates (id) on delete set null,
  contact_id    uuid references public.contacts (id) on delete set null,
  storage_path  text,                       -- in the private `candidates` bucket
  import_batch  text not null,
  imported_at   timestamptz not null default now()
);

create index cv_import_files_candidate_idx on public.cv_import_files (candidate_id);
create index cv_import_files_batch_idx     on public.cv_import_files (import_batch);

alter table public.cv_import_files enable row level security;
-- Staff may read the import log (support/debugging). Writes are service-role
-- only (the importer), which bypasses RLS — so no insert/update policy exists.
create policy cv_import_files_select on public.cv_import_files
  for select to authenticated using (true);

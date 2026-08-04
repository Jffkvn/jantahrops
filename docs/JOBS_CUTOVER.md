# JOBS_CUTOVER — pointing the JantaHR website at the Ops job board

The JantaHR website reads its job board from a configurable endpoint
(env `VITE_JOBS_ENDPOINT`) and falls back to a static `/data/jobs.json`. This
prompt makes Ops that endpoint.

## Endpoint

```
GET https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-jobs
```

- Anonymous, `--no-verify-jwt`, CORS, edge-cached 60s.
- Returns `{ "jobs": [ ... ] }` for vacancies where `is_public = true` AND
  `status = 'open'`, ordered by `published_at` desc.
- Never returns the client organisation, owner, internal notes, or any
  non-public vacancy. Salary fields are included only where the vacancy sets them.

## Set the website to use it

1. In the website repo, set `VITE_JOBS_ENDPOINT` to the URL above for the
   production build (wherever the other `VITE_` env vars are configured).
2. The website normalises a payload that is either `[...]` or `{ "jobs": [...] }`.
   Ops returns `{ "jobs": [...] }`, so it works as-is.

## Field-name verification (IMPORTANT)

The Ops endpoint maps each vacancy to the website's `Job` shape. Please confirm
these field names against the website's `src/data/jobs.ts` `Job` type and, if
they differ, adjust the mapping inside
`supabase/functions/public-jobs/index.ts` — do NOT change the API contract
without updating both sides.

| Ops vacancy column      | Public job field  |
|-------------------------|-------------------|
| slug                    | slug              |
| title                   | title             |
| location                | location          |
| employment_type         | employmentType    |
| summary                 | summary           |
| description             | description       |
| requirements            | requirements      |
| salary_min_ugx          | salaryMin         |
| salary_max_ugx          | salaryMax         |
| published_at            | postedAt          |
| closes_at               | closesAt          |

## Cutover note

- Keep the static `jobs.json` as the fallback until Ops is trusted — the
  website's `VITE_JOBS_ENDPOINT` fallback already handles this.
- Verify the board renders against the live data and that draft/private
  vacancies never appear.

## Acceptance (already verified, 2026-08-03)

- `public-jobs` returns an open + public vacancy and hides draft/private ones.
- The returned job object has no `organisation_id` / `owner_id` / internal fields.
- Deploy: `supabase functions deploy public-jobs --no-verify-jwt`.
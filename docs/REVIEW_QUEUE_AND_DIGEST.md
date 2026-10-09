# "New from the website" queue and the morning digest

## New from the website (Today page)

Every lead, job application and talent-pool sign-up that arrives through
jantahr.com starts **unreviewed** (`reviewed_at` is null) and is listed at the
top of Today. Open an item to work on it, then press ✓ to mark it reviewed, or
"Mark all reviewed". The section disappears when the queue is empty.

- Records created inside Ops by a signed-in person, and candidates created by
  the bulk CV importer, are reviewed automatically (database triggers).
- Marking an application reviewed also marks the applicant's candidate profile.
- Someone who signs up to the talent pool again (for example with a new CV)
  goes back into the queue.
- Migration: `supabase/migrations/20261009170000_review_queue_and_digest.sql`.

## Morning digest email

At **07:30 Kampala time, Monday to Saturday**, every active team member gets one
email from `JantaHR Ops <no-reply@jantahr.com>` listing:

- website submissions waiting in the review queue
- follow-ups due today or overdue
- open tasks due today or overdue
- issued invoices past their due date

On a morning with nothing to report, nothing is sent. Recipients are active
profiles with an email (Settings → Team). Set `DIGEST_TO` (comma-separated) as a
Supabase secret to override. The greeting uses the first name from the
person's profile.

How it runs: `pg_cron` job `daily-digest` → `net.http_post` → edge function
`daily-digest` (deployed `--no-verify-jwt`). The request carries the header
`x-digest-secret`, read from Supabase Vault (`digest_cron_secret`) and checked
against the function secret `DIGEST_CRON_SECRET`. Sent through Resend (counts
toward the free plan's 100 emails a day).

### Checking or testing it

```bash
# Is it scheduled?
supabase db query --linked "select schedule, active from cron.job where jobname = 'daily-digest';"

# Last run's result (pg_net keeps responses for a few hours)
supabase db query --linked "select created, status_code, content from net._http_response order by created desc limit 3;"
```

A preview without sending: POST `{"dryRun": true}` to the function with the
secret header. To rotate the secret, update both the function secret and the
Vault entry (`vault.update_secret`).

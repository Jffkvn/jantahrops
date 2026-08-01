# Website → Ops cutover: the public lead endpoint

The JantaHR website's AI-training registration form already POSTs a structured
payload to a configurable endpoint. Ops now **is** a valid endpoint for it. This
is the switch, and how to do it with zero risk.

## The endpoint

```
POST https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads
```

- Accepts the website's existing payload verbatim (no website code change).
- Returns `{"ok": true}` or `{"ok": false, "error": "..."}` — the exact shape
  `src/services/aiTrainingRegistration.ts` already parses.
- **No auth header required.** The function is deployed `--no-verify-jwt`, so the
  website's plain `fetch` (Content-Type only, no Authorization) works as-is —
  verified. The endpoint is the guard, not a JWT.

## What it does on each submission

Honeypot check → find-or-create organisation → find-or-create contact (match on
email, then phone) → attach the `lead` role → create a lead in stage `new` →
write the applicant's message as the first timeline note. Idempotent on
`leadType + email/phone + submittedAt`, rate-limited per IP, 10 KB body cap.

## The switch (website side)

In the website's environment (`.env` / Netlify env), set:

```
VITE_AI_TRAINING_REGISTRATION_ENDPOINT=https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads
```

Redeploy the website. That is the entire change.

## Zero-risk cutover: dual-write first

Do **not** switch the Google Apps Script off on day one. For the first few weeks:

1. Keep the existing Apps Script writing to the Google Sheet **and** sending the
   email notifications you rely on today.
2. Point the website env var at the Ops endpoint (above). Now leads flow into
   Ops as well.
3. For a week, compare: every sheet row should have a matching lead in Ops. If
   one is missing, check the Supabase Edge Function logs
   (`supabase functions logs public-leads`).
4. Once you trust Ops, retire the sheet write. Until Ops has its own email
   reminders (Phase 1, later slice), you may want to keep the Apps Script email
   notification running so you still get alerted on a new lead.

> If the website can only post to ONE endpoint, keep it on the Apps Script and
> have the Apps Script forward a copy to the Ops endpoint — a two-line `fetch`
> in the script's `doPost`. That gives dual-write without touching the site.

## Verifying it works

```bash
curl -s -X POST \
  "https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads" \
  -H "Content-Type: application/json" \
  -d '{"leadType":"ai_training","fullName":"Test Person","email":"test@example.com","phone":"0772000000","trainingUnit":"AI for HR teams","honeypot":"","submittedAt":"2026-08-01T10:00:00Z"}'
# → {"ok":true}
```

Then open Ops → Leads: the lead appears in the "New" column, and on the Today
view if you set a follow-up. Delete the test lead afterward.

## Locking down CORS (optional, later)

The function currently reflects any origin (fine — it is write-only and carries
no credentials). To restrict it to the production site, set a function secret:

```
supabase secrets set PUBLIC_LEADS_ALLOWED_ORIGIN=https://<your-site-domain>
```

## Redeploying the function

```bash
SUPABASE_ACCESS_TOKEN=<token> \
  supabase functions deploy public-leads --project-ref qjsgqskigjqrzjftunhg --no-verify-jwt
```

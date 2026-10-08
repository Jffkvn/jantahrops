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

## Lead alert and mailer flow: website → Ops → Apps Script

The website posts directly to Ops. Ops saves the lead and immediately forwards a copy to the Google Apps Script webhook, which sends the email alert:

```
website form → Ops public-leads (saves lead) → Apps Script (emails hello@jantahr.com, optional Sheet row)
```

1. **Ops configuration**:
   Two Supabase secrets must be configured on the `public-leads` Edge Function:
   - `LEAD_ALERT_WEBHOOK_URL`: The Apps Script web app URL (`.../exec`).
   - `LEAD_ALERT_SECRET`: A shared random secret matching the Apps Script property.

2. **Apps Script configuration**:
   Two Script Properties must be set in the Google Apps Script project settings:
   - `OPS_ALERT_SECRET`: Shared secret matching Ops.
   - `ALERT_TO`: Destination email address (`hello@jantahr.com`).

3. **Google Sheet persistence**:
   Writing to the Google Sheet is now **optional**. The Apps Script appends a row as a secondary backup, but JantaHR Ops is the primary system of record for all lead pipelines and follow-ups. If the mailer or Sheet write fails, the lead is already securely recorded in Ops.

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

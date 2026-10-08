# Website → Ops Cutover & Lead Alerting Architecture

This document describes the complete flow, architecture, and configuration for handling website lead registrations (e.g. AI Training registrations) and forwarding team email alerts.

---

## 1. Architectural Overview

Previously, the website form on `https://www.jantahr.com/ai-training` attempted to submit directly to Google Apps Script (`script.google.com`). Because strict Content Security Policies (CSP) blocked calls to Google scripts from the browser, submissions failed.

The new architecture decouples the browser from Google Apps Script by introducing JantaHR Ops as the backend hub:

```
┌─────────────────────────────────┐
│ Browser Form                    │
│ https://www.jantahr.com/ai-training
└───────────────┬─────────────────┘
                │ 1. POST JSON (no auth required)
                ▼
┌─────────────────────────────────────────────────────────┐
│ JantaHR Ops Edge Function                               │
│ POST .../functions/v1/public-leads                     │
│  - Honeypot check & 10 KB body cap                      │
│  - Contacts & Organisations find-or-create              │
│  - Creates lead in stage 'new'                          │
│  - Stores raw payload in web_submissions (audit trail)  │
└───────────────┬─────────────────────────────────────────┘
                │ 2. EdgeRuntime.waitUntil (async, non-blocking)
                ▼
┌─────────────────────────────────────────────────────────┐
│ Google Apps Script Webhook                              │
│ POST .../macros/s/.../exec                              │
│  - Validates shared secret (OPS_ALERT_SECRET)           │
│  - Formats plain text email (prevents HTML injection)   │
│  - Sends email via GmailApp.sendEmail                   │
│  - Destination: hello@jantahr.com (ALERT_TO)            │
│  - Reply-To set to candidate's email address            │
│  - Appends secondary backup row to Google Sheet         │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Component Configuration

### A. JantaHR Website (`Review jantahr website`)

1. **Client Code**:
   - [`src/lib/constants.ts`](file:///Users/jeffadhaya/Documents/Zcode/Review%20jantahr%20website/src/lib/constants.ts):
     `DEFAULT_AI_TRAINING_REGISTRATION_ENDPOINT` defaults to `https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads`.
     Includes a safety guard: if an environment variable accidentally points to `script.google.com`, it automatically falls back to Ops.
   - [`src/pages/AiTraining.tsx`](file:///Users/jeffadhaya/Documents/Zcode/Review%20jantahr%20website/src/pages/AiTraining.tsx):
     Always sends clean `application/json` payload with zero custom headers.
2. **Netlify Environment Variable**:
   - `VITE_AI_TRAINING_REGISTRATION_ENDPOINT` = `https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads`
   - Set in Netlify Site Configuration → Environment Variables (All deploys).
   - Deployed without cache.
3. **Commit**: `959198c` (`fix(ai-training): send registrations to JantaHR Ops instead of Apps Script`).

---

### B. JantaHR Ops Backend (`JantaHR OPs`)

1. **Edge Function**:
   - [`supabase/functions/public-leads/index.ts`](file:///Users/jeffadhaya/Documents/Anti%20gravity%20Projects/JantaHR%20OPs/supabase/functions/public-leads/index.ts)
   - Function Name: `public-leads`
   - Deployed with `--no-verify-jwt` so browsers can submit without authentication tokens.
2. **Supabase Secrets** (`project-ref: qjsgqskigjqrzjftunhg`):
   - `LEAD_ALERT_WEBHOOK_URL`: Google Apps Script Web App URL (`https://script.google.com/macros/s/AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH/exec`).
   - `LEAD_ALERT_SECRET`: Shared secret matching `OPS_ALERT_SECRET` in Apps Script.
3. **Async Dispatching**:
   - Dispatched immediately before returning `{ ok: true }` using `EdgeRuntime.waitUntil(sendLeadAlert(payload, leadType))`.
   - Timeout: 8 seconds (`AbortController`).
   - Error handling: Non-throwing (never breaks user submission if external mailer is slow or down).
4. **Commits**:
   - `764ebdb`: Pre-requisite docs & prompt addition.
   - `687c97f`: `feat(public-leads): email the team via Apps Script when a website lead arrives`.

---

### C. Google Apps Script Mailer ("AI Training Leads")

1. **Project & Deployment**:
   - Deployment ID: `AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH`
   - Active Version: Version 12
   - Execute as: `Me`
   - Who has access: `Anyone`
2. **Script Properties** (Project Settings → Script Properties):
   - `OPS_ALERT_SECRET`: Shared random secret matching `LEAD_ALERT_SECRET` in Supabase.
   - `ALERT_TO`: Destination email address (`hello@jantahr.com`).
3. **Script Implementation** (`Code.gs`):
   - **Routing**: `doPost` inspects incoming body:
     ```javascript
     function doPost(e) {
       var data = null;
       try { data = JSON.parse(e.postData.contents); } catch (err) {}
       if (data && data.source === 'jantahr-ops') return handleOpsAlert_(data);
       // ... existing legacy form submission flow ...
     }
     ```
   - **`handleOpsAlert_(data)`**:
     - Secret validation against `OPS_ALERT_SECRET`.
     - Uses **`GmailApp.sendEmail`** instead of `MailApp.sendEmail` (uses existing authorized Gmail OAuth scopes; avoids authorization errors).
     - Sends plain-text email with `Reply-To` set to the candidate's email (`options.replyTo = l.email`).
     - Appends backup row to Google Sheet tab `"AI Training Leads"`.
     - Returns `ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON)`.

---

## 3. Deployment & Maintenance Runbook

### How to redeploy the Ops Edge Function:

```bash
supabase functions deploy public-leads --project-ref qjsgqskigjqrzjftunhg --no-verify-jwt
```

### How to update secrets on Ops:

```bash
supabase secrets set --project-ref qjsgqskigjqrzjftunhg \
  LEAD_ALERT_WEBHOOK_URL="https://script.google.com/macros/s/AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH/exec" \
  LEAD_ALERT_SECRET="<secret-value>"
```

### How to test the mailer directly from CLI:

```bash
curl -i -X POST \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"source":"jantahr-ops","secret":"<secret-value>","lead":{"leadType":"ai_training","fullName":"Test Lead","email":"candidate@example.com","phone":"0772000000","organization":"Test Org","trainingUnit":"AI Awareness","message":"Test message","sourcePage":"/ai-training","submittedAt":"2026-10-08T15:00:00Z"}}' \
  "https://script.google.com/macros/s/AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH/exec"
```
*Expected response: HTTP 302 redirect with `{"ok":true}` at the echo location.*

---

## 4. Troubleshooting Log & Key Learnings

1. **CSP (Content Security Policy) Violations**:
   - The browser cannot send requests to `script.google.com` due to website CSP rules.
   - **Solution**: The website must only communicate with `qjsgqskigjqrzjftunhg.supabase.co`. All Google services are contacted server-side by the Edge Function.
2. **Supabase CLI Authorization**:
   - When deploying Edge Functions or setting secrets, the CLI must be authenticated as the account owning `qjsgqskigjqrzjftunhg` (`theagency256@gmail.com`). Use `npx supabase login` to switch accounts.
3. **Google Apps Script `MailApp` vs `GmailApp`**:
   - Calling `MailApp.sendEmail` without interactive scope authorization produces: `Exception: Specified permissions are not sufficient to call MailApp.sendEmail`.
   - `GmailApp.sendEmail(targetEmail, subject, body, options)` is already authorized under the project's Gmail scopes and delivers reliably.
4. **Google Apps Script Deployment URL Preservation**:
   - Always choose **Manage deployments → Edit (pencil icon) → Version: New version** to update the existing deployment.
   - Do **not** click "New deployment", as that generates a different deployment ID and URL.

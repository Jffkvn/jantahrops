# Website → Ops Cutover & Alerting Architecture (Leads & Candidates)

This document describes the complete flow, architecture, configuration, and verification for handling website submissions (AI Training registrations, job applications, and talent pool signups) and forwarding team email alerts.

---

## 1. Architectural Overview

Previously, forms on the website attempted to submit directly to Google Apps Script (`script.google.com`). Because strict Content Security Policies (CSP) blocked calls to Google scripts from the browser, submissions failed.

The system now decouples the browser from Google Apps Script by using JantaHR Ops as the backend hub:

```
┌───────────────────────────────────────────────┐
│ Browser Form (jantahr.com)                    │
│ • /ai-training (AI Training Form)             │
│ • /jobs (Job Applications & Talent Pool)      │
└───────────────────────┬───────────────────────┘
                        │ 1. POST JSON (no auth required)
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ JantaHR Ops Edge Functions                                    │
│ • POST .../functions/v1/public-leads                          │
│ • POST .../functions/v1/public-candidates                     │
│                                                               │
│ Core Processing:                                              │
│  - Honeypot check & 10 KB body cap                            │
│  - Contacts / Organisations / Candidates find-or-create       │
│  - Links vacancy applications or talent pool records          │
│  - Writes notes to application or candidate timeline          │
│  - Stores raw payload in web_submissions (audit trail)        │
└───────────────────────┬───────────────────────────────────────┘
                        │ 2. runAfterResponse (async via EdgeRuntime.waitUntil)
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ Google Apps Script Webhook                                    │
│ POST .../macros/s/AKfycbzQsiRS.../exec                        │
│                                                               │
│ Routing & Dispatch:                                           │
│  - Validates shared secret (OPS_ALERT_SECRET)                 │
│  - If kind === 'notify' -> handleOpsNotify_ (Candidates)      │
│  - Else -> handleOpsAlert_ (AI Training Leads)                │
│  - Plain-text email via GmailApp.sendEmail                    │
│  - Destination: hello@jantahr.com (ALERT_TO)                  │
│  - Reply-To set to candidate/lead's email                     │
│  - Appends secondary backup row to Google Sheet (leads only)  │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Component Configuration

### A. JantaHR Website (`Review jantahr website`)

1. **Client Code**:
   - [`src/lib/constants.ts`](file:///Users/jeffadhaya/Documents/Zcode/Review%20jantahr%20website/src/lib/constants.ts):
     `DEFAULT_AI_TRAINING_REGISTRATION_ENDPOINT` defaults to `https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads`.
     Includes a safety guard: if an environment variable accidentally points to `script.google.com`, it automatically falls back to Ops.
   - [`src/pages/AiTraining.tsx`](file:///Users/jeffadhaya/Documents/Zcode/Review%20jantahr%20website/src/pages/AiTraining.tsx):
     Sends clean `application/json` payload with zero custom headers.
   - [`src/pages/Jobs.tsx`](file:///Users/jeffadhaya/Documents/Zcode/Review%20jantahr%20website/src/pages/Jobs.tsx):
     Submits candidate applications and talent pool signups to `public-candidates`.
2. **Netlify Environment Variable**:
   - `VITE_AI_TRAINING_REGISTRATION_ENDPOINT` = `https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads`
   - Set in Netlify Site Configuration → Environment Variables (All deploys).
3. **Commit**: `959198c` (`fix(ai-training): send registrations to JantaHR Ops instead of Apps Script`).

---

### B. JantaHR Ops Backend (`JantaHR OPs`)

1. **Edge Functions**:
   - [`supabase/functions/public-leads/index.ts`](file:///Users/jeffadhaya/Documents/Anti%20gravity%20Projects/JantaHR%20OPs/supabase/functions/public-leads/index.ts): Handles sales/training leads.
   - [`supabase/functions/public-candidates/index.ts`](file:///Users/jeffadhaya/Documents/Anti%20gravity%20Projects/JantaHR%20OPs/supabase/functions/public-candidates/index.ts): Handles job applications & talent pool.
   - Both deployed `--no-verify-jwt` so browsers can submit without authentication tokens.
2. **Shared Modules** (`supabase/functions/_shared/`):
   - [`mailer.ts`](file:///Users/jeffadhaya/Documents/Anti%20gravity%20Projects/JantaHR%20OPs/supabase/functions/_shared/mailer.ts): Centralized mailer helper providing `sendLeadAlert`, `sendNotification`, and `runAfterResponse`. Inspects Apps Script response body (verifies `{"ok":true}`).
   - [`candidate-alert.ts`](file:///Users/jeffadhaya/Documents/Anti%20gravity%20Projects/JantaHR%20OPs/supabase/functions/_shared/candidate-alert.ts): Formats candidate alerts with screening question/answer pairs, skills, availability, and cover letters. Tested via Deno (`deno test supabase/functions/_shared/`).
3. **Supabase Secrets** (`project-ref: qjsgqskigjqrzjftunhg`):
   - `LEAD_ALERT_WEBHOOK_URL`: Google Apps Script Web App URL (`https://script.google.com/macros/s/AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH/exec`).
   - `LEAD_ALERT_SECRET`: Shared secret matching `OPS_ALERT_SECRET` in Apps Script.
   - `OPS_NOTIFY_ENABLED`: Set to `true` to enable generic notify messages (candidate alerts).
4. **Commits**:
   - `687c97f`: `feat(public-leads): email the team via Apps Script when a website lead arrives`.
   - `d1a4531`: `feat(public-candidates): email the team when a candidate applies or joins the talent pool`.

---

### C. Google Apps Script Mailer ("AI Training Leads")

1. **Project & Deployment**:
   - Deployment ID: `AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH`
   - Active Version: Version 13
   - Execute as: `Me`
   - Who has access: `Anyone`
2. **Script Properties** (Project Settings → Script Properties):
   - `OPS_ALERT_SECRET`: Shared random secret matching `LEAD_ALERT_SECRET` in Supabase.
   - `ALERT_TO`: Destination email address (`hello@jantahr.com`).
3. **Script Implementation** (`Code.gs`):
   - **Routing**: `doPost` routes between `handleOpsNotify_` (for candidate applications/alerts) and `handleOpsAlert_` (for AI training leads):
     ```javascript
     function doPost(e) {
       var data = null;
       try { data = JSON.parse(e.postData.contents); } catch (err) {}
       if (data && data.source === 'jantahr-ops') {
         return data.kind === 'notify' ? handleOpsNotify_(data) : handleOpsAlert_(data);
       }
       // ... existing legacy form submission flow ...
     }
     ```
   - **`handleOpsAlert_(data)`**: Formats lead notification, sends via `GmailApp.sendEmail`, appends backup row to Google Sheet tab `"AI Training Leads"`.
   - **`handleOpsNotify_(data)`**: Generic notify handler sending verbatim plain-text messages with `Reply-To` set to candidate. No Sheet row is written for candidates.

---

## 3. Candidate Alert Rules (`public-candidates`)

When someone applies for a job or joins the talent pool on the website, Ops saves the candidate first, then emails the team through Apps Script:

1. **Alert Contents**:
   - Full name, email, phone, headline, years of experience, salary expectation, availability, skills, CV upload indicator.
   - Vacancy's custom screening questions paired with candidate answers.
   - Cover letter / notes.
   - `Reply-To` set to the candidate's email.
2. **Three Application Scenarios**:
   - **Application to Open Public Vacancy**: Application created under vacancy pipeline; email subject: `New application: <Name> — <Job Title>`.
   - **General Talent Pool** (slug `general-talent-pool` or none): Added to talent pool; email subject: `New talent pool registration: <Name>`.
   - **Application to Closed/Unavailable Vacancy**: Added to talent pool; flagged in subject line: `New candidate (vacancy closed): <Name> — <Slug>`.
   - **Repeat Applications**: A repeat application to the exact same vacancy sends nothing to prevent duplicate spam.
3. **Timeline Notes Fallback**:
   - In Ops, notes belong to an application record. When there is no application (e.g. general talent pool registration), notes are written directly to the candidate's timeline (`activities` table) so cover notes, country, and LinkedIn URLs are never lost.

---

## 4. Production Verification History

### Verification 1: AI Training Leads (`public-leads`)
* **Test Date**: 8 October 2026
* **Form URL**: `https://www.jantahr.com/ai-training`
* **Result**:
  - Website displayed success confirmation with 0 CSP errors.
  - Lead recorded in Ops `leads` (`stage: 'new'`, interest: `AI Awareness and Workplace Readiness`).
  - Web submission recorded in `web_submissions`.
  - Email delivered to `hello@jantahr.com` from `JantaHR Website`.

### Verification 2: Candidate Alerts (`public-candidates`)
* **Test Date**: 9 October 2026
* **Test Address**: `adhayajeff@gmail.com` (Candidate: *Freelance Product*)
* **Result**:
  - Candidate profile updated with headline `Test candidate`.
  - Timeline activity created in Ops with note:  
    *"Registered on the website. Added to the talent pool.\n\nAutomated test of candidate alerts"*
  - Candidate visible in Ops interface under **Delivery > Talent Pool**.
  - Email delivered to `hello@jantahr.com` with subject:  
    `New talent pool registration: TEST - please ignore`

---

## 5. Maintenance Runbook

### How to redeploy Edge Functions:

```bash
# Redeploy Leads Function
supabase functions deploy public-leads --project-ref qjsgqskigjqrzjftunhg --no-verify-jwt

# Redeploy Candidates Function
supabase functions deploy public-candidates --project-ref qjsgqskigjqrzjftunhg --no-verify-jwt
```

### How to update or verify secrets:

```bash
# View active secrets (hashes only)
supabase secrets list --project-ref qjsgqskigjqrzjftunhg

# Set or update secrets
supabase secrets set --project-ref qjsgqskigjqrzjftunhg \
  LEAD_ALERT_WEBHOOK_URL="https://script.google.com/macros/s/AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH/exec" \
  LEAD_ALERT_SECRET="<secret-value>" \
  OPS_NOTIFY_ENABLED=true
```

### How to run test suites:

```bash
# Test shared mailer & candidate alert formatting (Deno)
deno test supabase/functions/_shared/

# Test entire Ops application (Vitest + Lint + Typecheck)
npm run check
```

---

## 6. Troubleshooting Log & Key Learnings

1. **CSP (Content Security Policy) Violations**:
   - The browser cannot send requests to `script.google.com` due to website CSP rules.
   - **Solution**: The website must only communicate with `qjsgqskigjqrzjftunhg.supabase.co`. All Google services are contacted server-side by the Edge Functions.
2. **Supabase CLI Authorization**:
   - When deploying Edge Functions or setting secrets, the CLI must be authenticated as the account owning `qjsgqskigjqrzjftunhg` (`theagency256@gmail.com`). Use `npx supabase login` to switch accounts.
3. **Google Apps Script `MailApp` vs `GmailApp`**:
   - Calling `MailApp.sendEmail` without interactive scope authorization produces: `Exception: Specified permissions are not sufficient to call MailApp.sendEmail`.
   - `GmailApp.sendEmail(targetEmail, subject, body, options)` is already authorized under the project's Gmail scopes and delivers reliably.
4. **Google Apps Script Deployment URL Preservation**:
   - Always choose **Manage deployments → Edit (pencil icon) → Version: New version** to update the existing deployment.
   - Do **not** click "New deployment", as that generates a different deployment ID and URL.

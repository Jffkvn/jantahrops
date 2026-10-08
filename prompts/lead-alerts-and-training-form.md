# Fix the AI training form and add free email alerts for new leads

You are working across two repos and three web dashboards. Use the browser for
the dashboards. When a page asks for a login, **stop and ask me to log in** — never
type a password yourself. Do the parts in order and report back after each part.

## Background (already verified, do not re-investigate)

- The live form at `https://www.jantahr.com/ai-training` is broken. The site's
  Content Security Policy blocks `script.google.com`, so every registration since
  ~29 Sep fails and nothing is saved.
- The live bundle was built with `VITE_AI_TRAINING_REGISTRATION_ENDPOINT` set to a
  Google Apps Script URL in **Netlify's environment variables**. Code fallbacks
  alone will not fix it.
- JantaHR Ops already has a working lead endpoint that accepts the form's payload
  as-is and allows both `jantahr.com` and `www.jantahr.com`:
  `https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads`
- `*.supabase.co` is already allowed by the site's CSP. **Do not change the CSP.**
- Ops sends no email. We will NOT pay for an email provider. Instead the existing
  Google Apps Script becomes the free mailer: Ops saves the lead first, then
  forwards it to the Apps Script, which emails the team.

Target flow:

```
website form → Ops public-leads (saves lead) → Apps Script (emails hello@jantahr.com, optional Sheet row)
```

If the email step fails, the lead must still be saved and the website must still
get `{"ok": true}`.

## Repos

- Website: `/Users/jeffadhaya/Documents/Zcode/Review jantahr website` (branch `main`,
  GitHub `Jffkvn/jantahr-website`, deployed by Netlify)
- Ops: `/Users/jeffadhaya/Documents/Anti gravity Projects/JantaHR OPs` (branch
  `main`, Supabase project ref `qjsgqskigjqrzjftunhg`, Supabase CLI is installed
  and linked)

The Ops repo has two uncommitted doc changes from another session
(`docs/WHATSAPP_REMINDERS.md`, `JANTAHR_OPS_BUILD_PLAN.md`, and this prompt file).
Do not revert them. Commit them on their own first:
`docs: shelve WhatsApp reminders; add lead-alert prompt`.

---

## Part 1 — Website: point the form at Ops (do this first, it stops the leak)

1. `src/lib/constants.ts`: replace the `AI_TRAINING_ENDPOINT` export with a guard
   that ignores any Google Apps Script URL and defaults to Ops:

   ```ts
   const OPS_LEADS_ENDPOINT =
     'https://qjsgqskigjqrzjftunhg.supabase.co/functions/v1/public-leads'
   const configuredTrainingEndpoint =
     import.meta.env.VITE_AI_TRAINING_REGISTRATION_ENDPOINT?.trim()

   // The site's CSP blocks script.google.com, so an Apps Script URL here can never work.
   export const AI_TRAINING_ENDPOINT =
     configuredTrainingEndpoint && !configuredTrainingEndpoint.includes('script.google.com')
       ? configuredTrainingEndpoint
       : OPS_LEADS_ENDPOINT
   ```

2. `src/pages/AiTraining.tsx`: remove the `isAppsScript` check and always send
   `Content-Type: application/json`. Leave the payload exactly as it is. The
   `mailto:` fallback branch can stay.
3. Update `.env.example` so the comment for `VITE_AI_TRAINING_REGISTRATION_ENDPOINT`
   says it is the Ops `public-leads` endpoint, not Apps Script.
4. Run the website's typecheck, lint and build. All must pass.
5. Commit: `fix(ai-training): send registrations to JantaHR Ops instead of Apps Script`
   and push to `main`.
6. **Netlify (browser):** open `https://app.netlify.com`, find the jantahr.com
   site → Site configuration → Environment variables. Change
   `VITE_AI_TRAINING_REGISTRATION_ENDPOINT` to the Ops endpoint above (or delete
   it). Do not touch other variables. Then Deploys → confirm the build from step 5
   ran **after** the variable change; if not, trigger "Clear cache and deploy site".
7. Verify the deploy, without submitting the form yet:
   ```bash
   html=$(curl -sL https://www.jantahr.com); for js in $(echo "$html" | grep -oE '/assets/[^"]+\.js' | sort -u); do curl -sL "https://www.jantahr.com$js" | grep -oE 'script\.google\.com|functions/v1/public-leads' ; done | sort -u
   ```
   Expected: `functions/v1/public-leads` present, `script.google.com` absent.

Report back before Part 2.

## Part 2 — Apps Script: become the mailer

1. Generate a shared secret locally and keep it out of chat, git and docs:
   `openssl rand -hex 24`
2. **Browser:** open `https://script.google.com/home`. Find the project whose web
   app deployment ID is
   `AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH`
   (check each likely project under Deploy → Manage deployments). If you can't
   find it, ask me.
3. **Read the existing `doPost` first and tell me what it does** (which Sheet it
   writes to, who it emails). Keep that behaviour.
4. Project Settings → Script Properties: add
   - `OPS_ALERT_SECRET` = the secret from step 1
   - `ALERT_TO` = `hello@jantahr.com` (ask me if a different inbox should get alerts)
5. Add an Ops branch at the very top of `doPost`, plus a handler. Adapt names to
   the existing code, but keep this logic:

   ```js
   function doPost(e) {
     var data = null;
     try { data = JSON.parse(e.postData.contents); } catch (err) {}
     if (data && data.source === 'jantahr-ops') return handleOpsAlert_(data);
     // ...existing website handling stays below, unchanged...
   }

   function handleOpsAlert_(data) {
     var props = PropertiesService.getScriptProperties();
     var out = function (obj) {
       return ContentService.createTextOutput(JSON.stringify(obj))
         .setMimeType(ContentService.MimeType.JSON);
     };
     if (!data.secret || data.secret !== props.getProperty('OPS_ALERT_SECRET')) {
       return out({ ok: false });
     }
     var l = data.lead || {};
     var body = [
       'New ' + (l.leadType || 'website') + ' lead in JantaHR Ops',
       '',
       'Name: ' + (l.fullName || ''),
       'Email: ' + (l.email || ''),
       'Phone: ' + (l.phone || ''),
       'Organisation: ' + (l.organization || ''),
       'Interest: ' + (l.trainingUnit || ''),
       'Page: ' + (l.sourcePage || ''),
       'Submitted: ' + (l.submittedAt || ''),
       '',
       'Message:',
       l.message || '(none)',
       '',
       'Open JantaHR Ops → Leads to follow up.'
     ].join('\n');
     var options = { to: props.getProperty('ALERT_TO') || 'hello@jantahr.com',
                     subject: 'New lead: ' + (l.fullName || 'Website') + ' — ' + (l.trainingUnit || l.leadType || 'enquiry'),
                     body: body };
     if (l.email) options.replyTo = l.email;
     MailApp.sendEmail(options);
     // Optional: if the existing script appends to a Sheet, append the same row here too.
     return out({ ok: true });
   }
   ```

   Plain-text email only (no `htmlBody`), so submitted text can't inject HTML.
6. Deploy → Manage deployments → edit the **existing** web app deployment →
   Version: New version → Deploy. Do **not** create a new deployment, so the URL
   stays the same. Keep "Execute as: Me" and "Who has access: Anyone". Approve
   the MailApp permission prompt if Google asks (ask me to click through if it
   needs my account).

## Part 3 — Ops: forward each new lead to the Apps Script

File: `supabase/functions/public-leads/index.ts`

1. Near the other constants, read two new env vars:
   `LEAD_ALERT_WEBHOOK_URL` and `LEAD_ALERT_SECRET`.
2. Add a `sendLeadAlert(payload, leadType)` helper that:
   - returns immediately if either env var is missing;
   - POSTs `JSON.stringify({ source: 'jantahr-ops', secret, lead: { leadType, fullName, email, phone, organization, trainingUnit, message, sourcePage, submittedAt } })`
     with header `content-type: text/plain;charset=utf-8` (Apps Script friendly);
   - uses an `AbortController` timeout of 8 seconds;
   - catches every error and only `console.error`s it. It must never throw.
   - Apps Script answers with a 302 redirect; default `fetch` redirect-following is fine.
3. Call it **only after the lead is fully created**, i.e. after the
   `web_submissions` update and immediately before the final
   `return json({ ok: true }, 200, origin)` inside the `try`. Not on honeypot hits,
   not on duplicate (23505) submissions, not on failures.
   Use `EdgeRuntime.waitUntil(sendLeadAlert(...))` so the website gets its
   response without waiting (add `declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }`
   at the top if the type is missing). If `EdgeRuntime` is undefined at runtime,
   fall back to `await`.
4. Set secrets and deploy (secret value from Part 2 step 1, never echoed into logs):
   ```bash
   supabase secrets set --project-ref qjsgqskigjqrzjftunhg LEAD_ALERT_WEBHOOK_URL="https://script.google.com/macros/s/AKfycbzQsiRS_moV0oiB7wJ0xr8ac-Etbl_ZPuAvSL6ZcbRBT1bWafidad2nNqZrpkvDREHH/exec" LEAD_ALERT_SECRET="<secret>"
   supabase functions deploy public-leads --project-ref qjsgqskigjqrzjftunhg --no-verify-jwt
   ```
5. Run `npm run check` in Ops. Must pass.
6. Update `docs/WEBSITE_CUTOVER.md`: replace the dual-write section with the new
   flow (website → Ops → Apps Script mailer), list the two secrets and the two
   Script Properties by name only, and note the Sheet is now optional.
7. Commit: `feat(public-leads): email the team via Apps Script when a website lead arrives`
   and push.

## Part 4 — End-to-end test (you have my permission to submit ONE test registration)

1. **Browser:** open `https://www.jantahr.com/ai-training`, fill the form with
   Name `TEST — please ignore`, Email `dora.agai@gmail.com`, any phone like
   `0772000000`, pick any training unit, note `Automated test`. Submit.
2. Confirm the success message appears and the browser console shows no CSP errors.
3. Confirm the alert email arrived at the `ALERT_TO` inbox (ask me to check if you
   can't see it).
4. Check the function logs for errors:
   `supabase functions logs public-leads --project-ref qjsgqskigjqrzjftunhg`
   (or the Supabase dashboard → Edge Functions → public-leads → Logs).
5. Ask me to open Ops (`npm run dev`, http://localhost:5180) → Leads and confirm the
   test lead is there. Then mark it Lost with reason "Test".

## Report back with

- What the old `doPost` did, and whether it still writes to the Sheet.
- Commit hashes in both repos.
- Output of the bundle check in Part 1 step 7.
- Whether the test lead appeared in Ops and whether the email arrived.
- Anything you could not do and why.

## Do not

- Change the website CSP, the jobs or candidates endpoints, or any other Netlify variable.
- Create a new Apps Script deployment (that changes the URL).
- Put the secret in git, docs, chat or command output.
- Sign up for any paid service.

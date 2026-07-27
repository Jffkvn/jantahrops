# JantaHR Ops — Build Plan

**Status:** agreed plan, pre-build
**Date:** 27 July 2026
**Users:** Jeff, Dora (+ room for an intern/partner)
**Market:** Uganda — UGX, offline payment, manual confirmation
**Execution:** Antigravity, driven by the prompts in `ANTIGRAVITY_PROMPTS.md`.
This document is the specification and the source of truth; the prompt file is
the delivery mechanism. When the two disagree, this document wins.

---

## 0. What this document is

This replaces the product description as the thing we build from. The product
description said what JantaHR Ops should eventually be. This says what we are
building, in what order, and — just as importantly — what we are deliberately
not building.

### Decisions carried over from discussion

| Decision                         | Choice                                                                                                                       | Why                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Relationship to Egypro / website | Standalone app, own database, own repo                                                                                       | Already agreed; connects by endpoint only                                   |
| Website lead form                | Point `VITE_AI_TRAINING_REGISTRATION_ENDPOINT` at Ops                                                                        | Form already posts a clean payload; no website code change                  |
| Website job board                | Point `VITE_JOBS_ENDPOINT` at Ops                                                                                            | Already dynamic-ready with a JSON fallback; one endpoint away               |
| LMS                              | Read Frappe Learning / ClassroomIO for data model + student UX. Build our own thin Academy module                            | No fork, no AGPL entanglement, no unpatched security surface                |
| Payments                         | Manual confirmation only. No gateway                                                                                         | Matches how money actually moves here                                       |
| Roles                            | `admin` / `staff` / `intern` + `owner_id` on records. No permission matrix                                                   | Cheap generality now, expensive generality refused                          |
| Social media                     | Content calendar + AI drafting inside Ops. Publishing stays manual/Buffer                                                    | LinkedIn & Meta APIs cost weeks for something Buffer does for pocket change |
| Multi-tenancy                    | None. Hard-code JantaHR                                                                                                      | Not building for a second customer                                          |
| **UI direction**                 | **Its own design system, built from the Kuubiik/Knowvio references + JantaHR brand colour. Explicitly NOT the website's UI** | The website UI is not the target. Ops is a tool, not a brochure             |

---

## 1. Business context that shapes the build

- **Revenue comes from everywhere** — training, recruitment, retainers, payroll
  setup, HR projects. No module is "the priority." This is why the **spine gets
  built first**: every module hangs off contacts and organisations, so once the
  spine exists, modules can be built in any order without rework.
- **Low volume today, must scale later.** See §9.
- **The daily pain is follow-up.** Leads and projects both die from missed
  follow-up. So reminders that leave the app, plus an AI layer that flags what's
  slipping, are core — not polish.
- **Payment is offline.** Mobile Money (MTN MoMo, Airtel Money) and bank
  transfer. Jeff or Dora confirms receipt; the system generates the receipt and
  unlocks entitlements.

---

## 2. Stack

| Layer         | Choice                                                                       | Note                                                                 |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Frontend      | React + TypeScript + Vite                                                    | Fast, well-understood, no framework overhead we don't need           |
| UI            | Tailwind + shadcn/ui, restyled to our own token set                          | shadcn is unstyled primitives, not a look — we own the look. See §10 |
| Backend       | Supabase (Postgres, Auth, Storage, Edge Functions)                           | Auth for 3 users free; storage for CVs/receipts; cron for reminders  |
| Vector search | `pgvector`                                                                   | Talent pool semantic search                                          |
| Scheduling    | `pg_cron` + Edge Functions                                                   | Reminders, nightly signal generation                                 |
| AI            | Claude (Opus 5 for drafting/reasoning, Haiku 4.5 for parsing/classification) | Cost-tiered by task                                                  |
| Email         | Resend or Supabase SMTP                                                      | Reminders, receipts, follow-up sends                                 |
| Hosting       | Local dev on Mac → GitHub → Vercel or Netlify later                          | No deploy decision needed to start building                          |

**Hard rule:** public endpoints run as Edge Functions using the **service role
key, server-side only**. The anon key is never used for public writes, and no
Supabase credential ever ships in the website bundle.

---

## 3. Data model

### 3.1 The spine

Two tables everything traces back to. A person who registers for a course,
applies for a job two years later, and eventually buys a retainer is **one
`contacts` row** the whole time.

```
organisations
  id, name, industry, tin, country (default 'UG'), district, address,
  website, is_client, status, notes, created_at, updated_at

contacts
  id, full_name, email, phone_e164, whatsapp, organisation_id (nullable),
  job_title, location, source, notes, created_at, updated_at
  -- unique index on lower(email)
  -- unique index on phone_e164
  -- dedupe on ingest: match email first, then phone

contact_roles
  contact_id, role ('lead'|'candidate'|'student'|'client_contact'|'partner'),
  since, meta jsonb
  -- junction, NOT a type column: one person is genuinely several at once
```

**`activities` is the second most important table in the system.** Every module
writes to it; the contact timeline, the project history and the audit trail are
all the same query.

```
activities
  id, subject_type, subject_id, type ('note'|'call'|'email'|'whatsapp'
  |'meeting'|'stage_change'|'document'|'payment'|'system'),
  body, meta jsonb, occurred_at, user_id, created_at

tasks
  id, title, description, due_at, assignee_id, priority, status,
  related_type, related_id, completed_at, created_by
```

### 3.2 CRM

```
leads
  id, contact_id, organisation_id, source, service_interest,
  stage ('new'|'contacted'|'qualified'|'proposal_sent'|'negotiation'
        |'won'|'lost'|'dormant'),
  value_ugx bigint, owner_id, next_action_at, next_action_note,
  lost_reason, converted_organisation_id, created_at
```

`next_action_at` is the single most important column in the CRM. It drives the
day view, the reminders and the "slipping" signals.

### 3.3 Recruitment & talent pool

```
vacancies
  id, organisation_id, title, slug, summary, description, requirements,
  location, employment_type, salary_min_ugx, salary_max_ugx,
  status ('draft'|'open'|'paused'|'closed'), is_public, published_at,
  closes_at, owner_id

candidates
  id, contact_id, headline, years_experience, skills text[],
  education jsonb, work_history jsonb, salary_expectation_ugx,
  availability, cv_file_id, cv_parsed jsonb, cv_parsed_at,
  embedding vector(1536), rating, is_available, created_at

applications
  id, vacancy_id, candidate_id, source,
  stage ('new'|'screened'|'shortlisted'|'interview_scheduled'|'interviewed'
        |'rejected'|'offered'|'hired'|'talent_pool'),
  applied_at, owner_id, notes

interviews
  id, application_id, scheduled_at, mode, panel text[], feedback,
  rating, outcome
```

Every candidate has a `contact_id`. Registering for the talent pool creates a
contact + a `candidate` role + a candidate row. Applying to a vacancy adds an
application. Nothing is duplicated.

### 3.4 Projects

```
projects
  id, organisation_id, name, type, owner_id,
  stage ('planned'|'active'|'waiting_on_client'|'under_review'
        |'completed'|'archived'),
  start_date, end_date, budget_ugx, contracted_value_ugx, priority,
  description, created_at

project_milestones
  id, project_id, title, due_date, status, completed_at

time_entries
  id, project_id, user_id, work_date, hours numeric(4,1), note
```

**On time tracking:** deliberately coarse. Log by the half-day, once a week, not
per task. Project profit = contracted value − direct expenses − (days logged ×
internal day rate). It's an estimate and the UI will say so. A precise-looking
profit figure built on time nobody logged is worse than an honest rough one.

### 3.5 Finance

```
documents
  id, type ('quote'|'lpo'|'invoice'|'receipt'),
  number (null until issued), organisation_id, contact_id,
  related_type, related_id,            -- lead / project / enrolment
  issue_date, due_date, valid_until,
  currency default 'UGX',
  subtotal_ugx, vat_applicable bool, vat_rate numeric, vat_amount_ugx,
  total_ugx,
  status ('draft'|'issued'|'accepted'|'rejected'|'part_paid'|'paid'
         |'cancelled'|'expired'),
  parent_document_id,                  -- quote -> invoice -> receipt chain
  pdf_file_id, notes, terms,
  efris_fdn, efris_qr_url, efris_status,   -- unused until VAT registered
  issued_by, issued_at, created_at

document_lines
  id, document_id, position, description, qty, unit, unit_price_ugx,
  line_total_ugx, tax_treatment

payments
  id, document_id, amount_received_ugx, wht_withheld_ugx,
  method ('mtn_momo'|'airtel_money'|'bank_transfer'|'cash'|'cheque'),
  reference, received_at, confirmed_by, proof_file_id, notes

document_sequences
  doc_type, year, last_value
  -- row-locked; see §5

expenses
  id, category, description, amount_ugx, incurred_on, vendor,
  project_id, organisation_id, receipt_file_id, entered_by, created_at
```

### 3.6 Academy

```
courses
  id, title, slug, summary, description, outline jsonb,
  price_ugx, corporate_price_ugx, duration_label, is_public

cohorts
  id, course_id, name, start_date, end_date,
  delivery_mode ('live_online'|'in_person'|'self_paced'|'hybrid'),
  capacity, location, meeting_url, facilitator_id, status

enrolments
  id, cohort_id, contact_id, organisation_id,
  status ('registered'|'invoiced'|'paid'|'active'|'completed'|'dropped'),
  entitled_at,                          -- set when payment confirmed
  progress_pct, attendance jsonb, completed_at,
  certificate_number, certificate_file_id, source

lessons            -- id, cohort_id/course_id, position, title, body,
                   -- video_url, resource_file_ids
lesson_progress    -- enrolment_id, lesson_id, completed_at
```

**Entitlement is a state, not a checkbox.** `registered → invoiced → paid →
active`. Confirming a payment sets `entitled_at`, which is what unlocks course
access. This is the one thing that makes the Academy work later without rework.

### 3.7 Content calendar

```
content_items
  id, channel ('linkedin'|'facebook'|'instagram'|'x'|'newsletter'),
  title, body_draft, hashtags, media_file_ids,
  status ('idea'|'drafted'|'approved'|'posted'|'archived'),
  scheduled_for, posted_at, posted_url, owner_id,
  source_type, source_id     -- e.g. the vacancy or cohort it promotes
```

Ops plans and drafts. A human posts, or Buffer picks it up. No auto-publishing.

### 3.8 AI signals

```
signals
  id, kind, severity ('info'|'warn'|'urgent'),
  subject_type, subject_id, title, detail,
  evidence jsonb,                -- the facts that produced it
  suggested_action, action_payload jsonb,
  status ('open'|'dismissed'|'actioned'|'expired'),
  generated_at, dismissed_by, dismissed_at
```

### 3.9 Supporting

```
files       id, bucket, path, filename, mime, size_bytes, uploaded_by,
            related_type, related_id, is_public, created_at
profiles    id (= auth user), full_name, role ('admin'|'staff'|'intern'),
            avatar_file_id, email, phone, is_active
settings    key, value jsonb          -- company details, tax config, rates
```

---

## 4. Uganda specifics

These are real constraints, not decoration. **Confirm current rates and
thresholds with your accountant before go-live — tax rules move.**

### Currency

UGX, stored as **`bigint` in whole shillings**. No decimals, no floats anywhere
near money. Displayed with thousands separators and tabular numerals.

### VAT — JantaHR **is** VAT registered

Confirmed. So every applicable document carries an 18% VAT line and the TIN is
printed on all of them. The rate lives in `settings` (rates change; code
shouldn't), but the branch is settled — there is no "not registered" path to
build.

Consequences: `vat_applicable` defaults true, `vat_rate` defaults 0.18, TIN is
required company detail before any document can be issued, and EFRIS applies.

**Rounding rule.** Money is `bigint` whole shillings, and 18% of an arbitrary
amount is not a whole number — 18% of UGX 1,234,567 is 222,222.06. So every
computed amount is **rounded half-up to the nearest shilling**, computed on
integers, never on floats:

```
vat_amount = (subtotal * 18n + 50n) / 100n     // integer math, half-up
total      = subtotal + vat_amount
```

VAT is computed on the **document subtotal**, not per line, then the rounding
difference is absorbed at document level. Line totals are display-only and are
not required to sum exactly to the VAT figure. Pick this rule once and test it —
an invoice that is one shilling off its own arithmetic is a conversation with
URA nobody wants.

### EFRIS — needs a decision in Phase 2

Because JantaHR is VAT registered, URA requires invoices and receipts to be
issued through EFRIS, carrying a Fiscal Document Number and QR code. A document
issued outside EFRIS is not a valid tax invoice.

Two viable paths:

**A — Manual bridge (recommended to start).** Ops drafts and numbers the
invoice, you issue it through the URA EFRIS portal, then paste the returned FDN
back into Ops, which prints it and the QR on the PDF. Zero integration work,
legally correct, and entirely reasonable at your volume. `efris_status` tracks
`pending → issued`, and a signal flags any invoice sent to a client without an
FDN recorded.

**B — Direct EFRIS API integration.** Real work: URA credentials, their
encryption/signing scheme, goods-and-services registration, sandbox testing, and
error handling for a system that is not always up. Worth doing only once the
manual step becomes a genuine bottleneck.

**Build A in Phase 2. Confirm the approach with your accountant first** — they
may already have an EFRIS workflow you should slot into rather than replace.

### Withholding tax — the one that will bite

URA-designated withholding agents deduct **6% WHT** on qualifying payments to
suppliers. Corporate clients will therefore pay you **94% of an invoice** and
remit the rest to URA on your behalf.

If the system doesn't model this, every corporate invoice sits at "part paid"
forever and your receivables report is permanently wrong.

So `payments` carries both `amount_received_ugx` and `wht_withheld_ugx`, and an
invoice is settled when `received + withheld = total`. The withheld amounts are
a tax credit — the system reports them annually for your income tax return.

### Payment methods

MTN MoMo, Airtel Money, bank transfer, cash, cheque. Every payment stores a
reference (transaction ID / slip number) and optionally an uploaded proof image.

---

## 5. Document numbering

**Format:** `JH-{TYPE}-{YYYYMMDD}-{NNNN}`

| Type                 | Code   | Example                 |
| -------------------- | ------ | ----------------------- |
| Quote                | `QT`   | `JH-QT-20260727-0031`   |
| Local Purchase Order | `LPO`  | `JH-LPO-20260727-0009`  |
| Invoice              | `INV`  | `JH-INV-20260727-0042`  |
| Receipt              | `RCT`  | `JH-RCT-20260727-0038`  |
| Certificate          | `CERT` | `JH-CERT-20261115-0104` |

Rules, enforced in the database rather than app code:

1. `NNNN` is a **per-type, per-year continuous counter** — not per day. The date
   segment is the issue date; the sequence keeps climbing through the year and
   resets on 1 January. This gives you the date at a glance _and_ a gapless
   audit trail.
2. **Drafts have no number.** A number is assigned only at the moment of issue,
   inside the same transaction, via a row lock on `document_sequences`. Abandoned
   drafts therefore cannot punch holes in the sequence.
3. **Numbers are never reused, never edited, never deleted.** Cancelling a
   document sets `status = 'cancelled'` and keeps the number.

---

## 6. Public endpoints

Three Edge Functions. All are write-only or read-public, rate-limited, and
handle `OPTIONS` preflight (the website posts `application/json`, which triggers
CORS preflight).

### `POST /public-leads`

Accepts the website's existing payload **verbatim** — no website code change:

```json
{
  "leadType": "ai_training",
  "fullName": "",
  "email": "",
  "phone": "",
  "organization": "",
  "trainingUnit": "",
  "message": "",
  "honeypot": "",
  "sourcePage": "",
  "metadata": null,
  "submittedAt": ""
}
```

Responds `{"ok": true}` or `{"ok": false, "error": "..."}` — the shape
`aiTrainingRegistration.ts` already parses.

Behaviour: reject if `honeypot` is filled. Find-or-create contact (email, then
phone). Find-or-create organisation if `organization` is present. Add `lead`
role. Create lead with `source` derived from `leadType` and `sourcePage`. Write
an activity. Fire a notification to Jeff and Dora.

Protection: per-IP rate limit, 10KB body cap, idempotency on
`(email, leadType, submittedAt)`, never returns data.

**Cutover:** the Apps Script keeps writing to the Google Sheet _and_ posts to
Ops for the first few weeks. Zero-risk switch, and the email alerts you rely on
keep working. Sheet writing is turned off once Ops is trusted.

### `GET /public-jobs`

Returns `{"jobs": [...]}` in the shape `src/data/jobs.ts` already defines, for
vacancies where `is_public = true AND status = 'open'`. Point
`VITE_JOBS_ENDPOINT` at it and the static `jobs.json` is retired.

Cached at the edge (60s). Never exposes internal fields, the client
organisation, or salary bands unless explicitly marked public.

### `POST /public-candidates`

Talent pool self-registration, with CV upload via a short-lived signed URL.
Optionally tied to a vacancy slug.

Protection: rate limit, MIME allowlist (`pdf`, `doc`, `docx`), 10MB cap,
extension/content-type agreement check, files stored in a private bucket with
no public read. Uploading triggers CV parsing (§7).

---

## 7. AI layer

**The rule:** every AI output either _drafts something you'd have written_,
_fills a field you'd have typed_, or _flags something with evidence and a
one-click action_. Nothing generates opinions into a panel nobody reads.

### 7.1 Signals — flags and recommendations

Hybrid by design. **Deterministic SQL rules find the candidates** (cheap,
reliable, explainable). **The model ranks them, writes the human sentence, and
drafts the action.** Every signal is a row — auditable, dismissible, and it
never silently disappears.

| Kind                  | Trigger                                                    | Suggested action                        |
| --------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `lead_going_cold`     | `next_action_at` passed, or no activity in N days by stage | Draft follow-up message                 |
| `quote_unanswered`    | Quote issued, no response, past `valid_until` − 3d         | Draft chaser + offer to extend validity |
| `invoice_overdue`     | Past `due_date`, unpaid                                    | Draft payment reminder                  |
| `invoice_wht_gap`     | `received + withheld < total`                              | Flag genuine shortfall vs WHT           |
| `project_slipping`    | Past `end_date`, or spend > budget, or stalled milestone   | Open project, notify client             |
| `candidate_waiting`   | Application in a stage > N days with no activity           | Move stage or send update               |
| `vacancy_stalled`     | Open vacancy, no shortlist movement in 14d                 | Review pipeline / re-advertise          |
| `cohort_underfilled`  | Cohort starts in < 14d, seats < target                     | Draft promo post + email past leads     |
| `duplicate_contact`   | Fuzzy name + partial phone/email match                     | Merge review                            |
| `candidate_match`     | New vacancy → semantic search over talent pool             | Shortlist top N                         |
| `reengage_contact`    | Course completed 60d ago, no follow-up offer               | Draft consultancy offer                 |
| `intern_needs_review` | Record created/edited by `intern` role                     | Approve or amend                        |

Runs nightly on `pg_cron`, plus on-demand from the day view.

### 7.2 Drafting

The blank page is why follow-ups don't happen. Ops knows the contact, the last
interaction, the amount, the elapsed time — so it hands you a written email or
WhatsApp message. You edit and send. Tone is configurable per channel; sending
is always a deliberate human click.

### 7.3 CV parsing

PDF/DOCX in → name, email, phone, skills, work history, education, salary
expectation, availability out, into real columns plus `cv_parsed` jsonb. Always
shown for review before saving; parsed fields are flagged as machine-extracted.
This is what turns the talent pool from a folder of PDFs into an asset.

### 7.4 Semantic search

Candidate embeddings in `pgvector`. "Who do we know who's done HR compliance in
manufacturing?" returns ranked people with the matching evidence highlighted.
For a recruitment firm this is the real differentiator over an agency with a
spreadsheet.

### 7.5 Morning brief

One generated email at 07:00: overdue follow-ups, today's tasks, quotes gone
quiet, candidates waiting, money in and out yesterday. Ranked, each line
deep-linking into Ops.

### 7.6 Meeting notes → structure

Paste raw notes, get a summary on the contact's timeline plus extracted tasks
with owners and due dates, offered for confirmation.

### 7.7 Content drafting

New vacancy → drafted LinkedIn post. New cohort → drafted promo copy. Lands in
the content calendar as `drafted`, never posted automatically.

**Not building:** predictive lead scoring (no training data at your volume), AI
insight dashboards, or a chatbot over the database.

---

## 8. Reminders & notifications

A reminder that only exists inside the app is useless — you won't open Ops to
discover you were supposed to open Ops.

- **Email** is the baseline channel for everything.
- **WhatsApp** is the second channel for urgent items (evaluate Meta Cloud API
  vs. a simple "open WhatsApp with this message pre-filled" link — the second
  costs nothing and probably suffices).
- **In-app** is a bell icon, and is never the only delivery.

Triggered by: task due, `next_action_at` reached, new public lead, new
candidate registration, invoice overdue, cohort starting, signal marked urgent.

---

## 9. Scaling

Postgres is not the risk. Four habits are, and all four are free now and painful
later:

1. **Server-side pagination and search on every list view**, from the very first
   screen. Never load a full table into the browser. (The website's
   `fetchJobBySlug` fetches every job to find one — correct at 20 jobs, wrong at
   2,000. We don't repeat that pattern.)
2. **Indexes** on every foreign key and every column we filter or sort by —
   `stage`, `status`, `owner_id`, `next_action_at`, `due_at`, `created_at`.
3. **No N+1 queries** in lists — one query with joins, or a view.
4. **Full-text search** (`tsvector`) on contacts, candidates and organisations
   from day one, alongside the vector index.

Do those and 100× growth is a non-event. The thing that genuinely doesn't scale
is human follow-up — which is what §7 exists to absorb.

---

## 10. UI

**Ops has its own design system. It does not inherit the JantaHR website's UI.**
The reference points are the Kuubiik and Knowvio dashboards: warm neutral
canvas, white cards with generous radius, hairline borders instead of shadows,
one saturated accent used sparingly, a deep ink for primary actions, soft-pill
sidebar navigation, geometric sans with tight tracking, and real whitespace.

The only thing inherited from JantaHR is the **brand colour**, taken from the
logo files.

### 10.1 Colour

Sampled directly from the logo files, which live in the project root:

- `jantahr-logo.png` — reversed: off-white mark on deep petrol
- `jantahr-high-resolution-color-logo 2.png` — teal mark on white

| Role                  | Hex       | Source                   |
| --------------------- | --------- | ------------------------ |
| Deep petrol (primary) | `#0B5978` | Reversed logo background |
| Bright teal           | `#006C8B` | Colour logo mark         |
| Logo off-white        | `#F6F9FB` | Reversed logotype        |

**Logo usage in-app:** the reversed logo on the deep-petrol sidebar or on dark
mode; the colour logo on white surfaces, login screen and generated PDFs. Both
must be exported to SVG before build — a 2000×1500 PNG is not a UI asset.

**The design decision:** in the references, the deep navy fills the "primary
action" role and a warm accent (Kuubiik's yellow, Knowvio's orange) provides the
life. `#0B5978` slots straight into the navy role. So Ops pairs the cool brand
teal with a **warm amber accent** — the teal carries identity and authority, the
amber carries energy and is the only thing allowed to pull the eye. That
complementary pairing is what stops a teal-only interface reading cold and
clinical.

Accent appears on roughly **5% of pixels**. Status colours are the only other
colours permitted, and only inside small chips.

```
/* ---- light ---- */
--canvas:            #F4F6F8   /* app background */
--surface:           #FFFFFF   /* cards, panels */
--surface-sunken:    #ECF0F3   /* table headers, wells, inputs at rest */
--border:            #E1E7EC   /* hairline, 1px, the default separator */
--border-strong:     #C9D4DC   /* focus rings, active edges */

--ink:               #0D2B37   /* primary text — near-black, teal cast */
--ink-secondary:     #48626F   /* labels, secondary text */
--ink-muted:         #5C7380   /* placeholders, timestamps */

--primary:           #0B5978   /* buttons, active nav, links */
--primary-hover:     #084A64
--primary-active:    #063B51
--primary-soft:      #E6EFF3   /* tinted backgrounds, active nav pill */
--primary-bright:    #006C8B   /* accents on dark, charts, illustration */

--accent:            #F2B33D   /* amber — highlight cards, key CTA, charts */
--accent-hover:      #E0A22C
--accent-soft:       #FDF4E2
--accent-ink:        #5A3E04   /* text on amber surfaces */

--success:  #15855A    --success-soft:  #E4F3EB
--warning:  #B87309    --warning-soft:  #FBF1E0
--danger:   #C0433A    --danger-soft:   #FAE9E7
--info:     #0B5978    --info-soft:     #E6EFF3

/* ---- dark ---- */
--canvas:            #0A141A
--surface:           #101E26
--surface-sunken:    #16272F
--border:            #21363F
--border-strong:     #31505D

--ink:               #E7EEF2
--ink-secondary:     #9DB4C0
--ink-muted:         #6E8896

--primary:           #2C8FB5   /* #0B5978 is unreadable on dark — brightened */
--primary-hover:     #3AA0C7
--primary-soft:      #12313F
--primary-bright:    #4FB4D4

--accent:            #F5C05A
--accent-hover:      #FFCE72
--accent-soft:       #2E2413
--accent-ink:        #F5C05A

--success:  #3BB584    --success-soft:  #122C22
--warning:  #E0A03A    --warning-soft:  #2E2413
--danger:   #E0685E    --danger-soft:   #2E1A18
```

Both token sets are built **from day one**. Retrofitting dark mode is miserable.

### 10.2 Type

| Role                   | Font        | Notes                                                                          |
| ---------------------- | ----------- | ------------------------------------------------------------------------------ |
| Headings, numbers, nav | **Satoshi** | The geometric grotesk in both references. Free for commercial use, self-hosted |
| Body, tables, forms    | **Inter**   | Better at small sizes and dense tables than a display face                     |

Self-host both as woff2 — no external font CDN, no layout shift.

- Headings: tight tracking (`-0.02em` at 24px+, `-0.03em` at 32px+), weight 600.
- **`font-variant-numeric: tabular-nums` on every number.** Money, counts, dates,
  table cells. Non-negotiable — it's the single detail that separates a real
  product from a dashboard mockup.
- Scale: `12 / 13 / 14 / 16 / 20 / 24 / 32 / 40`. Body 14, table cells 13,
  page titles 28–32.

### 10.3 Form

| Property           | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| Card radius        | 16px                                                                           |
| Control radius     | 10px                                                                           |
| Chip / pill radius | 999px                                                                          |
| Border             | 1px hairline. **Shadows are not the separator**                                |
| Shadow             | Only on popovers, dropdowns and modals: `0 8px 24px -8px rgb(13 43 55 / 0.16)` |
| Spacing base       | 4px scale                                                                      |
| Sidebar            | 264px, collapsible to 68px icon rail                                           |
| Content max-width  | 1440px, centred                                                                |
| Active nav         | Soft `--primary-soft` pill, `--primary` icon and label                         |

**On density:** the references are marketing shots — huge type, four visible
rows. Keep their visual language exactly, but tune the scale down for lists and
tables so you can see ~20 rows without scrolling. Cards are for genuinely
distinct objects, not for wrapping every list. Think _these references, at
working density_.

### 10.4 Behaviour

- **⌘K command bar everywhere.** Add a lead in four seconds without touching a
  menu. This is the honest answer to "why would I not just use WhatsApp."
- **Motion is restraint:** 120–180ms `ease-out` on hover and press, 200ms on
  panel and drawer transitions. Skeletons, never spinners. Optimistic updates so
  a click registers before the network answers. **Never animate a layout shift.**
- Respect `prefers-reduced-motion`.
- **Mobile-usable quick-add** — leads arrive when you're out of the office.
- **Empty states do work** — every empty list offers the action that fills it.
- Focus rings visible and on-brand; full keyboard navigation on every list.

### 10.5 The screen that matters most

**The Day View** is the home screen and the reason to open Ops. Not a metrics
dashboard — a work queue:

1. Overdue and due-today follow-ups, each with a drafted message ready
2. Open signals, ranked by severity
3. Today's tasks
4. Anything waiting on you — candidates, quotes, approvals
5. A quiet strip of numbers at the bottom, not the top

Metrics dashboards get admired once and never opened again. Work queues get
opened every morning.

---

## 11. Build order

The spine is first because everything needs it. **After Phase 1, phases 2–5 are
genuinely reorderable** — that's the point of building the spine properly, and
it's the structural answer to "revenue can come from anywhere."

### Phase 0 — Foundation

Repo, stack, Supabase project, auth for 3 users, design tokens (light + dark),
app shell and navigation, ⌘K, file storage, `profiles`, `settings`, `files`,
`activities`, `tasks`, and the spine: `organisations`, `contacts`,
`contact_roles`. Contact and organisation detail pages with unified timelines.

### Phase 1 — Capture & follow-up _(the daily pain)_

Leads pipeline with stages and `next_action_at`. `POST /public-leads` live and
the website env var switched. Reminder infrastructure (cron + email). The Day
View. Signals engine v1 with the rule-based flags. AI follow-up drafting.
Morning brief.

_After this phase Ops is worth opening every morning. Everything after is
additive._

### Phase 2 — Money

Documents (quote → LPO → invoice → receipt), numbering per §5, VAT and WHT per
§4, PDF generation, payments with manual confirmation, expenses with receipt
upload, and a simple money view: owed to us, overdue, in this month, out this
month.

### Phase 3 — Recruitment & talent pool

Vacancies, `GET /public-jobs` live and the website's second env var switched,
`POST /public-candidates` with CV upload, CV parsing, applications and stages,
interviews and feedback, semantic search, and a client-facing **shortlist pack**
(a shareable link or PDF — the actual deliverable clients see).

### Phase 4 — Projects

Projects, milestones, coarse weekly time entry, project expenses, estimated
project P&L, project templates for the work you repeat.

### Phase 5 — Academy

Courses, cohorts, enrolments, entitlement unlocked by confirmed payment, lessons
and resources, attendance, progress, certificate generation. Video hosted
externally (Cloudflare Stream / Mux / unlisted YouTube), never self-hosted.

### Phase 6 — Content calendar, reporting, polish

Content calendar with AI drafting from vacancies and cohorts. Reports: lead
conversion, pipeline value, recruitment funnel, revenue vs expense, training
registrations and completions, WHT credits for the annual return.

---

## 12. Explicitly not building

Stated so it stays refused when it gets tempting:

- Multi-tenancy, `tenant_id`, white-labelling, plan tiers
- A permissions matrix or roles admin UI (three role values and `owner_id` only)
- A payment gateway
- A forked or self-hosted LMS
- Automatic social media posting
- A custom-field builder or configurable pipelines — our stages are hard-coded
- A native mobile app (responsive web instead)
- A client or candidate self-service portal
- "Future software subscriptions" as an engineering requirement

Every one of these can be added later, from a working product with real usage,
far more cheaply and far more correctly than by guessing now.

---

## 13. Open questions

Needed before the relevant phase, not before starting:

1. ~~Are you VAT registered?~~ — **resolved: yes.** See §4. EFRIS path A is the
   Phase 2 plan; confirm with the accountant.
2. **Company details for documents** — legal name, **TIN**, address, bank
   details, MoMo numbers. Promised, not yet supplied. _(Blocks Phase 2)_
3. **Internal day rate** for project profit estimates. _(Blocks Phase 4)_
4. ~~Brand palette and typeface~~ — **resolved.** See §10.
5. ~~Host and domain~~ — **resolved.** Local first, GitHub next, Vercel or
   Netlify when there is something to deploy. Blocks nothing.
6. **WhatsApp reminders** — Meta Cloud API, or the free pre-filled-link
   approach? _(Blocks Phase 1)_
7. **Course catalogue and prices.** _(Blocks Phase 5)_
8. **Google Form and Sheet retirement date** — how long we dual-write.
   _(Blocks Phase 1 cutover)_

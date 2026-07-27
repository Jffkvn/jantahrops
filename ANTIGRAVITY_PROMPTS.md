# Antigravity Execution Prompts — JantaHR Ops

**How to use this file.** Each block below is a self-contained prompt. Paste one
at a time, in order, into Antigravity. Do not paste two at once — each prompt
ends with acceptance criteria you should verify before moving to the next.

`JANTAHR_OPS_BUILD_PLAN.md` sits in the project root and is the specification.
Every prompt tells Antigravity to read it. When a prompt and the plan disagree,
**the plan wins** — say so if Antigravity asks.

Phase 0 and Phase 1 are written out in full below, because those are what turn
an empty folder into something you use every morning. Phases 2–6 are outlined at
the end rather than fully written, deliberately: prompts written before Phase 1
exists would be guessing at names and shapes that Phase 1 will settle. Ask me to
expand each phase when you reach it.

---

## Standing instructions — paste this ONCE at the start of the Antigravity session

```
You are building JantaHR Ops, an internal operating system for JantaHR, an HR
consultancy in Uganda. It has exactly two users today (Jeff and Dora) with room
for an intern later.

Before writing any code, read JANTAHR_OPS_BUILD_PLAN.md in the project root.
It is the complete specification: data model, Uganda tax rules, document
numbering, public endpoints, AI layer, and the full design system. Treat it as
the source of truth. If anything I ask contradicts it, tell me instead of
silently picking one.

Rules that apply to every task in this project:

1. TypeScript strict mode. No `any`. No `@ts-ignore`.
2. Money is `bigint` in whole Ugandan shillings. Never floats, never cents.
   Format at the display layer only.
3. Every list view is paginated and searched SERVER-SIDE from the first commit.
   Never fetch a whole table into the browser and filter it in JavaScript.
4. Every foreign key gets an index. Every column used in a WHERE or ORDER BY
   gets an index.
5. No secrets in client code. Anything using a Supabase service-role key is an
   Edge Function, never a component.
6. Do not add multi-tenancy, a `tenant_id`, a permissions framework, a
   custom-field builder, configurable pipelines, or a payment gateway. Section
   12 of the plan lists what is explicitly out of scope. If you think one is
   needed, ask first.
7. Build only what the current prompt asks for. Do not scaffold ahead into
   future phases.
8. After each task, list the files you created or changed and state briefly
   how you verified it works.
9. Read prompts/TESTING.md as well. It defines what must be tested, at which
   tier, and what must NOT be tested. Tier-1 tests block a phase from being
   considered complete. Write tests in the same task as the code they cover.

Confirm you have read both documents and summarise the data model spine back to
me in three sentences before we start.
```

**Also paste the "standing testing instructions" block from
[`prompts/TESTING.md`](prompts/TESTING.md) in the same session.** It carries the
rules that matter most — verify every test can fail, never weaken a test to make
it pass, never use floating point in a money test.

---

# PHASE 0 — Foundation

## Prompt 0.1 — Project scaffold

**Full prompt: [`prompts/0.1-project-scaffold.md`](prompts/0.1-project-scaffold.md)**

Expanded to a complete specification — exact versions, the full directory tree,
every tsconfig flag, the money/date/phone utilities with their test cases, and
acceptance commands. Paste that file's fenced block, not this summary.

Covers: Vite 7 + React 19 + TypeScript strict + Tailwind 4 (CSS-first, no
config file), lint/format/test tooling, `.env.example`, the four foundation
utilities in `src/lib/`, `docs/CONVENTIONS.md`, and the first commit.

shadcn/ui is deliberately **not** installed here — it arrives in 0.2 so its
components are generated onto tokens that already exist.

## Prompt 0.2 — Design system

This is the prompt that decides whether Ops looks right. Give it room.

```
Build the JantaHR Ops design system. Read section 10 of
JANTAHR_OPS_BUILD_PLAN.md in full first — it contains the complete token set.

IMPORTANT CONTEXT ON THE LOOK:
The visual reference is modern SaaS dashboards in the style of Kuubiik and
Knowvio: a soft neutral canvas, white cards with 16px radius, 1px hairline
borders instead of drop shadows, one warm accent used very sparingly, deep ink
for primary actions, soft-pill sidebar navigation, a geometric sans with tight
tracking, and generous whitespace. It is calm, light, and confident.

This project must NOT look like the JantaHR marketing website. Do not reference
it. Ops is a working tool, not a brochure.

Deliver:

1. src/styles/tokens.css — every CSS custom property from section 10.1, for
   BOTH light and dark. Dark mode via a `.dark` class on <html>, with a theme
   toggle that persists to localStorage and respects prefers-color-scheme on
   first load.

2. tailwind.config.js mapping the tokens to Tailwind names, so components use
   `bg-surface text-ink border-border`, never raw hex. Extend the radius scale
   (card 16px, control 10px) and the type scale
   (12/13/14/16/20/24/32/40).

3. Self-hosted fonts as woff2 in public/fonts — Satoshi for headings, nav and
   numerals; Inter for body, tables and forms. No Google Fonts link, no
   external CDN. Add @font-face with font-display: swap.
   Apply `font-variant-numeric: tabular-nums` globally to every element that
   renders a number — money, counts, dates, table cells. This is not optional.

4. Restyle these shadcn primitives to the tokens: Button (primary / secondary /
   ghost / danger), Input, Select, Textarea, Checkbox, Switch, Badge, Card,
   Dialog, Sheet, DropdownMenu, Tooltip, Tabs, Table, Skeleton, Toast.
   - Hairline borders, not shadows. Shadows only on popovers, dropdowns, modals.
   - Transitions 120–180ms ease-out on hover and press.
   - Visible on-brand focus rings.
   - Honour prefers-reduced-motion.

5. A StatusChip component driven by the semantic tokens: success, warning,
   danger, info, neutral. Small, pill-shaped, low-saturation background with
   readable text. This is the ONLY place besides the accent where colour
   appears.

6. A /styleguide route rendering every token swatch, the type scale, and every
   component in every state, in both light and dark. This is how I review the
   design before any feature is built.

Acceptance: /styleguide renders correctly in light and dark, the toggle
persists across reload, no hardcoded hex exists in any component, and no
external font or stylesheet is requested at runtime.
```

## Prompt 0.3 — Supabase project and auth

```
Wire up Supabase and authentication.

1. src/lib/supabase.ts — a typed client reading VITE_SUPABASE_URL and
   VITE_SUPABASE_ANON_KEY from env. Fail loudly at startup if either is missing.

2. Migration: a `profiles` table as specified in section 3.9 of the plan —
   id (references auth.users), full_name, role ('admin' | 'staff' | 'intern'),
   email, phone, avatar_file_id, is_active, created_at.
   Add a trigger that creates a profile row whenever an auth user is created.

3. Enable RLS on profiles. Authenticated users may read all profiles. A user
   may update only their own row. Only `admin` may change the `role` column.

4. Email + password sign-in. No public sign-up page — accounts are created by
   an admin. Include a password reset flow.

5. An AuthProvider exposing { user, profile, role, loading, signIn, signOut }
   and a ProtectedRoute that redirects unauthenticated users to /login.

6. A login page styled with the design system: centred card, the colour logo
   (jantahr-high-resolution-color-logo 2.png) above the form, calm and minimal.
   Convert the logo PNGs in the project root to SVG first and use the SVGs —
   a 2000x1500 PNG is not a UI asset.

Do NOT build a roles admin UI. Do NOT build a permissions matrix. The `role`
column plus an isAdmin check is the entire authorisation model for now.

Acceptance: I can sign in, see a protected page, sign out, and the session
survives a page refresh.
```

## Prompt 0.4 — App shell

```
Build the application shell. Follow section 10.3 of the plan for form and
spacing.

1. A 264px sidebar, collapsible to a 68px icon rail with the state persisted.
   The reversed logo (jantahr-logo.png as SVG) sits at the top on the deep
   petrol background. Nav items are icon + label, and the ACTIVE item is a soft
   --primary-soft pill with --primary icon and text. Grouped with quiet
   uppercase section labels, exactly as in the reference dashboards.

   Nav (routes may render placeholders for now):
     Today (/)              — the day view, home screen
     Leads (/leads)
     Contacts (/contacts)
     Organisations (/organisations)
     Projects (/projects)
     Recruitment (/recruitment)
     Talent Pool (/talent)
     Academy (/academy)
     Finance (/finance)
     Expenses (/expenses)
     Content (/content)
     ---
     Tasks (/tasks)
     Reports (/reports)
     Settings (/settings)

2. A top bar: page title on the left; on the right a global search trigger
   showing "Search  ⌘K", a notifications bell, the theme toggle, and a user
   menu.

3. Content area max-width 1440px, centred, generous padding.

4. Fully responsive. Below 1024px the sidebar becomes a slide-over sheet. The
   layout must be genuinely usable on a phone — leads get added from the road.

5. Shared page primitives: PageHeader (title, description, actions),
   EmptyState (icon, message, and the action that fills the list), and
   PageSkeleton. Every empty list uses EmptyState — no bare "No data".

Acceptance: every route renders inside the shell, the sidebar collapses and
remembers, dark mode is correct throughout, and the phone layout works.
```

## Prompt 0.5 — Core schema: the spine

```
Create the core database schema. Read section 3.1 and section 3.9 of the plan
and implement EXACTLY the columns specified.

Migration files for: organisations, contacts, contact_roles, activities,
tasks, files, settings.

Critical requirements:

- contacts: unique index on lower(email); unique index on phone_e164.
  Phones are normalised to E.164 (+256...) before insert — write the
  normaliser as a shared util and use it everywhere.
- contact_roles is a JUNCTION table. One person can simultaneously be a lead,
  a candidate and a student. Do NOT add a `type` column to contacts.
- activities is a polymorphic timeline (subject_type, subject_id). Index
  (subject_type, subject_id, occurred_at desc). Every module will write to it.
- Full-text search: a tsvector column with a GIN index on contacts (name,
  email, phone) and organisations (name).
- updated_at maintained by trigger on every table.
- RLS enabled on all tables: authenticated users can read and write; only
  `admin` can delete.

Also create a Supabase Storage bucket `documents`, PRIVATE, with the `files`
table as its metadata index. Access via signed URLs only, never public reads.

Generate TypeScript types from the schema into src/types/database.ts and wire a
script to regenerate them.

Acceptance: migrations apply cleanly to a fresh database, types generate, and
inserting a duplicate email or duplicate phone is rejected by the database.
```

## Prompt 0.6 — Contacts and organisations

```
Build the Contacts and Organisations features. These are the spine — everything
later hangs off them, so get the patterns right here and reuse them.

Contacts:
- List view: server-side paginated (25/page), server-side search across name,
  email and phone, filter by role and by organisation. Columns: name, role
  chips, organisation, phone, email, last activity. ~20 rows visible without
  scrolling — tune the type scale down, do not use the marketing-shot density.
- Detail view: header with name, role chips, organisation and quick actions
  (call, WhatsApp, email). Below it a UNIFIED TIMELINE reading from `activities`
  — this component gets reused on organisations, projects and leads, so build
  it generic from the start.
- Create/edit in a slide-over sheet, not a separate page. Zod validation.
- Add-note composer that writes an activity.
- Merge duplicates: pick a survivor, repoint all foreign keys, keep both
  timelines, soft-delete the loser.

Organisations:
- Same list/detail pattern. Detail shows contacts at the organisation, plus
  empty placeholder panels for projects, documents and vacancies that later
  phases will fill.

Both must be fully keyboard navigable and must use EmptyState everywhere.

Acceptance: I can create a contact, attach it to an organisation, add a note,
see it in the timeline, search for it by partial phone number, and merge two
duplicates without losing history.
```

---

# PHASE 1 — Capture and follow-up

This is the phase that solves the actual daily pain. After it, Ops is worth
opening every morning.

## Prompt 1.1 — Leads pipeline

```
Build the Leads module. Read section 3.2 of the plan.

Schema: the `leads` table exactly as specified. Index owner_id, stage and
next_action_at — next_action_at drives the entire day view, so it must be fast.

Views:
- A Kanban board across the eight stages (new, contacted, qualified,
  proposal_sent, negotiation, won, lost, dormant) with drag-to-move. Each card
  shows contact name, organisation, value in UGX, owner avatar, and the
  next-action date colour-coded: red overdue, amber today, muted future.
- A table view as an alternative, with the same filters. Persist which view I
  last used.
- Detail view: contact and organisation summary, value, source, owner, stage
  history, the shared timeline component, and a prominent "Next action" block
  with date and note.

Rules:
- Moving a lead between stages writes a `stage_change` activity automatically.
- Setting a lead to `won` prompts to convert the organisation to a client and
  offers to create a project.
- Setting `lost` requires a reason.
- Every lead has an owner. Default to the current user.

Money: value_ugx is bigint shillings. Display as "UGX 4,500,000" with tabular
numerals. Input accepts digits with automatic thousand separators.

Acceptance: I can create a lead, drag it across stages, see stage changes in
its timeline, set a next action, and filter to just my overdue leads.
```

## Prompt 1.2 — Public lead capture endpoint

```
Build the public lead capture Edge Function. Read section 6 of the plan first.

This receives submissions from the EXISTING JantaHR website form, whose code we
cannot change. It must accept this exact payload and return this exact
response shape:

  Request body:
  { "leadType": "ai_training", "fullName": "", "email": "", "phone": "",
    "organization": "", "trainingUnit": "", "message": "", "honeypot": "",
    "sourcePage": "", "metadata": null, "submittedAt": "" }

  Response: {"ok": true}  or  {"ok": false, "error": "..."}

Requirements:
- Supabase Edge Function at /public-leads, using the SERVICE ROLE key
  server-side. The anon key is never used for this.
- Handle OPTIONS preflight with proper CORS — the website posts
  Content-Type: application/json, which triggers preflight. Restrict the
  allowed origin to the JantaHR website domain.
- Silently accept and discard any submission where `honeypot` is non-empty.
  Return {"ok": true} so the bot learns nothing.
- Per-IP rate limit. Body size cap 10KB. Zod-validate everything.
- Idempotency on (email, leadType, submittedAt) so a double-submit creates one
  lead.
- On success, in ONE transaction: find-or-create the contact (match on
  normalised email, then normalised phone), find-or-create the organisation if
  `organization` is present, add the 'lead' contact_role, create the lead with
  stage 'new' and source derived from leadType + sourcePage, and write an
  activity recording the raw payload.
- Never return any stored data. This endpoint is write-only.
- Notify both users by email that a lead arrived.

Also write, into docs/WEBSITE_CUTOVER.md, the exact steps to switch the
website over: which env var to change, to what value, and how to verify.
Note that the existing Google Apps Script should keep writing to the Google
Sheet in parallel for the first few weeks as a safety net.

Acceptance: posting the sample payload with curl creates a contact,
organisation and lead; posting it twice creates only one; a filled honeypot
returns ok:true and creates nothing; a cross-origin preflight succeeds.
```

## Prompt 1.3 — Tasks and reminders

```
Build tasks and the reminder infrastructure. Read section 8 of the plan.

Tasks: full CRUD on the `tasks` table, assignable, with due dates, priority,
and a polymorphic link to any record. A /tasks page grouped Overdue / Today /
This week / Later. Quick-add from anywhere.

Reminders — the important half. A reminder that only exists inside the app is
useless, so delivery is by EMAIL, not just an in-app badge.

1. A `notifications` table: recipient, kind, title, body, link, channel,
   sent_at, read_at.
2. A pg_cron job every 15 minutes calling an Edge Function that finds due
   items and queues notifications: tasks due, leads whose next_action_at has
   passed, and (in later phases) overdue invoices and starting cohorts.
3. Email delivery via Resend. Clean HTML matching the design system, with a
   deep link back into Ops.
4. Deduplicate — never send the same reminder twice.
5. In-app bell with unread count and a dropdown.
6. Per-user notification preferences in Settings.

Acceptance: a task due in the past produces exactly one email within 15
minutes, the bell shows it, and marking it read clears the badge.
```

## Prompt 1.4 — Signals engine

```
Build the signals engine — the flagging and recommendation layer. Read section
7.1 of the plan, which lists all twelve signal kinds and their triggers.

ARCHITECTURE, and this matters: signals are HYBRID, not pure LLM.
Deterministic SQL rules find the candidates — cheap, reliable, explainable.
The model only ranks them, writes the human sentence, and drafts the suggested
action. Never ask a model to decide *whether* something is overdue; the
database already knows that.

1. The `signals` table exactly as specified in section 3.8. Every signal stores
   its `evidence` jsonb — the facts that produced it — so I can always see why
   it fired.
2. A rules module: one pure, individually testable function per signal kind.
   Implement the phase-appropriate ones now: lead_going_cold, candidate_waiting
   (stub until Phase 3), duplicate_contact, and task_overdue. Leave clean
   extension points for the finance and recruitment signals.
3. A nightly pg_cron job that runs the rules, plus an on-demand refresh from
   the day view.
4. Signals are dismissible with a reason, and re-firing a dismissed signal is
   suppressed for a cooldown period. Nothing nags.
5. Every signal must carry a one-click suggested action. A signal with no
   action is a signal not worth showing.

Do NOT build predictive lead scoring, an insights dashboard, or a chatbot.
Section 7 of the plan says why.

Acceptance: a lead with next_action_at three days past generates exactly one
lead_going_cold signal with visible evidence and a working action button;
dismissing it stops it recurring during the cooldown.
```

## Prompt 1.5 — AI follow-up drafting

```
Add AI-drafted follow-up messages. Read section 7.2 of the plan.

The problem being solved: follow-ups don't happen because of the blank page,
not because of forgetting.

1. An Edge Function that calls the Claude API (claude-opus-5) server-side. The
   API key lives in Supabase secrets and NEVER reaches the browser.
2. Given a lead or contact id, assemble context: contact name, organisation,
   service interest, the last few activities, days elapsed, any linked quote
   and its amount and age, and the JantaHR company profile from settings.
3. Return three drafts: a formal email, a short WhatsApp message, and a brief
   call script. Ugandan English, professional, warm, not salesy. Never invent
   facts not present in the context.
4. UI: a "Draft follow-up" button on lead detail and on every relevant signal.
   Opens a sheet with the three drafts in tabs, fully editable. Buttons to copy,
   to open the mail client, or to open WhatsApp with the text pre-filled.
5. Sending is ALWAYS a deliberate human click. Nothing auto-sends, ever.
6. Log every generation as an activity so the record shows what was drafted.
7. Handle API failure gracefully — the button fails, the page does not.

Acceptance: on a lead that has gone quiet for a week, the drafts reference the
actual conversation history and the actual quote amount, and I can send one to
WhatsApp in two clicks.
```

## Prompt 1.6 — The Day View

```
Build the Day View at `/` — the home screen and the reason to open Ops. Read
section 10.5 of the plan.

This is a WORK QUEUE, not a metrics dashboard. Metrics dashboards get admired
once and never opened again.

Layout, top to bottom:

1. A greeting line with today's date and a one-sentence state of play
   ("4 follow-ups due, 2 quotes waiting on clients").
2. NEEDS YOU — the primary block. Overdue and due-today follow-ups, each row
   showing the contact, why it's flagged, how long it's been waiting, and a
   "Draft follow-up" button that opens the drafts from prompt 1.5 inline.
3. SIGNALS — open signals ranked urgent → warn → info, each with its evidence
   and its one-click action. Dismissible in place.
4. TODAY — tasks due today, inline-completable.
5. RECENT — a compact activity feed of what both users did, so Jeff and Dora
   can see each other's work without asking.
6. A quiet strip of numbers at the BOTTOM: open leads, pipeline value in UGX,
   active projects, tasks open. Small, muted, secondary. Not hero cards.

Design: follow the reference-dashboard language — white cards on the neutral
canvas, hairline borders, generous whitespace, the amber accent used ONCE on
this page for the single most urgent item. Everything else is ink and neutral.

Performance: one round trip. Write a Postgres function or view that returns
the whole payload rather than six separate queries. Skeleton while loading,
never a spinner.

Acceptance: the page loads in one request, every item is actionable without
navigating away, and a fresh install shows a genuine empty state rather than
zeroes.
```

## Prompt 1.7 — ⌘K command bar

```
Build the global command bar. This is the answer to "why wouldn't I just use
WhatsApp" — adding a lead must take four seconds.

- ⌘K / Ctrl+K from anywhere.
- Fuzzy search across contacts, organisations, leads and tasks, hitting the
  server-side full-text indexes from Phase 0. Debounced, cancellable.
- Actions with no typing required: New lead, New contact, New task, New
  organisation, Go to Today, Toggle theme.
- Natural-language quick-add: typing "lead Sarah Nakato 0772123456 training"
  parses into a pre-filled new-lead form. Parse locally with a regex-and-rules
  pass first; only fall back to the model when that fails.
- Full keyboard navigation, grouped results, recent items when empty.

Acceptance: from anywhere in the app I can add a lead with a name and phone
number, using only the keyboard, in under five seconds.
```

---

# PHASES 2–6 — outline only

Ask me to expand any of these into full prompts when you reach it. Written now,
they would encode guesses about names and shapes that Phase 1 will settle.

**Phase 2 — Money.** Documents schema and the quote → LPO → invoice → receipt
chain; the `JH-INV-YYYYMMDD-NNNN` numbering with row-locked gapless sequences
assigned only at issue; Uganda VAT config and the 6% WHT split on payments; PDF
generation with the colour logo; manual payment confirmation; expenses with
receipt upload; the money view.

**Phase 3 — Recruitment and talent pool.** Vacancies; the `/public-jobs`
endpoint and the website's second env-var switch; `/public-candidates`
self-registration with CV upload; CV parsing into structured fields; the
applications pipeline; interviews; pgvector semantic search; the client-facing
shortlist pack.

**Phase 4 — Projects.** Projects, milestones, coarse weekly time entry, project
expenses, estimated P&L clearly labelled as an estimate.

**Phase 5 — Academy.** Courses, cohorts, enrolments, entitlement unlocked by
confirmed payment, lessons with externally hosted video, attendance, progress,
certificate generation.

**Phase 6 — Content calendar and reporting.** The social content calendar with
AI drafting from vacancies and cohorts; the report set including WHT credits
for the annual return.

---

## Reviewing Antigravity's work

Full test requirements per phase are in [`prompts/TESTING.md`](prompts/TESTING.md),
including the phase completion gates. Beyond those, check each of these before
moving to the next prompt:

- [ ] Does it match the plan, or did it improvise? Improvisation in the schema
      is expensive later.
- [ ] Any hardcoded hex colours? Everything must come from tokens.
- [ ] Any list fetching a full table and filtering client-side?
- [ ] Any secret in client code? Grep the bundle for the service role key.
- [ ] Does it work in dark mode?
- [ ] Does it work on a phone?
- [ ] Are money values `bigint` shillings, never floats?
- [ ] Did it build something from section 12's out-of-scope list?

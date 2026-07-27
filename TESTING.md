# Testing Specification — JantaHR Ops

Every phase prompt references this file. Antigravity must satisfy the tier-1
requirements for a phase before that phase is considered done.

**Paste the "standing testing instructions" block below once, early in the
Antigravity session, alongside the standing instructions in
`ANTIGRAVITY_PROMPTS.md`.**

---

## The principle

This is a two-person internal tool, not a public SaaS. Chasing a coverage
percentage would stall the build for no benefit. So testing effort is spent
where being wrong is **expensive or invisible**, and skipped where being wrong
is obvious the moment you look at the screen.

- A misaligned button — you will see it. No test.
- VAT computed one shilling off across four hundred invoices — you will not see
  it, and URA might. Test it hard.

Three tiers, applied in that order.

| Tier                | What                                      | When it runs                                        |
| ------------------- | ----------------------------------------- | --------------------------------------------------- |
| **1 — Correctness** | Money, tax, numbering, identity, security | Required before a phase is done. CI-blocking        |
| **2 — Behaviour**   | State machines, rules, workflows          | Required for the phase that introduces them         |
| **3 — Smoke & E2E** | Critical user paths end to end            | A small fixed set, grown only when something breaks |

**Explicitly not required:** coverage thresholds, snapshot tests, tests for
shadcn primitives, tests of third-party libraries, or tests asserting that a
component renders a particular class name.

---

## Standing testing instructions — paste into the Antigravity session

```
TESTING RULES for every task in this project.

Read prompts/TESTING.md. It defines what must be tested and what must not.

1. Tooling: Vitest for unit and integration, Testing Library for components,
   Playwright for E2E. No other test runner.

2. Tier 1 (correctness) tests are MANDATORY and block a phase from being
   complete. They cover money arithmetic, tax computation, document numbering,
   identity/dedupe, and access control. Never skip one because it is awkward to
   set up.

3. Tier 2 (behaviour) tests are required for whichever phase introduces the
   behaviour — state machines, signal rules, workflow transitions.

4. Tier 3 is a small fixed set of E2E paths listed in TESTING.md. Do not add
   more without asking.

5. Write tests in the SAME task as the code they cover. Never leave them for a
   follow-up task — a follow-up task never comes.

6. Every test must be able to fail. After writing a test, deliberately break the
   code it covers, confirm the test goes red, then restore. Tell me you did
   this. A test that passes against broken code is worse than no test.

7. Do NOT test by mocking the thing under test. Database constraints are tested
   against a real local Postgres, not a mocked client. If a constraint only
   exists in application code, that is a bug — move it to the database.

8. `npm run check` (typecheck + lint + test) must pass before you report a task
   complete. Paste its output.

9. Never weaken a test to make it pass. If a test fails, either the code is
   wrong or the test encodes a wrong expectation — tell me which and why. Do not
   silently adjust an assertion.

10. Never use floating point in a money test. If an expected value is written as
    4500000.0 anywhere, that test is wrong.
```

---

## Tier 1 — Correctness. Non-negotiable.

### 1.1 Money (Phase 0)

Pure unit tests on `src/lib/format.ts`.

- `formatUGX(4500000n)` → `"UGX 4,500,000"`
- `formatUGX(0n)` → `"UGX 0"`
- `formatUGX(1n)` → `"UGX 1"`
- `formatUGX(999999999999n)` → correct separators at scale
- `formatUGXCompact` at 999, 1_000, 999_999, 1_000_000, 1_500_000, 1_000_000_000
- `parseUGX` accepts `"4,500,000"`, `"4500000"`, `"UGX 4,500,000"`, `" 4 500 000 "`
- `parseUGX` returns `null` for `""`, `"abc"`, `"4.5"`, `"-100"`, `"4,50,0000"`
- **Round trip:** for a set of values, `parseUGX(formatUGX(x)) === x`
- **Type guard:** a test asserting the functions reject `number` input at
  compile time (`@ts-expect-error`) — this is what keeps floats out permanently

### 1.2 Phone identity (Phase 0)

Pure unit tests on `src/lib/phone.ts`. These protect a unique index — a bug here
creates duplicate humans.

- `"0772123456"`, `"+256772123456"`, `"256772123456"`, `"0772 123 456"`,
  `"(0772) 123-456"`, `"+256 772 123 456"` all → `"+256772123456"`
- `null` for: `""`, `"0772"`, `"07721234567"` (too long), `"abcdefghij"`,
  `"+1234567890"` (non-UG, until the extension point is built)
- **Idempotency:** `normalize(normalize(x)) === normalize(x)`
- `formatPhoneDisplay("+256772123456")` → `"+256 772 123 456"`

### 1.3 Contact dedupe (Phase 0)

Integration tests against a real local Postgres.

- Inserting a second contact with the same email, differing only in case, is
  rejected by the database
- Inserting a second contact with the same phone in a different format is
  rejected — proves normalisation happens _before_ insert
- The merge routine repoints every foreign key, preserves both timelines, and
  leaves zero orphaned rows. Assert on row counts per referencing table

### 1.4 VAT and withholding tax (Phase 2)

The highest-value tests in the project. All integer arithmetic.

- `vat(1234567n)` → `222222n` — proves half-up rounding, not truncation
- `vat(4500000n)` → `810000n` — exact case
- `vat(0n)` → `0n`
- No test in this file contains a decimal point anywhere
- `total === subtotal + vat` for a large range of values, property-style
- **WHT settlement:** an invoice of 10,000,000 with a payment of
  `received 9,400,000 + withheld 600,000` settles as **paid**, not part-paid
- The same invoice with `received 9,400,000 + withheld 0` stays **part_paid**
- Multiple partial payments sum correctly and settle exactly at the total
- Overpayment is rejected or explicitly flagged — decide which, then test it
- The WHT annual-total report sums only `wht_withheld_ugx`, across a date range

### 1.5 Document numbering (Phase 2)

Gaplessness is an audit property, so test it the way it actually breaks —
concurrently.

- Format matches `JH-{QT|LPO|INV|RCT}-{YYYYMMDD}-{NNNN}` exactly
- A draft document has `number IS NULL`
- Issuing assigns the next number in the same transaction
- **Concurrency:** fire 50 simultaneous issue calls for the same type. Assert
  exactly 50 documents, 50 distinct numbers, zero gaps in the sequence, and no
  duplicates. This is the test that proves the row lock works — a naive
  `MAX(number)+1` implementation passes every serial test and fails this one
- Creating a draft and abandoning it leaves no gap
- Cancelling an issued document retains its number
- A number cannot be updated after issue — assert the database rejects it
- The sequence resets to 0001 on 1 January and continues within the year

### 1.6 Access control (Phases 0 and 3)

RLS tested by actually connecting as each role, not by reading the policy text.

- An anonymous client can read nothing from any table
- An `intern` cannot delete from any table
- Only `admin` can change `profiles.role`
- A file in the private `documents` bucket is not fetchable without a signed URL
- A signed URL expires
- The **service-role key does not appear in the built client bundle** — grep
  `dist/` for it in CI. This test alone justifies its existence

### 1.7 Public endpoints (Phases 1 and 3)

- Valid payload → one contact, one organisation, one lead
- Same payload twice → still exactly one lead (idempotency)
- Filled `honeypot` → HTTP 200 with `{"ok":true}` and **zero rows created**
- Malformed payload → `{"ok":false,"error":...}`, never a stack trace
- Body over the size cap is rejected before parsing
- Rate limit engages and then releases
- CORS preflight from the website origin succeeds; from another origin fails
- Response body never contains stored data
- Existing contact + new submission → adds a lead, does **not** duplicate the
  contact
- CV upload: rejects a `.exe` renamed to `.pdf` (check magic bytes, not the
  extension), rejects oversize, stores privately

---

## Tier 2 — Behaviour

### 2.1 Signal rules (Phase 1)

Each rule is a pure function, so each gets a table-driven test: input state →
expected signals. For every rule assert both that it **fires when it should**
and that it **stays silent when it shouldn't** — a rule that fires constantly is
as useless as one that never fires.

Plus: dismissal suppresses re-firing for the cooldown, and re-fires after it;
every generated signal carries non-empty `evidence`; every signal has an action.

### 2.2 Lead pipeline (Phase 1)

Stage change writes exactly one activity. `lost` without a reason is rejected.
`won` offers conversion. `next_action_at` correctly classifies overdue / today /
future at Kampala midnight boundaries — test at 23:59 and 00:01 EAT, which is
where timezone bugs actually live.

### 2.3 Reminders (Phase 1)

A due task produces exactly one notification. Running the cron twice produces no
second notification. A future task produces none. A user with the channel
disabled receives none.

### 2.4 Entitlement state machine (Phase 5)

`registered → invoiced → paid → active` — legal transitions succeed, illegal
ones are rejected. Confirming payment sets `entitled_at` and grants access.
Access is denied while unpaid. Refund or cancellation revokes it.

### 2.5 AI boundaries (Phases 1, 3)

Do not test model output wording. Test the plumbing:

- The prompt builder includes the expected context fields and no others
- An API failure returns a handled error and does not crash the page
- No AI call ever writes to the database without an explicit user confirmation
- CV parsing output is Zod-validated, and a malformed model response is
  rejected rather than persisted
- The Claude API key does not appear in the client bundle

---

## Tier 3 — End to end

A fixed set. Playwright, against a seeded local database. Do not expand it
without asking.

1. **Sign in → land on Today → sign out**
2. **Website lead → CRM:** POST the real website payload to the endpoint, then
   assert the lead appears in the UI with the correct contact and organisation
3. **Lead lifecycle:** create → move through stages → mark won → convert
4. **Quote to receipt:** create quote → convert to invoice → confirm a payment
   with WHT → receipt generated with a correct, unique number
5. **Candidate:** public registration with CV upload → appears in talent pool →
   parsed fields populated → findable by search
6. **⌘K:** add a lead using only the keyboard

---

## Phase completion gates

A phase is not done until all of these are true and the output is pasted back:

```
npm run check          # typecheck + lint + unit/integration — zero failures
npm run test:e2e       # from Phase 1 onward
```

- [ ] Every tier-1 item for the phase is implemented and passing
- [ ] Every tier-2 item introduced by the phase is passing
- [ ] Each new test was verified to fail against deliberately broken code
- [ ] No test was weakened to make it pass
- [ ] No floating-point number appears in any money test
- [ ] `grep -r "service_role" dist/` returns nothing

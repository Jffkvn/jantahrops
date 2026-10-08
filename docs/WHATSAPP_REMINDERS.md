# WhatsApp reminders — shelved

> **Status:** Shelved on 8 October 2026. Not scheduled. Revisit only after email
> reminders and the in-app bell are live and the team has used them for a while.
> Resolves open question 6 in `JANTAHR_OPS_BUILD_PLAN.md` §13 for now.

## Why it is shelved

The build plan (§8) makes **email the baseline** reminder channel and WhatsApp a
second channel for urgent items. Ops does not send email yet, so WhatsApp would
be built on top of reminder plumbing that does not exist. Email plus an in-app
bell come first. WhatsApp is added only if email reminders turn out to be
ignored in practice.

## What exists today

- Contact, lead, candidate and application detail sheets have a WhatsApp button
  that opens `https://wa.me/<number>` with **no message** filled in.
- `pg_cron` is already used for the nightly signals run
  (`20260801203215_signals.sql`), so a scheduler is available.
- No email sending, no notification table, no bell.

## The two options

### Option A — pre-filled click-to-chat links (free)

`https://wa.me/<e164-without-plus>?text=<url-encoded message>` opens WhatsApp on
the user's phone or desktop with a drafted message. The user presses send.

- **Cost:** none. **Setup:** none.
- **Good for:** messaging _clients and candidates_ — follow-ups, interview
  confirmations, payment nudges.
- **Not good for:** alerting _the team_. Nothing is sent until someone opens Ops
  or an email and taps the link. It is not a push channel.
- **Work:** small. Add a drafted `text` to the existing buttons, ideally from
  the AI drafting feature (§7.2). Can be done any time, independently of the
  rest of this document.

### Option B — Meta WhatsApp Cloud API (real push)

The only way to put an alert on a team member's phone without them opening
anything.

Prerequisites (owner: JantaHR, not engineering):

1. A **Meta Business account** (business.facebook.com), ideally verified.
2. A **WhatsApp Business Account** under it, created in Meta for Developers.
3. A **dedicated phone number** that is not registered on the regular WhatsApp
   or WhatsApp Business app (or is migrated off it). It must receive an SMS or
   call for verification.
4. **Message templates** submitted and approved by Meta. Business-initiated
   messages outside a 24-hour customer-service window must use an approved
   template. Reminders fit the _utility_ category, for example:
   `Reminder: {{1}} is due {{2}}. Open Ops: {{3}}`.
5. A **permanent access token** from a Meta _system user_ (not a personal
   token, which expires).
6. A **payment method** on the WhatsApp Business Account. Meta charges per
   delivered template message; check Meta's current rate card for Uganda.

Engineering work (about one build slice):

- `notifications` table: recipient, channel, subject, body, `send_after`,
  `sent_at`, `error`, idempotency key.
- Supabase Edge Function `send-whatsapp` calling
  `POST https://graph.facebook.com/<version>/<phone-number-id>/messages` with
  the template name and parameters. Token and phone-number id stored as
  Supabase secrets, never in the client bundle.
- `pg_cron` job (every few minutes) that picks due notifications and invokes the
  function. Retries with back-off; failures surface in the in-app bell.
- Per-user opt-in and a WhatsApp number on `profiles` (team members only).
- Optional webhook for delivery/read status.

Alternatives: a Business Solution Provider (Twilio, 360dialog, etc.) handles
some setup but adds a markup per message. Unofficial WhatsApp Web automation is
against WhatsApp's terms and risks the number being banned — do not use it.

## What triggers a reminder (from §8)

Task due, `next_action_at` reached, new public lead, new candidate
registration, invoice overdue, cohort starting, signal marked urgent. WhatsApp
would carry only the urgent subset; email carries everything.

## When to un-shelve

- Email reminders and the in-app bell are live, **and**
- the team reports missing reminders that were sent by email.

Option A can be picked up earlier on its own, since it needs no accounts.

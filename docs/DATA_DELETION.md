# Deleting leads and erasing people

Admins only. Staff don't see these buttons, and the database refuses the calls
for anyone who isn't an admin (`supabase/migrations/20261009150000_delete_and_erase.sql`).
Make someone an admin in Settings → Team.

## Delete a lead

Lead → **Admin → Delete lead**. Removes the lead, its activity history, signals,
tasks and the website submission that created it. The person's contact record
stays. Refused if the lead has quotes or invoices: mark it Lost instead.

## Erase a person (data deletion request, or test records)

Contact, candidate or lead → **Admin → Erase this person**. Shows exactly what
will go, then requires typing `ERASE`. Removes, in one go:

- the contact and their timeline
- every lead, with history, signals, tasks and website submissions
- the candidate profile, applications and interviews
- every stored file (CVs, imported documents) in the private `candidates` bucket
- every raw website submission made with their email

This is how JantaHR honours the right to deletion under the Uganda Data
Protection and Privacy Act 2019 (promised in every candidate confirmation email
and on the Privacy page). A record that an erasure happened, with no personal
details, is kept as an activity of type `erasure`.

**Refused** while the person is linked to finance documents, projects or
academy enrolments, which the business must keep. Remove or reassign those first.

## When a website form matches someone already in Ops

The public endpoints match on email, then phone. A form may fill a missing phone
or organisation, but never renames a contact or replaces a phone, because anyone
can type anyone's email into a website form. Differences are written on the
lead or candidate timeline and flagged as "Matched contact" in the team alert.
Fix the contact by hand if the form was right (click the name on the contact
page to rename).

## Imported names that need fixing

The August 2026 CV import produced some names that are email handles or CV
headings ("Career Objective"). Those candidates carry `needs_review` and show in
the Talent Pool's review filter. Renaming the contact clears the flag.

// JantaHR Ops — what to do when a website form matches someone already in Ops
// (same email, else same phone). Pure logic, no I/O, so it can be unit tested.
//
// Rule: a public form may FILL GAPS on an existing contact, never OVERWRITE.
// Anyone can type anyone's email into a website form, so letting a submission
// rename a person or replace their phone would let strangers edit our records.
// When the form disagrees with the record, the difference is written on the
// timeline and flagged in the team alert, and a person decides.

export interface ExistingContact {
  id: string;
  full_name: string;
  phone_e164: string | null;
  organisation_id: string | null;
}

export interface Submitted {
  fullName: string;
  /** Normalised +256 number, or null if the form had none or it wasn't Ugandan. */
  phone: string | null;
  /** What the person typed, for display when it couldn't be normalised. */
  rawPhone: string;
  organisationId: string | null;
}

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Fields the existing contact is missing and the form supplied. */
export function gapFill(existing: ExistingContact, submitted: Submitted): Record<string, string> {
  const fill: Record<string, string> = {};
  if (!existing.phone_e164 && submitted.phone) fill.phone_e164 = submitted.phone;
  if (!existing.organisation_id && submitted.organisationId) {
    fill.organisation_id = submitted.organisationId;
  }
  return fill;
}

/** Human-readable differences between the form and the record, if any. */
export function contactDifferences(existing: ExistingContact, submitted: Submitted): string[] {
  const out: string[] = [];
  const name = submitted.fullName.trim();
  if (name && normaliseName(name) !== normaliseName(existing.full_name)) {
    out.push(`name "${name}"`);
  }
  const shownPhone = submitted.phone ?? submitted.rawPhone.trim();
  if (shownPhone && existing.phone_e164 && submitted.phone !== existing.phone_e164) {
    out.push(`phone ${shownPhone}`);
  }
  return out;
}

/** Timeline note for the record, or null when the form matched it. */
export function differenceNote(existing: ExistingContact, differences: string[]): string | null {
  if (differences.length === 0) return null;
  return (
    `The website form gave ${differences.join(' and ')}, which differs from this contact ` +
    `("${existing.full_name}"). The contact was not changed. If the form is right, rename or ` +
    `update the contact.`
  );
}

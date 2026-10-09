// Run: deno test supabase/functions/_shared/
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { contactDifferences, differenceNote, gapFill, type ExistingContact } from './contact-match.ts';

const existing: ExistingContact = {
  id: 'c1',
  full_name: 'Freelance Product',
  phone_e164: '+256776339534',
  organisation_id: null,
};

Deno.test('a mismatching form is reported, never applied', () => {
  const submitted = { fullName: 'kev Odhis', phone: '+256720123567', rawPhone: '0720123567', organisationId: 'o1' };
  assertEquals(contactDifferences(existing, submitted), ['name "kev Odhis"', 'phone +256720123567']);
  // Only the empty organisation is filled; name and phone are left alone.
  assertEquals(gapFill(existing, submitted), { organisation_id: 'o1' });
  const note = differenceNote(existing, contactDifferences(existing, submitted))!;
  assertStringIncludes(note, 'name "kev Odhis" and phone +256720123567');
  assertStringIncludes(note, 'The contact was not changed');
});

Deno.test('a missing phone is filled in', () => {
  const noPhone = { ...existing, phone_e164: null };
  const submitted = { fullName: 'Freelance Product', phone: '+256720123567', rawPhone: '0720123567', organisationId: null };
  assertEquals(gapFill(noPhone, submitted), { phone_e164: '+256720123567' });
  assertEquals(contactDifferences(noPhone, submitted), []);
});

Deno.test('case, spacing and punctuation differences are not differences', () => {
  const submitted = { fullName: '  freelance   PRODUCT. ', phone: '+256776339534', rawPhone: '', organisationId: null };
  assertEquals(contactDifferences(existing, submitted), []);
  assertEquals(differenceNote(existing, []), null);
});

Deno.test('a non-Ugandan phone is shown as typed', () => {
  const submitted = { fullName: 'Freelance Product', phone: null, rawPhone: '+44 7700 900123', organisationId: null };
  assertEquals(contactDifferences(existing, submitted), ['phone +44 7700 900123']);
});

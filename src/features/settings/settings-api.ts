import { getSupabase } from '@/lib/supabase';
import { normalizeUgandanPhone } from '@/lib/phone';
import type { CompanyProfileRow, ProfileRow, UserRole } from '@/types/database';

/**
 * Settings — the company's own details, and who can see them.
 *
 * `company_profile` is a single-row table (`id` is always `true`). Everything
 * on it prints: the letterhead, the TIN URA needs to see, and the bank and
 * MoMo lines a client pays into. An invoice issued with these blank is an
 * invoice nobody can pay, which is why this page exists.
 */

export type CompanyProfileInput = Partial<
  Pick<
    CompanyProfileRow,
    | 'legal_name'
    | 'tin'
    | 'address'
    | 'email'
    | 'phone'
    | 'bank_details'
    | 'momo_details'
    | 'vat_registered'
    | 'vat_rate_bp'
    | 'wht_rate_bp'
  >
>;

export async function updateCompanyProfile(patch: CompanyProfileInput): Promise<void> {
  const db = getSupabase();
  const clean: CompanyProfileInput = { ...patch };
  if (clean.phone) clean.phone = normalizeUgandanPhone(clean.phone) ?? clean.phone;
  if (typeof clean.email === 'string') clean.email = clean.email.trim().toLowerCase() || null;

  // `.eq('id', true)` rather than a bare update: the CHECK constraint keeps the
  // table to one row, but an unfiltered UPDATE is a habit worth not forming.
  const { error } = await db.from('company_profile').update(clean).eq('id', true);
  if (error) throw error;
}

export async function listAllProfiles(): Promise<ProfileRow[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .order('is_active', { ascending: false })
    .order('full_name');
  if (error) throw error;
  return data ?? [];
}

export async function updateTeamMember(
  id: string,
  patch: { role?: UserRole; is_active?: boolean; full_name?: string },
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

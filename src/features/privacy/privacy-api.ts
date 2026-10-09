import { getSupabase } from '@/lib/supabase';

/**
 * Deleting leads and erasing people. Both are admin-only in the database
 * (supabase/migrations/20261009150000_delete_and_erase.sql); the UI hides the
 * buttons from staff, but the database is what actually enforces it.
 */

export interface ErasurePreview {
  full_name: string;
  email: string | null;
  leads: number;
  is_candidate: boolean;
  applications: number;
  submissions: number;
  /** Paths in the private `candidates` storage bucket. */
  files: string[];
  /** Records that must be kept and block the erasure, e.g. "2 finance document(s)". */
  blockers: string[];
}

const CANDIDATES_BUCKET = 'candidates';
const STORAGE_BATCH = 100;

export async function getErasurePreview(contactId: string): Promise<ErasurePreview> {
  const { data, error } = await getSupabase().rpc('contact_erasure_preview', {
    p_contact_id: contactId,
  });
  if (error) throw error;
  return data as ErasurePreview;
}

/**
 * Files first, then the database. Storage can't be touched from SQL, and doing
 * it in this order means a failure never leaves files behind with nothing in
 * the database pointing at them. Rerunning finishes a half-done erasure.
 */
export async function erasePerson(contactId: string, files: string[]): Promise<void> {
  const supabase = getSupabase();
  for (let i = 0; i < files.length; i += STORAGE_BATCH) {
    const { error } = await supabase.storage
      .from(CANDIDATES_BUCKET)
      .remove(files.slice(i, i + STORAGE_BATCH));
    if (error) throw new Error(`Could not delete their files: ${error.message}`);
  }
  const { error } = await supabase.rpc('erase_contact', { p_contact_id: contactId });
  if (error) throw error;
}

export async function deleteLead(leadId: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_lead', { p_lead_id: leadId });
  if (error) throw error;
}

/** The database raises readable messages; surface them, not "Error". */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) {
    return e.message;
  }
  return 'Something went wrong. Nothing was deleted.';
}

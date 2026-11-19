import { getSupabase } from '@/lib/supabase';
import type { WebSubmissionRow } from '@/types/database';

export interface FailedSubmission {
  id: string;
  allIds: string[];
  leadType: string;
  name: string;
  email: string | null;
  phone: string | null;
  targetLabel: string;
  hasCv: boolean;
  attemptCount: number;
  latestCreatedAt: string;
}

export interface RecoverSubmissionResult {
  ok: boolean;
  contactId?: string;
  candidateId?: string;
  applicationId?: string | null;
  leadId?: string;
  error?: string;
}

function asRecord(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : {};
}

function strField(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  return typeof val === 'string' ? val.trim() : '';
}

function formatTargetLabel(leadType: string, payload: Record<string, unknown>): string {
  if (leadType === 'candidate') {
    const slug = strField(payload, 'vacancySlug');
    if (!slug || slug === 'general-talent-pool') return 'Talent pool';
    return `Application · ${slug}`;
  }
  if (leadType === 'ai_training') {
    const unit = strField(payload, 'trainingUnit');
    return unit ? `AI training · ${unit}` : 'AI training';
  }
  const interest = strField(payload, 'interest');
  return interest ? `Website enquiry · ${interest}` : 'Website enquiry';
}

/**
 * Group unlinked `web_submissions` retries from the same visitor into one
 * actionable card while preserving every row ID so recover/dismiss clears all.
 */
export function groupFailedSubmissions(
  rows: Pick<WebSubmissionRow, 'id' | 'lead_type' | 'payload' | 'created_at'>[],
): FailedSubmission[] {
  const grouped = new Map<string, FailedSubmission>();

  for (const row of rows) {
    const p = asRecord(row.payload);
    const emailRaw = strField(p, 'email').toLowerCase();
    if (emailRaw.endsWith('@example.test')) continue;

    const email = emailRaw || null;
    const phone = strField(p, 'phone') || null;
    const dedupIdentity = email ?? phone ?? row.id;
    const key = `${row.lead_type}|${dedupIdentity}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.allIds.push(row.id);
      existing.attemptCount += 1;
      if (!existing.hasCv && Boolean(strField(p, 'cvPath'))) existing.hasCv = true;
      continue;
    }

    const name = strField(p, 'fullName') || 'Unknown visitor';
    grouped.set(key, {
      id: row.id,
      allIds: [row.id],
      leadType: row.lead_type,
      name,
      email,
      phone,
      targetLabel: formatTargetLabel(row.lead_type, p),
      hasCv: Boolean(strField(p, 'cvPath')),
      attemptCount: 1,
      latestCreatedAt: row.created_at,
    });
  }

  return Array.from(grouped.values());
}

export async function getFailedSubmissions(): Promise<FailedSubmission[]> {
  const { data, error } = await getSupabase()
    .from('web_submissions')
    .select('id, lead_type, payload, created_at')
    .is('contact_id', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return groupFailedSubmissions(data ?? []);
}

async function invokeIntakeAction<T extends { ok: boolean; error?: string }>(
  item: FailedSubmission,
  body: Record<string, unknown>,
  fallbackError: string,
): Promise<T> {
  const fnName = item.leadType === 'candidate' ? 'public-candidates' : 'public-leads';
  const res = await getSupabase().functions.invoke<T>(fnName, { body });
  if (res.error) {
    const errObj = res.error as { message?: unknown };
    throw new Error(typeof errObj.message === 'string' && errObj.message ? errObj.message : fallbackError);
  }
  const payload = res.data;
  if (!payload?.ok) {
    throw new Error(payload?.error ?? fallbackError);
  }
  return payload;
}

export function recoverFailedSubmission(
  item: FailedSubmission,
): Promise<RecoverSubmissionResult> {
  return invokeIntakeAction<RecoverSubmissionResult>(
    item,
    { action: 'recover_submission', submissionId: item.id },
    'Could not recover submission.',
  );
}

export async function dismissFailedSubmission(item: FailedSubmission): Promise<void> {
  await invokeIntakeAction<{ ok: boolean; error?: string }>(
    item,
    { action: 'dismiss_failed_submission', submissionIds: item.allIds },
    'Could not dismiss failed submission.',
  );
}

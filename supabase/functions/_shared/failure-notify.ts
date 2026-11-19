// JantaHR Ops — shared auth, deduplicated failure alerts, and dismiss helpers
// for public intake Edge Functions (`public-candidates` and `public-leads`).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { buildSubmissionFailureAlert, formatErrorMessage } from './failure-alert.ts';
import { runAfterResponse, sendNotification } from './mailer.ts';
import { opsLink } from './ops-url.ts';

const DEDUP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Verify either an Ops user session JWT, the runtime service_role secret,
 * or a valid project service_role API key.
 */
export async function requireStaffOrServiceAuth(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  supabase: SupabaseClient,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }
  if (bearerToken === serviceRoleKey) {
    return { ok: true };
  }
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(bearerToken);
  if (!authErr && user) {
    return { ok: true };
  }
  const probeClient = createClient(supabaseUrl, bearerToken, {
    auth: { persistSession: false },
  });
  const { error: adminErr } = await probeClient.auth.admin.listUsers({
    page: 1,
    perPage: 1,
  });
  if (adminErr) {
    return { ok: false, status: 401, error: 'Invalid or expired session.' };
  }
  return { ok: true };
}

/** Delete specific unlinked `web_submissions` rows when dismissed by Ops staff. */
export async function dismissUnlinkedSubmissions(
  supabase: SupabaseClient,
  submissionIds: string[],
): Promise<number> {
  const cleanIds = Array.from(
    new Set(submissionIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (cleanIds.length === 0) return 0;
  const { data, error } = await supabase
    .from('web_submissions')
    .delete()
    .in('id', cleanIds)
    .is('contact_id', null)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Send an immediate team alert on submission failure, skipping if the same
 * person (by email or phone) already had an unlinked failure within 15 minutes.
 */
export async function reportSubmissionFailureOnce(
  supabase: SupabaseClient,
  input: {
    endpoint: 'public-candidates' | 'public-leads';
    submissionId: string;
    fullName: string;
    email: string | null;
    rawPhone: string | null;
    normalizedPhone: string | null;
    targetLabel: string;
    cvPath?: string | null;
    err: unknown;
    submittedAt: string;
  },
): Promise<void> {
  try {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: recentRows } = await supabase
      .from('web_submissions')
      .select('id, payload')
      .is('contact_id', null)
      .gte('created_at', since)
      .neq('id', input.submissionId)
      .limit(50);

    const targetEmail = (input.email ?? '').trim().toLowerCase();
    const targetRawPhone = (input.rawPhone ?? '').trim();
    const targetNormPhone = (input.normalizedPhone ?? '').trim();

    const duplicate = (recentRows ?? []).some((row) => {
      const p = (row.payload ?? {}) as Record<string, unknown>;
      const prevEmail = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
      const prevPhone = typeof p.phone === 'string' ? p.phone.trim() : '';
      if (targetEmail && prevEmail && targetEmail === prevEmail) return true;
      if (targetNormPhone && prevPhone && targetNormPhone === prevPhone) return true;
      if (targetRawPhone && prevPhone && targetRawPhone === prevPhone) return true;
      return false;
    });

    if (duplicate) {
      console.log(`[${input.endpoint}] suppressed duplicate failure alert for ${targetEmail || targetNormPhone || input.fullName}`);
      return;
    }

    const alert = buildSubmissionFailureAlert({
      endpoint: input.endpoint,
      submissionId: input.submissionId,
      fullName: input.fullName,
      email: input.email,
      phone: input.normalizedPhone ?? input.rawPhone,
      targetLabel: input.targetLabel,
      cvPath: input.cvPath,
      errorSummary: formatErrorMessage(input.err),
      submittedAt: input.submittedAt,
      opsUrl: opsLink('/'),
    });

    const label = input.endpoint === 'public-candidates' ? 'candidate failure alert' : 'lead failure alert';
    await runAfterResponse(sendNotification(alert, label));
  } catch (alertErr) {
    console.error(`[${input.endpoint}] failed to send failure alert:`, alertErr);
  }
}

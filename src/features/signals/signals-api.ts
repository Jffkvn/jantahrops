import { getSupabase } from '@/lib/supabase';

export type SignalSeverity = 'info' | 'warn' | 'urgent';

export interface Signal {
  id: string;
  kind: string;
  severity: SignalSeverity;
  subject_type: string;
  subject_id: string;
  title: string;
  detail: string | null;
  evidence: Record<string, unknown>;
  suggested_action: string | null;
  generated_at: string;
}

const SEVERITY_RANK: Record<SignalSeverity, number> = { urgent: 0, warn: 1, info: 2 };

/**
 * Runs the deterministic rule engine, then returns the open signals ranked
 * most-severe first. Generating on read keeps signals live at this scale; a
 * nightly cron covers the case where nobody opens the app.
 */
export async function refreshAndListSignals(): Promise<Signal[]> {
  const supabase = getSupabase();

  // Best-effort: if the RPC fails we still show whatever is already open.
  await supabase.rpc('generate_signals');

  const { data, error } = await supabase
    .from('signals')
    .select('id, kind, severity, subject_type, subject_id, title, detail, evidence, suggested_action, generated_at')
    .eq('status', 'open')
    .order('generated_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Signal[];
  return rows.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

export async function dismissSignal(id: string): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('signals')
    .update({ status: 'dismissed', dismissed_by: user?.id ?? null, dismissed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

import { getSupabase } from '@/lib/supabase';
import type { LeadWithRelations } from '@/features/leads/leads-api';

const LEAD_SELECT = `
  *,
  contact:contacts!leads_contact_id_fkey ( id, full_name, email, phone_e164 ),
  organisation:organisations!leads_organisation_id_fkey ( id, name ),
  owner:profiles!leads_owner_id_fkey ( id, full_name )
`;

/** End of the current day in Kampala, as an ISO instant. */
function endOfKampalaToday(): string {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
  // 23:59:59 EAT — anything with next_action_at at/before this is due today or overdue.
  return new Date(`${todayStr}T23:59:59+03:00`).toISOString();
}

export interface DayView {
  /** Leads whose follow-up is due today or overdue, soonest first. */
  dueFollowUps: LeadWithRelations[];
  counts: {
    openLeads: number;
    pipelineValueUgx: number;
    dueToday: number;
  };
}

/**
 * The Day View is a work queue, not a metrics dashboard: the follow-ups that
 * need action come first and in full; the numbers are a quiet footnote.
 *
 * "Open" excludes the terminal stages (won/lost/dormant). "Due" means a
 * next_action_at at or before the end of today in Kampala.
 */
export async function getDayView(): Promise<DayView> {
  const supabase = getSupabase();
  const openStages = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation'] as const;
  const dueCutoff = endOfKampalaToday();

  const [dueRes, openRes] = await Promise.all([
    supabase
      .from('leads')
      .select(LEAD_SELECT)
      .in('stage', openStages)
      .not('next_action_at', 'is', null)
      .lte('next_action_at', dueCutoff)
      .order('next_action_at', { ascending: true }),
    supabase.from('leads').select('value_ugx').in('stage', openStages),
  ]);

  if (dueRes.error) throw dueRes.error;
  if (openRes.error) throw openRes.error;

  const dueFollowUps = (dueRes.data ?? []) as unknown as LeadWithRelations[];
  const openLeads = openRes.data ?? [];
  const pipelineValueUgx = openLeads.reduce((sum, l) => sum + (l.value_ugx ?? 0), 0);

  return {
    dueFollowUps,
    counts: {
      openLeads: openLeads.length,
      pipelineValueUgx,
      dueToday: dueFollowUps.length,
    },
  };
}

import { getSupabase } from '@/lib/supabase';

/**
 * "New from the website": leads, job applications and talent-pool sign-ups
 * that arrived through jantahr.com and nobody has reviewed yet
 * (reviewed_at is null; see migration 20261009170000_review_queue_and_digest).
 */

export type ArrivalKind = 'lead' | 'application' | 'candidate';

export interface Arrival {
  kind: ArrivalKind;
  id: string;
  name: string;
  /** e.g. "Enquiry · HR consulting", "Application · Payroll Officer". */
  detail: string;
  createdAt: string;
  /** Applications: where to open them, and the candidate to mark with them. */
  vacancyId?: string;
  candidateId?: string;
}

const LIMIT = 50;

/** Website lead sources look like "Website (ai_training) /ai-training". */
export function leadLabel(source: string | null): string {
  if (source?.includes('(ai_training)')) return 'AI training registration';
  if (source?.includes('(contact)')) return 'Enquiry';
  return 'Lead';
}

interface LeadQ {
  id: string;
  created_at: string;
  source: string | null;
  service_interest: string | null;
  contact: { full_name: string } | null;
}
interface AppQ {
  id: string;
  created_at: string;
  vacancy_id: string;
  candidate_id: string;
  vacancy: { title: string } | null;
  candidate: { contact: { full_name: string } | null } | null;
}
interface CandQ {
  id: string;
  created_at: string;
  headline: string | null;
  contact: { full_name: string } | null;
}

export async function getNewArrivals(): Promise<Arrival[]> {
  const supabase = getSupabase();
  const [leads, apps, cands] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, created_at, source, service_interest, contact:contacts!leads_contact_id_fkey ( full_name )',
      )
      .is('reviewed_at', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase
      .from('applications')
      .select(
        `id, created_at, vacancy_id, candidate_id,
         vacancy:vacancies!applications_vacancy_id_fkey ( title ),
         candidate:candidates!applications_candidate_id_fkey ( contact:contacts!candidates_contact_id_fkey ( full_name ) )`,
      )
      .is('reviewed_at', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase
      .from('candidates')
      .select('id, created_at, headline, contact:contacts!candidates_contact_id_fkey ( full_name )')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ]);
  if (leads.error) throw leads.error;
  if (apps.error) throw apps.error;
  if (cands.error) throw cands.error;

  const appRows = (apps.data ?? []) as unknown as AppQ[];
  // An applicant is new as a candidate too; show the application, not both.
  const applying = new Set(appRows.map((a) => a.candidate_id));

  const out: Arrival[] = [
    ...((leads.data ?? []) as unknown as LeadQ[]).map((l) => ({
      kind: 'lead' as const,
      id: l.id,
      name: l.contact?.full_name ?? 'Unknown contact',
      detail: [leadLabel(l.source), l.service_interest].filter(Boolean).join(' · '),
      createdAt: l.created_at,
    })),
    ...appRows.map((a) => ({
      kind: 'application' as const,
      id: a.id,
      name: a.candidate?.contact?.full_name ?? 'Unknown candidate',
      detail: `Application · ${a.vacancy?.title ?? 'vacancy'}`,
      createdAt: a.created_at,
      vacancyId: a.vacancy_id,
      candidateId: a.candidate_id,
    })),
    ...((cands.data ?? []) as unknown as CandQ[])
      .filter((c) => !applying.has(c.id))
      .map((c) => ({
        kind: 'candidate' as const,
        id: c.id,
        name: c.contact?.full_name ?? 'Unknown candidate',
        detail: ['Talent pool', c.headline].filter(Boolean).join(' · '),
        createdAt: c.created_at,
      })),
  ];
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const TABLE: Record<ArrivalKind, 'leads' | 'applications' | 'candidates'> = {
  lead: 'leads',
  application: 'applications',
  candidate: 'candidates',
};

export async function markReviewed(items: Arrival[]): Promise<void> {
  if (items.length === 0) return;
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const patch = { reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null };

  const ids: Record<ArrivalKind, string[]> = { lead: [], application: [], candidate: [] };
  for (const item of items) {
    ids[item.kind].push(item.id);
    // Reviewing an application is reviewing the person who sent it.
    if (item.kind === 'application' && item.candidateId) ids.candidate.push(item.candidateId);
  }

  for (const kind of Object.keys(ids) as ArrivalKind[]) {
    if (ids[kind].length === 0) continue;
    const { error } = await supabase
      .from(TABLE[kind])
      .update(patch)
      .in('id', ids[kind])
      .is('reviewed_at', null);
    if (error) throw error;
  }
}

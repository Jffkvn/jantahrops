import { getSupabase } from '@/lib/supabase';
import type { LeadStage } from '@/types/database';

export interface VacancySearchResult {
  vacancyId: string;
  title: string;
  status: string;
}

/**
 * Server-side quick search over vacancies, matched by title. Capped small —
 * this is a jump-to, not a report.
 */
export async function searchVacancies(query: string, limit = 8): Promise<VacancySearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('vacancies')
    .select('id, title, status')
    .ilike('title', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    vacancyId: row.id,
    title: row.title,
    status: row.status,
  }));
}

export interface CandidateSearchResult {
  candidateId: string;
  contactName: string;
  headline: string | null;
}

/**
 * Server-side quick search over candidates. Matches the contact's name or the
 * candidate's own FTS vector (headline + skills) — same resolution approach as
 * searchLeads.
 */
export async function searchCandidates(query: string, limit = 8): Promise<CandidateSearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const supabase = getSupabase();

  const [{ data: nameMatches }, { data: ownMatches }] = await Promise.all([
    supabase.from('contacts').select('id').ilike('full_name', `%${term}%`).limit(50),
    supabase.from('candidates').select('id').textSearch('search_tsv', term, {
      type: 'plain',
      config: 'simple',
    }),
  ]);

  const contactIds = (nameMatches ?? []).map((c) => c.id);
  const ownIds = (ownMatches ?? []).map((c) => c.id);
  const ids = new Set([...contactIds, ...ownIds]);
  if (ids.size === 0) return [];

  const { data, error } = await supabase
    .from('candidates')
    .select(
      `id, headline,
       contact:contacts!candidates_contact_id_fkey ( full_name )`,
    )
    .in('id', [...ids])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      headline: string | null;
      contact: { full_name: string } | null;
    };
    return {
      candidateId: r.id,
      contactName: r.contact?.full_name ?? 'Unknown',
      headline: r.headline,
    };
  });
}

export interface LeadSearchResult {
  leadId: string;
  contactName: string;
  organisationName: string | null;
  stage: LeadStage;
  valueUgx: number;
}

/**
 * Server-side quick search over leads, matched by the contact's name/email or
 * the organisation name. PostgREST can't filter on an embedded resource with
 * `.or`, so we resolve matching contact and organisation ids first, then fetch
 * the leads that reference them. Capped small — this is a jump-to, not a report.
 */
export async function searchLeads(query: string, limit = 8): Promise<LeadSearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const supabase = getSupabase();
  const like = `%${term}%`;

  const [{ data: contacts }, { data: orgs }] = await Promise.all([
    supabase.from('contacts').select('id').or(`full_name.ilike.${like},email.ilike.${like}`).limit(50),
    supabase.from('organisations').select('id').ilike('name', like).limit(50),
  ]);

  const contactIds = (contacts ?? []).map((c) => c.id);
  const orgIds = (orgs ?? []).map((o) => o.id);
  if (contactIds.length === 0 && orgIds.length === 0) return [];

  const filters: string[] = [];
  if (contactIds.length) filters.push(`contact_id.in.(${contactIds.join(',')})`);
  if (orgIds.length) filters.push(`organisation_id.in.(${orgIds.join(',')})`);

  const { data, error } = await supabase
    .from('leads')
    .select(
      `id, stage, value_ugx,
       contact:contacts!leads_contact_id_fkey ( full_name ),
       organisation:organisations!leads_organisation_id_fkey ( name )`,
    )
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      stage: LeadStage;
      value_ugx: number;
      contact: { full_name: string } | null;
      organisation: { name: string } | null;
    };
    return {
      leadId: r.id,
      contactName: r.contact?.full_name ?? 'Unknown',
      organisationName: r.organisation?.name ?? null,
      stage: r.stage,
      valueUgx: r.value_ugx,
    };
  });
}

export interface ParsedQuickLead {
  name: string;
  phone?: string | undefined;
  rest?: string | undefined;
}

/**
 * Parses a natural-language quick-add like "lead Sarah Nakato 0772123456
 * training" into name + phone + remainder, entirely with rules (no model). The
 * phone is any 9–12 digit run; text before it is the name, after it the note.
 */
export function parseQuickLead(input: string): ParsedQuickLead | null {
  const m = /^\s*(?:lead|add)\s+(.+)$/i.exec(input);
  if (!m || !m[1]) return null;
  const body = m[1].trim();

  const phoneMatch = /(\+?\d[\d\s-]{7,}\d)/.exec(body);
  if (!phoneMatch) {
    // No phone yet — treat the whole thing as a name if it has letters.
    return /[a-z]/i.test(body) ? { name: body } : null;
  }
  const phone = phoneMatch[1]?.replace(/[\s-]/g, '');
  const before = body.slice(0, phoneMatch.index).trim();
  const after = body.slice(phoneMatch.index + phoneMatch[0].length).trim();
  if (!before) return null;
  return { name: before, phone, rest: after || undefined };
}

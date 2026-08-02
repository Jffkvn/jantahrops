import { getSupabase } from '@/lib/supabase';
import { documentTotals, lineTotalUgx } from '@/lib/money';
import type {
  DocumentRow,
  DocumentLineRow,
  PaymentRow,
  DocumentType,
  DocumentStatus,
  PaymentMethod,
  ExpenseRow,
  ExpenseCategory,
  FinanceSummaryResult,
  ExpenseCategorySummaryResult,
  OrganisationRow,
} from '@/types/database';

export interface CreateDraftDocumentInput {
  type: DocumentType;
  organisation_id: string;
  contact_id?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  terms?: string | null;
  lines?: {
    description: string;
    qty: number;
    unit?: string | null;
    unit_price_ugx: bigint;
    tax_treatment?: string;
  }[];
}

export interface AddLineInput {
  document_id: string;
  description: string;
  qty?: number;
  unit?: string | null;
  unit_price_ugx: bigint;
  tax_treatment?: string;
  position?: number;
}

export interface UpdateLineInput {
  line_id: string;
  description?: string;
  qty?: number;
  unit?: string | null;
  unit_price_ugx?: bigint;
  tax_treatment?: string;
  position?: number;
}

export interface RecordPaymentInput {
  document_id: string;
  amount_received_ugx: bigint;
  wht_withheld_ugx?: bigint;
  method: PaymentMethod;
  reference?: string | null;
  proof_file_id?: string | null;
  received_at?: string | null;
  notes?: string | null;
}

export interface UpdateDraftDocumentInput {
  organisation_id?: string;
  contact_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  valid_until?: string | null;
  vat_applicable?: boolean;
  notes?: string | null;
  terms?: string | null;
}

export async function updateDraftDocument(
  docId: string,
  patch: UpdateDraftDocumentInput,
): Promise<DocumentRow> {
  const db = getSupabase();
  const { data, error } = await db
    .from('documents')
    .update({
      ...(patch.organisation_id !== undefined ? { organisation_id: patch.organisation_id } : {}),
      ...(patch.contact_id !== undefined ? { contact_id: patch.contact_id } : {}),
      ...(patch.issue_date !== undefined ? { issue_date: patch.issue_date } : {}),
      ...(patch.due_date !== undefined ? { due_date: patch.due_date } : {}),
      ...(patch.valid_until !== undefined ? { valid_until: patch.valid_until } : {}),
      ...(patch.vat_applicable !== undefined ? { vat_applicable: patch.vat_applicable } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.terms !== undefined ? { terms: patch.terms } : {}),
    })
    .eq('id', docId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getCompanyProfile() {
  const db = getSupabase();
  const { data, error } = await db.from('company_profile').select('*').single();
  if (error) throw error;
  return data;
}

export async function listOrganisations(search = '', limit = 8): Promise<OrganisationRow[]> {
  const db = getSupabase();
  let query = db.from('organisations').select('*').order('name').limit(limit);
  const term = search.trim();
  if (term) query = query.ilike('name', `%${term}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listContactsForOrganisation(
  organisationId: string,
): Promise<{ id: string; full_name: string }[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from('contacts')
    .select('id, full_name')
    .eq('organisation_id', organisationId)
    .order('full_name');
  if (error) throw error;
  return data ?? [];
}

export async function addDocumentActivity(
  docId: string,
  type: 'note' | 'document' | 'system' | 'payment',
  body: string,
): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from('activities').insert({
    subject_type: 'document',
    subject_id: docId,
    type,
    body,
  });
  if (error) throw error;
}

export async function getDocumentTimeline(docId: string) {
  const db = getSupabase();
  const { data, error } = await db
    .from('activities')
    .select('*')
    .eq('subject_type', 'document')
    .eq('subject_id', docId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateEfris(
  docId: string,
  patch: { efris_fdn?: string | null; efris_qr_url?: string | null; efris_status?: string },
): Promise<DocumentRow> {
  const db = getSupabase();
  const { data, error } = await db
    .from('documents')
    .update(patch)
    .eq('id', docId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDraftDocument(docId: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from('documents').delete().eq('id', docId);
  if (error) throw error;
}

export async function getInvoiceBalance(docId: string): Promise<number | null> {
  const db = getSupabase();
  const { data } = await db
    .from('v_invoice_balances')
    .select('balance_ugx')
    .eq('id', docId)
    .maybeSingle();
  return data?.balance_ugx ?? null;
}

export interface DocumentFilter {
  type?: DocumentType;
  status?: DocumentStatus;
  organisation_id?: string;
  related_type?: string;
  related_id?: string;
  limit?: number;
}

export interface ListDocumentsParams {
  type?: DocumentType | 'all';
  status?: DocumentStatus | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface DocumentListItem extends DocumentRow {
  organisation: Pick<OrganisationRow, 'id' | 'name' | 'tin'> | null;
  /** Outstanding balance for issued/part-paid invoices, else null. */
  balance_ugx: number | null;
}

export interface ListDocumentsResult {
  rows: DocumentListItem[];
  total: number;
}

const DOCUMENT_LIST_SELECT = `
  *,
  organisation:organisations!documents_organisation_id_fkey ( id, name, tin )
`;

export async function listDocumentsPaginated(
  params: ListDocumentsParams = {},
): Promise<ListDocumentsResult> {
  const supabase = getSupabase();
  const { type = 'all', status = 'all', search = '', page = 0, pageSize = 25 } = params;

  let query = supabase.from('documents').select(DOCUMENT_LIST_SELECT, { count: 'exact' });
  if (type !== 'all') query = query.eq('type', type);
  if (status !== 'all') query = query.eq('status', status);

  const term = search.trim();
  if (term) {
    const like = `%${term}%`;
    // Number match is direct; organisation name matches resolve to id list first.
    const { data: orgs } = await supabase.from('organisations').select('id').ilike('name', like);
    const orgIds = (orgs ?? []).map((o) => o.id);
    const filters: string[] = [`number.ilike.${like}`];
    if (orgIds.length) filters.push(`organisation_id.in.(${orgIds.join(',')})`);
    query = query.or(filters.join(','));
  }

  const from = page * pageSize;
  query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as DocumentListItem[];
  const ids = rows.map((r) => r.id);

  // Balance comes from the view, only meaningful for issued/part-paid invoices.
  let balances = new Map<string, number>();
  if (ids.length > 0) {
    const { data: balData } = await supabase
      .from('v_invoice_balances')
      .select('id, balance_ugx')
      .in('id', ids);
    balances = new Map((balData ?? []).map((b) => [b.id, b.balance_ugx]));
  }

  return {
    rows: rows.map((r) => ({ ...r, balance_ugx: balances.get(r.id) ?? null })),
    total: count ?? 0,
  };
}

export async function getFinanceSummary(): Promise<FinanceSummaryResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('finance_summary');
  if (error) throw error;
  return data;
}

// --- expenses --------------------------------------------------------------

export interface ListExpensesParams {
  category?: ExpenseCategory | 'all';
  /** YYYY-MM month filter, e.g. "2026-08". */
  month?: string;
  page?: number;
  pageSize?: number;
}

export interface ListExpensesResult {
  rows: ExpenseRow[];
  total: number;
}

export async function listExpenses(params: ListExpensesParams = {}): Promise<ListExpensesResult> {
  const supabase = getSupabase();
  const { category = 'all', month, page = 0, pageSize = 25 } = params;

  let query = supabase.from('expenses').select('*', { count: 'exact' });
  if (category !== 'all') query = query.eq('category', category);
  if (month) {
    const from = `${month}-01`;
    const to = `${month}-31`;
    query = query.gte('incurred_on', from).lte('incurred_on', to);
  }

  const fromIdx = page * pageSize;
  query = query.order('incurred_on', { ascending: false }).range(fromIdx, fromIdx + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getExpense(id: string): Promise<ExpenseRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('expenses').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  description?: string | null;
  amount_ugx: bigint;
  incurred_on: string; // YYYY-MM-DD
  vendor?: string | null;
  organisation_id?: string | null;
  receipt_file_id?: string | null;
}

export async function createExpense(input: CreateExpenseInput): Promise<ExpenseRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      category: input.category,
      description: input.description || null,
      amount_ugx: Number(input.amount_ugx),
      incurred_on: input.incurred_on,
      vendor: input.vendor || null,
      organisation_id: input.organisation_id || null,
      receipt_file_id: input.receipt_file_id || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface UpdateExpenseInput {
  category?: ExpenseCategory;
  description?: string | null;
  amount_ugx?: bigint;
  incurred_on?: string;
  vendor?: string | null;
  organisation_id?: string | null;
  receipt_file_id?: string | null;
}

export async function updateExpense(id: string, patch: UpdateExpenseInput): Promise<ExpenseRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('expenses')
    .update({
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.amount_ugx !== undefined ? { amount_ugx: Number(patch.amount_ugx) } : {}),
      ...(patch.incurred_on !== undefined ? { incurred_on: patch.incurred_on } : {}),
      ...(patch.vendor !== undefined ? { vendor: patch.vendor } : {}),
      ...(patch.organisation_id !== undefined ? { organisation_id: patch.organisation_id } : {}),
      ...(patch.receipt_file_id !== undefined ? { receipt_file_id: patch.receipt_file_id } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

export async function getExpenseCategorySummary(
  month: string,
): Promise<ExpenseCategorySummaryResult> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('expenses_category_summary', {
    p_month: `${month}-01`,
  });
  if (error) throw error;
  return data;
}

export async function recalcTotals(docId: string): Promise<DocumentRow> {
  const db = getSupabase();

  // Fetch document & lines
  const { data: doc, error: docErr } = await db
    .from('documents')
    .select('*')
    .eq('id', docId)
    .single();

  if (docErr || !doc) {
    throw new Error(docErr?.message || 'Document not found');
  }

  const { data: lines, error: linesErr } = await db
    .from('document_lines')
    .select('*')
    .eq('document_id', docId);

  if (linesErr) {
    throw new Error(linesErr.message);
  }

  const formattedLines = (lines || []).map((l) => ({
    qty: Number(l.qty),
    unitPriceUgx: BigInt(l.unit_price_ugx),
  }));

  const totals = documentTotals(formattedLines, doc.vat_applicable, BigInt(doc.vat_rate_bp));

  const { data: updatedDoc, error: updateErr } = await db
    .from('documents')
    .update({
      subtotal_ugx: Number(totals.subtotalUgx),
      vat_amount_ugx: Number(totals.vatUgx),
      total_ugx: Number(totals.totalUgx),
    })
    .eq('id', docId)
    .select('*')
    .single();

  if (updateErr || !updatedDoc) {
    throw new Error(updateErr?.message || 'Failed to update document totals');
  }

  return updatedDoc;
}

export async function createDraftDocument(input: CreateDraftDocumentInput): Promise<DocumentRow> {
  const db = getSupabase();

  const { data: doc, error: docErr } = await db
    .from('documents')
    .insert({
      type: input.type,
      organisation_id: input.organisation_id,
      contact_id: input.contact_id || null,
      related_type: input.related_type || null,
      related_id: input.related_id || null,
      issue_date: input.issue_date || null,
      due_date: input.due_date || null,
      valid_until: input.valid_until || null,
      notes: input.notes || null,
      terms: input.terms || null,
      status: 'draft',
    })
    .select('*')
    .single();

  if (docErr || !doc) {
    throw new Error(docErr?.message || 'Failed to create draft document');
  }

  if (input.lines && input.lines.length > 0) {
    const lineInserts = input.lines.map((l, index) => {
      const computedTotal = lineTotalUgx(l.qty, l.unit_price_ugx);
      return {
        document_id: doc.id,
        position: index,
        description: l.description,
        qty: l.qty,
        unit: l.unit || null,
        unit_price_ugx: Number(l.unit_price_ugx),
        line_total_ugx: Number(computedTotal),
        tax_treatment: l.tax_treatment || 'standard',
      };
    });

    const { error: linesErr } = await db.from('document_lines').insert(lineInserts);
    if (linesErr) {
      throw new Error(linesErr.message);
    }
  }

  return recalcTotals(doc.id);
}

export async function addLine(input: AddLineInput): Promise<DocumentLineRow> {
  const db = getSupabase();
  const qty = input.qty ?? 1;
  const computedTotal = lineTotalUgx(qty, input.unit_price_ugx);

  const { data: line, error } = await db
    .from('document_lines')
    .insert({
      document_id: input.document_id,
      description: input.description,
      qty,
      unit: input.unit || null,
      unit_price_ugx: Number(input.unit_price_ugx),
      line_total_ugx: Number(computedTotal),
      tax_treatment: input.tax_treatment || 'standard',
      position: input.position ?? 0,
    })
    .select('*')
    .single();

  if (error || !line) {
    throw new Error(error?.message || 'Failed to add line');
  }

  await recalcTotals(input.document_id);
  return line;
}

export async function updateLine(input: UpdateLineInput): Promise<DocumentLineRow> {
  const db = getSupabase();

  const { data: existing } = await db
    .from('document_lines')
    .select('*')
    .eq('id', input.line_id)
    .single();

  if (!existing) {
    throw new Error('Line not found');
  }

  const qty = input.qty ?? Number(existing.qty);
  const unitPriceUgx =
    input.unit_price_ugx !== undefined ? input.unit_price_ugx : BigInt(existing.unit_price_ugx);
  const computedTotal = lineTotalUgx(qty, unitPriceUgx);

  const { data: updated, error } = await db
    .from('document_lines')
    .update({
      description: input.description ?? existing.description,
      qty,
      unit: input.unit !== undefined ? input.unit : existing.unit,
      unit_price_ugx: Number(unitPriceUgx),
      line_total_ugx: Number(computedTotal),
      tax_treatment: input.tax_treatment ?? existing.tax_treatment,
      position: input.position ?? existing.position,
    })
    .eq('id', input.line_id)
    .select('*')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to update line');
  }

  await recalcTotals(existing.document_id);
  return updated;
}

export async function removeLine(lineId: string): Promise<void> {
  const db = getSupabase();
  const { data: line } = await db
    .from('document_lines')
    .select('document_id')
    .eq('id', lineId)
    .single();

  if (!line) return;

  const { error } = await db.from('document_lines').delete().eq('id', lineId);
  if (error) {
    throw new Error(error.message);
  }

  await recalcTotals(line.document_id);
}

export async function issueDocument(docId: string): Promise<string> {
  const db = getSupabase();
  const { data: number, error } = await db.rpc('issue_document', {
    p_doc_id: docId,
  });

  if (error || !number) {
    throw new Error(error?.message || 'Failed to issue document');
  }

  return number;
}

export async function acceptQuote(docId: string): Promise<DocumentRow> {
  const db = getSupabase();
  const { data: doc, error } = await db
    .from('documents')
    .update({ status: 'accepted' })
    .eq('id', docId)
    .select('*')
    .single();

  if (error || !doc) {
    throw new Error(error?.message || 'Failed to accept quote');
  }

  return doc;
}

export async function rejectQuote(docId: string): Promise<DocumentRow> {
  const db = getSupabase();
  const { data: doc, error } = await db
    .from('documents')
    .update({ status: 'rejected' })
    .eq('id', docId)
    .select('*')
    .single();

  if (error || !doc) {
    throw new Error(error?.message || 'Failed to reject quote');
  }

  return doc;
}

export async function convertToInvoice(sourceId: string): Promise<string> {
  const db = getSupabase();
  const { data: invoiceId, error } = await db.rpc('convert_to_invoice', {
    p_source_id: sourceId,
  });

  if (error || !invoiceId) {
    throw new Error(error?.message || 'Failed to convert to invoice');
  }

  return invoiceId;
}

export async function recordPayment(input: RecordPaymentInput): Promise<PaymentRow> {
  const db = getSupabase();
  const insertPayload = {
    document_id: input.document_id,
    amount_received_ugx: Number(input.amount_received_ugx),
    wht_withheld_ugx: Number(input.wht_withheld_ugx ?? 0n),
    method: input.method,
    reference: input.reference || null,
    proof_file_id: input.proof_file_id || null,
    notes: input.notes || null,
    ...(input.received_at ? { received_at: input.received_at } : {}),
  };
  const { data: payment, error } = await db
    .from('payments')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !payment) {
    throw new Error(error?.message || 'Failed to record payment');
  }

  return payment;
}

export async function getDocument(docId: string): Promise<{
  document: DocumentRow;
  lines: DocumentLineRow[];
  payments: PaymentRow[];
  organisation: Pick<OrganisationRow, 'id' | 'name' | 'tin'> | null;
}> {
  const db = getSupabase();

  const { data: document, error: docErr } = await db
    .from('documents')
    .select('*')
    .eq('id', docId)
    .single();

  if (docErr || !document) {
    throw new Error(docErr?.message || 'Document not found');
  }

  const [linesRes, paymentsRes, orgRes] = await Promise.all([
    db.from('document_lines').select('*').eq('document_id', docId).order('position'),
    db.from('payments').select('*').eq('document_id', docId).order('created_at'),
    document.organisation_id
      ? db
          .from('organisations')
          .select('id, name, tin')
          .eq('id', document.organisation_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (linesRes.error) throw new Error(linesRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  return {
    document,
    lines: linesRes.data ?? [],
    payments: paymentsRes.data ?? [],
    organisation: orgRes.data ?? null,
  };
}

export async function listDocuments(filter: DocumentFilter = {}): Promise<DocumentRow[]> {
  const db = getSupabase();
  let query = db.from('documents').select('*').order('created_at', { ascending: false });

  if (filter.type) query = query.eq('type', filter.type);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.organisation_id) query = query.eq('organisation_id', filter.organisation_id);
  if (filter.related_type && filter.related_id) {
    query = query.eq('related_type', filter.related_type).eq('related_id', filter.related_id);
  }
  if (filter.limit) query = query.limit(filter.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

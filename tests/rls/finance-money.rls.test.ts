import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Finance Money-View RLS & aggregation integration tests (Prompt 2.2).
 * Runs against the live hosted database with service role credentials.
 * Throws (never skips) if credentials are absent.
 */

const url = process.env.RLS_SUPABASE_URL;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Finance money RLS tests need RLS_SUPABASE_URL and RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. ' +
      'They fail rather than skip on purpose.',
  );
}

const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

let testOrgId: string;
const createdDocIds: string[] = [];
const createdExpenseIds: string[] = [];

/** The calendar date today in Africa/Kampala (EAT = UTC+3, no DST). */
function kampalaToday(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** First day of the previous month, YYYY-MM-DD. */
function firstOfLastMonth(): string {
  const y = Number(kampalaToday().slice(0, 4));
  const m = Number(kampalaToday().slice(5, 7));
  const prev = new Date(y, m - 2, 1);
  return prev.toISOString().slice(0, 10);
}

/** Create an issued invoice for the test org, returning its id. */
async function createIssuedInvoice(
  totalUgx: number,
  dueDate: string,
): Promise<string> {
  const { data: doc } = await db
    .from('documents')
    .insert({
      type: 'invoice',
      organisation_id: testOrgId,
      subtotal_ugx: totalUgx,
      total_ugx: totalUgx,
      status: 'draft',
    })
    .select('id')
    .single();
  const id = doc!.id;
  createdDocIds.push(id);
  await db.rpc('issue_document', { p_doc_id: id });
  await db.from('documents').update({ due_date: dueDate }).eq('id', id);
  return id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await db
    .from('organisations')
    .insert({ name: `Finance Money Test Org ${stamp}`, tin: '1000999999' })
    .select('id')
    .single();
  if (error || !org) {
    throw new Error(`Failed to create test organisation: ${error?.message}`);
  }
  testOrgId = org.id;
});

afterAll(async () => {
  if (createdExpenseIds.length > 0) {
    await db.from('expenses').delete().in('id', createdExpenseIds);
  }
  if (testOrgId) {
    // Sweep by ORGANISATION, not by the ids this file created.
    //
    // Settling an invoice in full makes the database generate a receipt, and
    // that receipt is not in createdDocIds. It therefore survived, the
    // organisation delete failed on the foreign key, nobody checked the error,
    // and every run left a client org and a receipt behind in the live
    // database — 21 of them by 9 Aug, cluttering the organisation picker and
    // burning invoice numbers out of the production sequence.
    await db.from('documents').delete().eq('organisation_id', testOrgId);

    const { error } = await db.from('organisations').delete().eq('id', testOrgId);
    // Fail loudly rather than leaking into the user's real data again.
    if (error) throw new Error(`finance-money cleanup left an organisation behind: ${error.message}`);
  }
});

describe('Finance Money View (Prompt 2.2)', () => {
  describe('v_invoice_balances', () => {
    it('issued 5,000,000 invoice shows balance 3,000,000 after a 2,000,000 payment', async () => {
      const id = await createIssuedInvoice(5000000, kampalaToday());

      const { data: row, error } = await db
        .from('v_invoice_balances')
        .select('balance_ugx, status')
        .eq('id', id)
        .single();
      expect(error).toBeNull();
      expect(row!.balance_ugx).toBe(5000000);
      expect(row!.status).toBe('issued');

      await db.from('payments').insert({
        document_id: id,
        amount_received_ugx: 2000000,
        wht_withheld_ugx: 0,
        method: 'bank_transfer',
      });

      const { data: after, error: afterErr } = await db
        .from('v_invoice_balances')
        .select('balance_ugx, status')
        .eq('id', id)
        .single();
      expect(afterErr).toBeNull();
      expect(after!.balance_ugx).toBe(3000000);
      expect(after!.status).toBe('part_paid');
    });

    it('a further 3,000,000 (received + withheld) settles the invoice and drops it off the view', async () => {
      const id = await createIssuedInvoice(5000000, kampalaToday());

      await db.from('payments').insert({
        document_id: id,
        amount_received_ugx: 2000000,
        wht_withheld_ugx: 0,
        method: 'mtn_momo',
      });
      await db.from('payments').insert({
        document_id: id,
        amount_received_ugx: 2700000,
        wht_withheld_ugx: 300000,
        method: 'bank_transfer',
      });

      const { data: rows } = await db
        .from('v_invoice_balances')
        .select('balance_ugx')
        .eq('id', id);
      // View only shows issued/part_paid — a paid invoice must be absent.
      expect(rows).toHaveLength(0);

      const { data: doc } = await db.from('documents').select('status').eq('id', id).single();
      expect(doc!.status).toBe('paid');
    });
  });

  describe('finance_summary', () => {
    it('aggregates exact totals: receivables, revenue = received only, WHT credit = withheld', async () => {
      // Baseline so pre-existing rows in the shared DB do not break the maths.
      const { data: before } = await db.rpc('finance_summary');
      const baseline = before as Record<string, number>;

      // Invoice A: 6,000,000, due in the past → receivables +6M, overdue +6M.
      const duePast = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
      const invoiceA = await createIssuedInvoice(6000000, duePast);

      // Invoice B: 4,000,000, due in the future → receivables +4M, not overdue.
      const dueFuture = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
      const invoiceB = await createIssuedInvoice(4000000, dueFuture);

      // Payment on B: 3,000,000 received + 300,000 withheld.
      await db.from('payments').insert({
        document_id: invoiceB,
        amount_received_ugx: 3000000,
        wht_withheld_ugx: 300000,
        method: 'bank_transfer',
        received_at: new Date().toISOString(),
      });

      // A second payment (pure received) on A this month.
      await db.from('payments').insert({
        document_id: invoiceA,
        amount_received_ugx: 1000000,
        wht_withheld_ugx: 0,
        method: 'cash',
        received_at: new Date().toISOString(),
      });

      const { data: after } = await db.rpc('finance_summary');
      const result = after as Record<string, number>;

      const delta = (key: string) => (result[key] ?? 0) - (baseline[key] ?? 0);

      // B is 4M minus 3.3M paid → open balance 0.7M; A is 6M minus 1M → 5M.
      // Receivables = 5.7M.
      expect(delta('receivables_ugx')).toBe(5700000);
      // Only A is past due (6M - 1M = 5M). B is not overdue.
      expect(delta('overdue_ugx')).toBe(5000000);
      // Revenue counts CASH RECEIVED only: 3M + 1M = 4M. Withheld is NOT banked.
      expect(delta('revenue_month_ugx')).toBe(4000000);
      // WHT credit for the annual return sums withheld: 300,000.
      expect(delta('wht_credit_year_ugx')).toBe(300000);
    });
  });

  describe('expenses_month_ugx', () => {
    it('includes a row this month and excludes a row last month', async () => {
      const { data: before } = await db.rpc('finance_summary');
      const baseline = before as Record<string, number>;

      const thisMonth = kampalaToday();
      const lastMonth = firstOfLastMonth();

      const { data: nowRow } = await db
        .from('expenses')
        .insert({
          category: 'Office costs',
          amount_ugx: 250000,
          incurred_on: thisMonth,
          description: 'This month expense',
        })
        .select('id')
        .single();
      createdExpenseIds.push(nowRow!.id);

      const { data: pastRow } = await db
        .from('expenses')
        .insert({
          category: 'Travel',
          amount_ugx: 900000,
          incurred_on: lastMonth,
          description: 'Last month expense',
        })
        .select('id')
        .single();
      createdExpenseIds.push(pastRow!.id);

      const { data: after } = await db.rpc('finance_summary');
      const result = after as Record<string, number>;

      const delta = (result['expenses_month_ugx'] ?? 0) - (baseline['expenses_month_ugx'] ?? 0);

      // Only the current-month row (250k) counts. The 900k last-month row does not.
      expect(delta).toBe(250000);
    });
  });
});

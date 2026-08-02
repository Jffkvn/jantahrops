import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Finance Foundation RLS & Database integration tests.
 * Runs against the live hosted database with service role credentials.
 * Throws (never skips) if credentials are absent.
 */

const url = process.env.RLS_SUPABASE_URL;
const serviceKey = process.env.RLS_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'Finance RLS tests need RLS_SUPABASE_URL and RLS_SUPABASE_SERVICE_ROLE_KEY in .env.rls.local. ' +
      'They fail rather than skip on purpose.',
  );
}

const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

let testOrgId: string;
const createdDocIds: string[] = [];

beforeAll(async () => {
  const stamp = Date.now();
  const { data: org, error } = await db
    .from('organisations')
    .insert({ name: `Finance Test Org ${stamp}`, tin: '1000123456' })
    .select('id')
    .single();

  if (error || !org) {
    throw new Error(`Failed to create test organisation: ${error?.message}`);
  }
  testOrgId = org.id;
});

afterAll(async () => {
  if (createdDocIds.length > 0) {
    await db.from('documents').delete().in('id', createdDocIds);
  }
  if (testOrgId) {
    await db.from('organisations').delete().eq('id', testOrgId);
  }
});

describe('Finance Foundation (Database & Business Logic)', () => {
  describe('Numbering & Concurrency', () => {
    it('draft document has number = null and issue_document assigns JH-INV-<date>-0001', async () => {
      const { data: doc } = await db
        .from('documents')
        .insert({ type: 'invoice', organisation_id: testOrgId, status: 'draft', total_ugx: 1000000 })
        .select('*')
        .single();

      createdDocIds.push(doc!.id);
      expect(doc!.number).toBeNull();
      expect(doc!.status).toBe('draft');

      const { data: invNumber, error } = await db.rpc('issue_document', { p_doc_id: doc!.id });
      expect(error).toBeNull();
      expect(invNumber).toMatch(/^JH-INV-\d{8}-\d{4}$/);

      const { data: updatedDoc } = await db.from('documents').select('*').eq('id', doc!.id).single();
      expect(updatedDoc!.number).toBe(invNumber);
      expect(updatedDoc!.status).toBe('issued');
      expect(updatedDoc!.issue_date).not.toBeNull();
    });

    it('issuing a second invoice assigns a continuous number without gap', async () => {
      const { data: doc1 } = await db
        .from('documents')
        .insert({ type: 'invoice', organisation_id: testOrgId, status: 'draft' })
        .select('id')
        .single();
      const { data: doc2 } = await db
        .from('documents')
        .insert({ type: 'invoice', organisation_id: testOrgId, status: 'draft' })
        .select('id')
        .single();

      createdDocIds.push(doc1!.id, doc2!.id);

      const { data: num1 } = await db.rpc('issue_document', { p_doc_id: doc1!.id });
      const { data: num2 } = await db.rpc('issue_document', { p_doc_id: doc2!.id });

      const seq1 = parseInt(num1.split('-').pop(), 10);
      const seq2 = parseInt(num2.split('-').pop(), 10);
      expect(seq2).toBe(seq1 + 1);
    });

    it('CONCURRENCY: 50 draft invoices issued concurrently yield 50 distinct gapless numbers', async () => {
      const draftInserts = Array.from({ length: 50 }, () => ({
        type: 'invoice' as const,
        organisation_id: testOrgId,
        status: 'draft' as const,
      }));

      const { data: drafts, error } = await db
        .from('documents')
        .insert(draftInserts)
        .select('id');

      expect(error).toBeNull();
      expect(drafts).toHaveLength(50);
      drafts!.forEach((d) => createdDocIds.push(d.id));

      const issuePromises = drafts!.map((d) => db.rpc('issue_document', { p_doc_id: d.id }));
      const results = await Promise.all(issuePromises);

      const numbers = results.map((r) => r.data as string);
      expect(numbers).toHaveLength(50);

      // Assert 50 distinct numbers
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(50);

      // Extract sequence integers and sort
      const sequences = numbers.map((n) => parseInt(n.split('-').pop()!, 10)).sort((a, b) => a - b);

      // Assert zero gaps in sequence
      for (let i = 1; i < sequences.length; i++) {
        const current = sequences[i]!;
        const previous = sequences[i - 1]!;
        expect(current).toBe(previous + 1);
      }
    });

    it('issuing an already-issued document raises an exception', async () => {
      const { data: doc } = await db
        .from('documents')
        .insert({ type: 'invoice', organisation_id: testOrgId, status: 'draft' })
        .select('id')
        .single();

      createdDocIds.push(doc!.id);

      await db.rpc('issue_document', { p_doc_id: doc!.id });
      const { error } = await db.rpc('issue_document', { p_doc_id: doc!.id });

      expect(error).not.toBeNull();
      expect(error!.message).toContain('only a draft document can be issued');
    });

    it('issued document number is immutable: DB trigger rejects edit or clearing of number', async () => {
      const { data: doc } = await db
        .from('documents')
        .insert({ type: 'invoice', organisation_id: testOrgId, status: 'draft' })
        .select('id')
        .single();

      createdDocIds.push(doc!.id);
      const { data: num } = await db.rpc('issue_document', { p_doc_id: doc!.id });

      // Attempt to change number
      const { error: editErr } = await db
        .from('documents')
        .update({ number: 'JH-INV-99999999-9999' })
        .eq('id', doc!.id);

      expect(editErr).not.toBeNull();
      expect(editErr!.message).toContain('issued document number is immutable');

      // Attempt to clear number to null
      const { error: clearErr } = await db
        .from('documents')
        .update({ number: null })
        .eq('id', doc!.id);

      expect(clearErr).not.toBeNull();
      expect(clearErr!.message).toContain('issued document number is immutable');

      // Cancelling preserves the number
      const { error: cancelErr } = await db
        .from('documents')
        .update({ status: 'cancelled' })
        .eq('id', doc!.id);

      expect(cancelErr).toBeNull();
      const { data: cancelledDoc } = await db.from('documents').select('*').eq('id', doc!.id).single();
      expect(cancelledDoc!.number).toBe(num);
      expect(cancelledDoc!.status).toBe('cancelled');
    });
  });

  describe('WHT Settlement & Receipt Generation', () => {
    it('10,000,000 UGX invoice with 9,400,000 received + 600,000 withheld settles as PAID', async () => {
      const { data: doc } = await db
        .from('documents')
        .insert({
          type: 'invoice',
          organisation_id: testOrgId,
          subtotal_ugx: 10000000,
          total_ugx: 10000000,
          status: 'draft',
        })
        .select('id')
        .single();

      createdDocIds.push(doc!.id);
      await db.rpc('issue_document', { p_doc_id: doc!.id });

      // Record payment: 9.4M received + 0.6M WHT = 10M total
      const { error: pmtErr } = await db.from('payments').insert({
        document_id: doc!.id,
        amount_received_ugx: 9400000,
        wht_withheld_ugx: 600000,
        method: 'bank_transfer',
        reference: 'TXN-WHT-100',
      });

      expect(pmtErr).toBeNull();

      const { data: settledDoc } = await db.from('documents').select('*').eq('id', doc!.id).single();
      expect(settledDoc!.status).toBe('paid');

      // Verify auto-generated receipt
      const { data: receipts } = await db
        .from('documents')
        .select('*')
        .eq('type', 'receipt')
        .eq('parent_document_id', doc!.id);

      expect(receipts).toHaveLength(1);
      const receipt = receipts![0];
      createdDocIds.push(receipt.id);
      expect(receipt.number).toMatch(/^JH-RCT-\d{8}-\d{4}$/);
      expect(receipt.status).toBe('issued');
      expect(receipt.total_ugx).toBe(10000000);
    });

    it('10,000,000 UGX invoice with 9,400,000 received + 0 withheld settles as PART_PAID', async () => {
      const { data: doc } = await db
        .from('documents')
        .insert({
          type: 'invoice',
          organisation_id: testOrgId,
          subtotal_ugx: 10000000,
          total_ugx: 10000000,
          status: 'draft',
        })
        .select('id')
        .single();

      createdDocIds.push(doc!.id);
      await db.rpc('issue_document', { p_doc_id: doc!.id });

      await db.from('payments').insert({
        document_id: doc!.id,
        amount_received_ugx: 9400000,
        wht_withheld_ugx: 0,
        method: 'mtn_momo',
        reference: 'TXN-PART-1',
      });

      const { data: settledDoc } = await db.from('documents').select('status').eq('id', doc!.id).single();
      expect(settledDoc!.status).toBe('part_paid');
    });

    it('two partial payments summing to total set status to PAID and generate exactly ONE receipt', async () => {
      const { data: doc } = await db
        .from('documents')
        .insert({
          type: 'invoice',
          organisation_id: testOrgId,
          subtotal_ugx: 5000000,
          total_ugx: 5000000,
          status: 'draft',
        })
        .select('id')
        .single();

      createdDocIds.push(doc!.id);
      await db.rpc('issue_document', { p_doc_id: doc!.id });

      // First payment: 2M
      await db.from('payments').insert({
        document_id: doc!.id,
        amount_received_ugx: 2000000,
        wht_withheld_ugx: 0,
        method: 'airtel_money',
      });

      let { data: currentDoc } = await db.from('documents').select('status').eq('id', doc!.id).single();
      expect(currentDoc!.status).toBe('part_paid');

      // Second payment: 2.7M received + 300k WHT = 3M total (reaches 5M total)
      await db.from('payments').insert({
        document_id: doc!.id,
        amount_received_ugx: 2700000,
        wht_withheld_ugx: 300000,
        method: 'bank_transfer',
      });

      ({ data: currentDoc } = await db.from('documents').select('status').eq('id', doc!.id).single());
      expect(currentDoc!.status).toBe('paid');

      // Extra payment event (overpayment)
      await db.from('payments').insert({
        document_id: doc!.id,
        amount_received_ugx: 100000,
        wht_withheld_ugx: 0,
        method: 'cash',
      });

      ({ data: currentDoc } = await db.from('documents').select('status').eq('id', doc!.id).single());
      expect(currentDoc!.status).toBe('paid');

      // Assert exactly 1 receipt created
      const { data: receipts } = await db
        .from('documents')
        .select('id')
        .eq('type', 'receipt')
        .eq('parent_document_id', doc!.id);

      expect(receipts).toHaveLength(1);
      createdDocIds.push(receipts![0]!.id);
    });
  });

  describe('Quote → Invoice Conversion', () => {
    it('convert_to_invoice on an accepted quote creates a draft invoice with copied lines', async () => {
      // Create quote draft
      const { data: quote } = await db
        .from('documents')
        .insert({
          type: 'quote',
          organisation_id: testOrgId,
          subtotal_ugx: 2000000,
          vat_applicable: true,
          vat_rate_bp: 1800,
          vat_amount_ugx: 360000,
          total_ugx: 2360000,
          status: 'draft',
          notes: 'Quote terms and notes',
        })
        .select('id')
        .single();

      createdDocIds.push(quote!.id);

      // Add quote lines
      await db.from('document_lines').insert([
        { document_id: quote!.id, position: 0, description: 'HR Audit Service', qty: 1, unit_price_ugx: 1500000, line_total_ugx: 1500000 },
        { document_id: quote!.id, position: 1, description: 'Policy Drafting', qty: 1, unit_price_ugx: 500000, line_total_ugx: 500000 },
      ]);

      // Issue quote
      await db.rpc('issue_document', { p_doc_id: quote!.id });

      // Mark quote accepted
      await db.from('documents').update({ status: 'accepted' }).eq('id', quote!.id);

      // Perform conversion
      const { data: invoiceId, error: convErr } = await db.rpc('convert_to_invoice', { p_source_id: quote!.id });
      expect(convErr).toBeNull();
      expect(invoiceId).toBeDefined();
      createdDocIds.push(invoiceId);

      // Assert draft invoice details
      const { data: invoice } = await db.from('documents').select('*').eq('id', invoiceId).single();
      expect(invoice!.type).toBe('invoice');
      expect(invoice!.status).toBe('draft');
      expect(invoice!.number).toBeNull();
      expect(invoice!.parent_document_id).toBe(quote!.id);
      expect(invoice!.subtotal_ugx).toBe(2000000);
      expect(invoice!.total_ugx).toBe(2360000);

      // Assert copied lines
      const { data: invLines } = await db
        .from('document_lines')
        .select('*')
        .eq('document_id', invoiceId)
        .order('position');

      expect(invLines).toHaveLength(2);
      expect(invLines![0].description).toBe('HR Audit Service');
      expect(invLines![1].description).toBe('Policy Drafting');
    });

    it('convert_to_invoice on a non-accepted quote raises an error', async () => {
      const { data: quote } = await db
        .from('documents')
        .insert({ type: 'quote', organisation_id: testOrgId, status: 'draft' })
        .select('id')
        .single();

      createdDocIds.push(quote!.id);

      const { error } = await db.rpc('convert_to_invoice', { p_source_id: quote!.id });
      expect(error).not.toBeNull();
      expect(error!.message).toContain('only an accepted quote or LPO can be converted');
    });
  });
});

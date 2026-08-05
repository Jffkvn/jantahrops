import { describe, it, expect } from 'vitest';
import { flattenCandidateContact } from './recruitment-api';

/**
 * Regression guard for a bug that made EVERY candidate render as "Unnamed
 * candidate" — including on the client-facing shortlist pack.
 *
 * PostgREST cannot alias a two-hop relation flat, so the query returns
 * `candidateContact: { contact: {...} }`, while the declared type and every
 * consumer expect `candidateContact: {...}`. The result was cast, so the
 * compiler could not catch the mismatch — only a shape test can.
 */
describe('flattenCandidateContact', () => {
  it('lifts the nested contact up to candidateContact', () => {
    const raw = [
      {
        id: 'app-1',
        stage: 'shortlisted',
        candidateContact: { contact: { id: 'c1', full_name: 'Grace Nakato', email: 'g@x.ug' } },
      },
    ];
    const [row] = flattenCandidateContact<{
      id: string;
      candidateContact: { full_name: string } | null;
    }>(raw);

    // The whole point: the name is reachable at the declared path.
    expect(row?.candidateContact?.full_name).toBe('Grace Nakato');
    // And NOT still buried a level down.
    expect((row?.candidateContact as unknown as { contact?: unknown })?.contact).toBeUndefined();
  });

  it('preserves the other application fields', () => {
    const [row] = flattenCandidateContact<{ id: string; stage: string }>([
      { id: 'app-1', stage: 'new', candidateContact: { contact: { full_name: 'X' } } },
    ]);
    expect(row?.id).toBe('app-1');
    expect(row?.stage).toBe('new');
  });

  it('tolerates a missing or null contact without throwing', () => {
    const rows = flattenCandidateContact<{ candidateContact: unknown }>([
      { id: 'a', candidateContact: null },
      { id: 'b' },
      { id: 'c', candidateContact: { contact: null } },
    ]);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.candidateContact ?? null).toBeNull();
  });

  it('is idempotent — an already-flat row is left alone', () => {
    const [row] = flattenCandidateContact<{ candidateContact: { full_name: string } }>([
      { id: 'a', candidateContact: { full_name: 'Already Flat' } },
    ]);
    expect(row?.candidateContact?.full_name).toBe('Already Flat');
  });
});

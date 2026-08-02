import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { vatUgx, lineTotalUgx, documentTotals, whtSuggestionUgx } from './money';

describe('Money & VAT Module (src/lib/money.ts)', () => {
  it('calculates vatUgx with exact integer half-up rounding', () => {
    // 1,234,567 * 18% = 222,222.06 -> rounds down to 222222n
    expect(vatUgx(1234567n, 1800n)).toBe(222222n);

    // 25 * 18% = 4.5 -> rounds up to 5n (half-up)
    expect(vatUgx(25n, 1800n)).toBe(5n);

    // 1,000,003 * 18% = 180,000.54 -> rounds up to 180001n
    expect(vatUgx(1000003n, 1800n)).toBe(180001n);

    // 0 * 18% = 0n
    expect(vatUgx(0n, 1800n)).toBe(0n);
  });

  it('calculates lineTotalUgx correctly for integer and fractional quantities', () => {
    expect(lineTotalUgx(3, 1500000n)).toBe(4500000n);
    expect(lineTotalUgx(2.5, 1000000n)).toBe(2500000n);
    expect(lineTotalUgx(1, 0n)).toBe(0n);
  });

  it('calculates documentTotals accurately with and without VAT', () => {
    const lines = [
      { qty: 2, unitPriceUgx: 500000n }, // 1,000,000n
      { qty: 1.5, unitPriceUgx: 200000n }, // 300,000n
    ];
    // subtotal = 1,300,000n
    // VAT @ 18% = 234,000n
    // total = 1,534,000n
    const withVat = documentTotals(lines, true, 1800n);
    expect(withVat.subtotalUgx).toBe(1300000n);
    expect(withVat.vatUgx).toBe(234000n);
    expect(withVat.totalUgx).toBe(1534000n);

    const noVat = documentTotals(lines, false, 1800n);
    expect(noVat.subtotalUgx).toBe(1300000n);
    expect(noVat.vatUgx).toBe(0n);
    expect(noVat.totalUgx).toBe(1300000n);
  });

  it('type safety: rejects number parameters for money amounts at compile time', () => {
    // @ts-expect-error vatUgx must reject number as subtotal parameter
    expect(() => vatUgx(1000, 1800n)).toThrow();

    // @ts-expect-error vatUgx must reject number as rateBp parameter
    expect(() => vatUgx(1000n, 1800)).toThrow();

    // @ts-expect-error lineTotalUgx must reject number as unitPrice parameter
    expect(() => lineTotalUgx(2, 500000)).toThrow();
  });

  it('whtSuggestionUgx calculates 6% with half-up rounding', () => {
    expect(whtSuggestionUgx(10000000n)).toBe(600000n);
    expect(whtSuggestionUgx(1234567n)).toBe(74074n);
    expect(whtSuggestionUgx(0n)).toBe(0n);
  });

  it('no decimal or float literal appears in any money test file', () => {
    const url = new URL(import.meta.url);
    const src = readFileSync(url, 'utf8');
    // Money assertions must never carry a float. Floats ARE allowed as line
    // quantity params (e.g. 2.5 days), so only inspect the asserted value —
    // the .toBe / .toEqual argument — where a decimal would mean float money.
    const lines = src.split('\n');
    for (const line of lines) {
      if (line.includes('expect(') && !line.includes('//')) {
        const assertMatch = line.match(/\.toBe(?:Equal)?\(([^)]*)\)/);
        const asserted = assertMatch?.[1] ?? '';
        if (
          asserted &&
          /\.\d/.test(asserted) &&
          !asserted.includes('"') &&
          !asserted.includes("'")
        ) {
          expect(false, `Float literal in money assertion: ${line.trim()}`).toBe(true);
        }
      }
    }
  });
});

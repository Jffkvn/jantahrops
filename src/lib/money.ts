/**
 * JantaHR Ops — Money & VAT Math Module
 *
 * Non-negotiable conventions:
 * 1. All stored/computed money amounts are `bigint` WHOLE Ugandan shillings (UGX).
 * 2. Never float, never cents, never `number` for a money value.
 * 3. All VAT and total arithmetic is INTEGER math with half-up rounding.
 */

/**
 * Calculates the line total for a given quantity and unit price in whole UGX.
 * `qty` has up to 2 decimal places (e.g. 2.5 days).
 * Half-up rounding on whole shillings.
 */
export function lineTotalUgx(qty: number, unitPriceUgx: bigint): bigint {
  const qtyScaled = BigInt(Math.round(qty * 100));
  return (qtyScaled * unitPriceUgx + 50n) / 100n;
}

/**
 * Calculates VAT on a whole UGX subtotal at a basis-point rate.
 * Standard Uganda VAT is 18% = 1800 basis points.
 * Integer half-up rounding: +5000n before division by 10000n.
 */
export function vatUgx(subtotalUgx: bigint, rateBp: bigint): bigint {
  return (subtotalUgx * rateBp + 5000n) / 10000n;
}

export interface DocumentLineInput {
  qty: number;
  unitPriceUgx: bigint;
}

export interface DocumentTotals {
  subtotalUgx: bigint;
  vatUgx: bigint;
  totalUgx: bigint;
}

/**
 * Calculates a suggested WHT amount for guidance at 6% (600 basis points).
 * Half-up rounding: (subtotal * 600 + 5000) / 10000.
 * This is guidance only — never auto-applied to a payment.
 */
export function whtSuggestionUgx(subtotalUgx: bigint): bigint {
  return (subtotalUgx * 600n + 5000n) / 10000n;
}

/**
 * Calculates subtotal, VAT, and total for a list of document lines.
 * VAT is computed on the document SUBTOTAL, not per line.
 */
export function documentTotals(
  lines: DocumentLineInput[],
  vatApplicable: boolean,
  rateBp: bigint = 1800n,
): DocumentTotals {
  let subtotalUgx = 0n;
  for (const line of lines) {
    subtotalUgx += lineTotalUgx(line.qty, line.unitPriceUgx);
  }
  const computedVatUgx = vatApplicable ? vatUgx(subtotalUgx, rateBp) : 0n;
  return {
    subtotalUgx,
    vatUgx: computedVatUgx,
    totalUgx: subtotalUgx + computedVatUgx,
  };
}

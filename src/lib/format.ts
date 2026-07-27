import { formatInTimeZone } from 'date-fns-tz';
import { formatDistanceToNow } from 'date-fns';

export const APP_TIMEZONE = 'Africa/Kampala';

/**
 * Format bigint amount in whole Ugandan shillings.
 * Example: 4500000n -> "UGX 4,500,000"
 */
export function formatUGX(amount: bigint): string {
  const formatted = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `UGX ${formatted}`;
}

/**
 * Format bigint amount in compact form for tight spaces.
 * Truncates toward zero without rounding into the next magnitude.
 * Example: 999_999n -> "UGX 999.9K", 4_500_000n -> "UGX 4.5M"
 */
export function formatUGXCompact(amount: bigint): string {
  const absAmount = amount < 0n ? -amount : amount;
  const sign = amount < 0n ? '-' : '';

  if (absAmount >= 1_000_000_000n) {
    const whole = absAmount / 1_000_000_000n;
    const remainder = absAmount % 1_000_000_000n;
    const tenths = (remainder * 10n) / 1_000_000_000n;
    const formatted = tenths > 0n ? `${whole}.${tenths}` : `${whole}`;
    return `UGX ${sign}${formatted}B`;
  }

  if (absAmount >= 1_000_000n) {
    const whole = absAmount / 1_000_000n;
    const remainder = absAmount % 1_000_000n;
    const tenths = (remainder * 10n) / 1_000_000n;
    const formatted = tenths > 0n ? `${whole}.${tenths}` : `${whole}`;
    return `UGX ${sign}${formatted}M`;
  }

  if (absAmount >= 1_000n) {
    const whole = absAmount / 1_000n;
    const remainder = absAmount % 1_000n;
    const tenths = (remainder * 10n) / 1_000n;
    const formatted = tenths > 0n ? `${whole}.${tenths}` : `${whole}`;
    return `UGX ${sign}${formatted}K`;
  }

  return formatUGX(amount);
}

/**
 * Parse string into whole UGX bigint or null if invalid/decimal/negative.
 */
export function parseUGX(input: string): bigint | null {
  if (typeof input !== 'string') return null;

  let cleaned = input.trim();
  if (!cleaned) return null;

  // Reject decimals or negative signs
  if (cleaned.includes('.') || cleaned.includes('-')) return null;

  // Strip leading currency code (case-insensitive)
  if (cleaned.toUpperCase().startsWith('UGX')) {
    cleaned = cleaned.slice(3).trim();
  }

  // Remove spaces
  cleaned = cleaned.replace(/\s+/g, '');

  if (!cleaned) return null;

  // If commas exist, validate strict thousands grouping: e.g. 4,500,000
  if (cleaned.includes(',')) {
    const commaRegex = /^\d{1,3}(,\d{3})+$/;
    if (!commaRegex.test(cleaned)) {
      return null;
    }
    cleaned = cleaned.replace(/,/g, '');
  }

  // Must contain only digits
  if (!/^\d+$/.test(cleaned)) return null;

  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}

/**
 * Convert string or Date into Date object.
 */
function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

/**
 * Format date in Africa/Kampala time zone.
 * Example: "27 Jul 2026"
 */
export function formatDate(d: Date | string): string {
  const dateObj = toDate(d);
  return formatInTimeZone(dateObj, APP_TIMEZONE, 'd MMM yyyy');
}

/**
 * Format date and time in Africa/Kampala time zone.
 * Example: "27 Jul 2026, 14:30"
 */
export function formatDateTime(d: Date | string): string {
  const dateObj = toDate(d);
  return formatInTimeZone(dateObj, APP_TIMEZONE, 'd MMM yyyy, HH:mm');
}

/**
 * Format relative time (timezone independent).
 * Example: "3 days ago", "in 2 hours"
 */
export function formatRelative(d: Date | string): string {
  return formatDistanceToNow(toDate(d), { addSuffix: true });
}

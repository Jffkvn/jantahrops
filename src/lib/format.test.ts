import { describe, it, expect } from 'vitest';
import {
  formatUGX,
  formatUGXCompact,
  parseUGX,
  formatDate,
  formatDateTime,
  formatRelative,
  KAMPALA_TZ,
} from './format';

describe('formatUGX', () => {
  it('formats whole shilling bigint amounts correctly', () => {
    expect(formatUGX(4500000n)).toBe('UGX 4,500,000');
    expect(formatUGX(0n)).toBe('UGX 0');
    expect(formatUGX(1n)).toBe('UGX 1');
    expect(formatUGX(999999999999n)).toBe('UGX 999,999,999,999');
  });
});

describe('formatUGXCompact', () => {
  it('formats compact amounts correctly for tight spaces', () => {
    expect(formatUGXCompact(999n)).toBe('UGX 999');
    expect(formatUGXCompact(1000n)).toBe('UGX 1K');
    expect(formatUGXCompact(1500n)).toBe('UGX 1.5K');
    expect(formatUGXCompact(1000000n)).toBe('UGX 1M');
    expect(formatUGXCompact(4500000n)).toBe('UGX 4.5M');
    expect(formatUGXCompact(1000000000n)).toBe('UGX 1B');
    expect(formatUGXCompact(2500000000n)).toBe('UGX 2.5B');
  });
});

describe('parseUGX', () => {
  it('accepts valid formatted and unformatted UGX strings', () => {
    expect(parseUGX('4,500,000')).toBe(4500000n);
    expect(parseUGX('4500000')).toBe(4500000n);
    expect(parseUGX('UGX 4,500,000')).toBe(4500000n);
    expect(parseUGX(' 4 500 000 ')).toBe(4500000n);
    expect(parseUGX('0')).toBe(0n);
  });

  it('rejects invalid, decimal, negative, or malformed strings', () => {
    expect(parseUGX('')).toBeNull();
    expect(parseUGX('abc')).toBeNull();
    expect(parseUGX('4.5')).toBeNull();
    expect(parseUGX('-100')).toBeNull();
    expect(parseUGX('4,50,0000')).toBeNull();
  });

  it('round trips parseUGX(formatUGX(x)) === x', () => {
    const testValues = [0n, 1n, 4500000n, 123456789n, 999999999999n];
    for (const val of testValues) {
      expect(parseUGX(formatUGX(val))).toBe(val);
    }
  });
});

describe('Date Formatters', () => {
  it('has Kampala timezone constant set', () => {
    expect(KAMPALA_TZ).toBe('Africa/Kampala');
  });

  it('formats dates in EAT time zone', () => {
    // 2026-07-27T12:00:00Z
    const testDate = new Date('2026-07-27T12:00:00Z');
    expect(formatDate(testDate)).toBe('27 Jul 2026');
    expect(formatDateTime(testDate)).toBe('27 Jul 2026, 15:00');
  });

  it('formats relative date strings', () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelative(pastDate)).toContain('ago');
  });
});

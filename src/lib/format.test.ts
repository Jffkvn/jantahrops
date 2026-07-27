import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatUGX,
  formatUGXCompact,
  parseUGX,
  formatDate,
  formatDateTime,
  formatRelative,
  APP_TIMEZONE,
} from './format';

describe('formatUGX', () => {
  it('formats whole shilling bigint amounts correctly', () => {
    expect(formatUGX(4500000n)).toBe('UGX 4,500,000');
    expect(formatUGX(0n)).toBe('UGX 0');
    expect(formatUGX(1n)).toBe('UGX 1');
    expect(formatUGX(999999999999n)).toBe('UGX 999,999,999,999');
  });

  it('rejects number at compile time', () => {
    // @ts-expect-error formatUGX must reject number — money is bigint only
    formatUGX(4500000);
  });
});

describe('formatUGXCompact', () => {
  it('formats compact amounts without crossing magnitude boundaries', () => {
    expect(formatUGXCompact(999n)).toBe('UGX 999');
    expect(formatUGXCompact(1000n)).toBe('UGX 1K');
    expect(formatUGXCompact(1500n)).toBe('UGX 1.5K');
    expect(formatUGXCompact(999999n)).toBe('UGX 999.9K');
    expect(formatUGXCompact(1000000n)).toBe('UGX 1M');
    expect(formatUGXCompact(4500000n)).toBe('UGX 4.5M');
    expect(formatUGXCompact(999999999n)).toBe('UGX 999.9M');
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

  it('rejects number at compile time', () => {
    // @ts-expect-error parseUGX must reject number
    parseUGX(4500000);
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
    expect(APP_TIMEZONE).toBe('Africa/Kampala');
  });

  it('formats dates in EAT time zone', () => {
    // 2026-07-27T12:00:00Z
    const testDate = new Date('2026-07-27T12:00:00Z');
    expect(formatDate(testDate)).toBe('27 Jul 2026');
    expect(formatDateTime(testDate)).toBe('27 Jul 2026, 15:00');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-07-27T12:00:00Z');
  const currentTZ = process.env.TZ ?? 'unset';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(`is timezone independent (run under TZ=UTC and TZ=Africa/Kampala via test:tz) [active TZ: ${currentTZ}]`, () => {
    const oneHourPast = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFuture = new Date(now.getTime() + 60 * 60 * 1000);
    const threeDaysPast = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const thirtySecondsPast = new Date(now.getTime() - 30 * 1000);

    const past1h = formatRelative(oneHourPast);
    expect(past1h, `Failed under TZ=${currentTZ}: expected 1h past to contain 'ago'`).toContain(
      'ago',
    );
    expect(past1h, `Failed under TZ=${currentTZ}: 1h past must not contain 'in '`).not.toContain(
      'in ',
    );

    const fut1h = formatRelative(oneHourFuture);
    expect(fut1h, `Failed under TZ=${currentTZ}: expected 1h future to contain 'in '`).toContain(
      'in ',
    );
    expect(fut1h, `Failed under TZ=${currentTZ}: 1h future must not contain 'ago'`).not.toContain(
      'ago',
    );

    expect(formatRelative(threeDaysPast)).toBe('3 days ago');
    expect(formatRelative(thirtySecondsPast)).toContain('ago');
  });
});

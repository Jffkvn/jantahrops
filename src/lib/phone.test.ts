import { describe, it, expect } from 'vitest';
import { normalizeUgandanPhone, formatPhoneDisplay } from './phone';

describe('normalizeUgandanPhone', () => {
  it('normalizes valid Ugandan phone variations to E.164 (+256XXXXXXXXX)', () => {
    const validInputs = [
      '0772123456',
      '+256772123456',
      '256772123456',
      '0772 123 456',
      '(0772) 123-456',
      '+256 772 123 456',
    ];

    for (const input of validInputs) {
      expect(normalizeUgandanPhone(input)).toBe('+256772123456');
    }
  });

  it('rejects invalid, malformed, or out-of-range phone numbers', () => {
    const invalidInputs = [
      '',
      '0772',
      '07721234567', // 11 digits after 0
      'abcdefghij',
      '+1234567890', // non-UG prefix
    ];

    for (const input of invalidInputs) {
      expect(normalizeUgandanPhone(input)).toBeNull();
    }
  });

  it('guarantees idempotency normalize(normalize(x)) === normalize(x)', () => {
    const input = '0772123456';
    const normalizedOnce = normalizeUgandanPhone(input);
    expect(normalizedOnce).not.toBeNull();
    if (normalizedOnce) {
      expect(normalizeUgandanPhone(normalizedOnce)).toBe(normalizedOnce);
    }
  });
});

describe('formatPhoneDisplay', () => {
  it('formats E.164 Ugandan number into readable grouped representation', () => {
    expect(formatPhoneDisplay('+256772123456')).toBe('+256 772 123 456');
  });

  it('returns original input if not matching standard format', () => {
    expect(formatPhoneDisplay('12345')).toBe('12345');
  });
});

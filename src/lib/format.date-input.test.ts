import { describe, it, expect } from 'vitest';
import { toDateInputValue, dateInputToISO } from './format';

describe('date-input helpers (Kampala)', () => {
  it('formats an instant to its Kampala calendar date', () => {
    // 2026-07-27 22:00 UTC = 2026-07-28 01:00 EAT → the 28th in Kampala.
    expect(toDateInputValue('2026-07-27T22:00:00Z')).toBe('2026-07-28');
    // 2026-07-27 05:00 UTC = 08:00 EAT → still the 27th.
    expect(toDateInputValue('2026-07-27T05:00:00Z')).toBe('2026-07-27');
  });

  it('returns empty string for null so it clears the input', () => {
    expect(toDateInputValue(null)).toBe('');
  });

  it('turns a date-input value into 09:00 EAT (06:00 UTC)', () => {
    // 09:00 EAT = 06:00 UTC.
    expect(dateInputToISO('2026-07-28')).toBe('2026-07-28T06:00:00.000Z');
  });

  it('honours a custom hour', () => {
    // 23:00 EAT = 20:00 UTC same day.
    expect(dateInputToISO('2026-07-28', 23)).toBe('2026-07-28T20:00:00.000Z');
  });

  it('returns null for an empty string', () => {
    expect(dateInputToISO('')).toBeNull();
  });

  it('round-trips: a stored 09:00 instant reads back as the same input date', () => {
    const iso = dateInputToISO('2026-12-31');
    expect(iso).not.toBeNull();
    expect(toDateInputValue(iso ?? '')).toBe('2026-12-31');
  });
});

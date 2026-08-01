import { describe, it, expect } from 'vitest';
import { parseQuickLead } from './search-api';

describe('parseQuickLead', () => {
  it('parses name + phone + note from a "lead …" command', () => {
    expect(parseQuickLead('lead Sarah Nakato 0772123456 AI training')).toEqual({
      name: 'Sarah Nakato',
      phone: '0772123456',
      rest: 'AI training',
    });
  });

  it('accepts "add" as the trigger word too', () => {
    expect(parseQuickLead('add James Okello 0788555222')).toEqual({
      name: 'James Okello',
      phone: '0788555222',
      rest: undefined,
    });
  });

  it('handles a +256 number with spaces', () => {
    const r = parseQuickLead('lead Grace Auma +256 701 234 567');
    expect(r?.name).toBe('Grace Auma');
    expect(r?.phone).toBe('+256701234567');
  });

  it('returns a name-only result when there is no phone yet', () => {
    expect(parseQuickLead('lead Miriam')).toEqual({ name: 'Miriam' });
  });

  it('is null when the input is not a lead command', () => {
    expect(parseQuickLead('finance report')).toBeNull();
    expect(parseQuickLead('leads')).toBeNull(); // "leads" is not "lead <name>"
  });

  it('is null for a phone with no name before it', () => {
    expect(parseQuickLead('lead 0772123456')).toBeNull();
  });
});

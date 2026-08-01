import { describe, it, expect } from 'vitest';
import { LEAD_STAGES, BOARD_STAGES, stageMeta } from './lead-stages';
import { urgencyOf } from './next-action-dot';

describe('lead stages', () => {
  it('covers all eight pipeline stages', () => {
    expect(LEAD_STAGES).toHaveLength(8);
    expect(LEAD_STAGES.map((s) => s.value)).toEqual([
      'new',
      'contacted',
      'qualified',
      'proposal_sent',
      'negotiation',
      'won',
      'lost',
      'dormant',
    ]);
  });

  it('shows only active stages on the board — no won/lost/dormant graveyards', () => {
    const onBoard = BOARD_STAGES.map((s) => s.value);
    expect(onBoard).toEqual(['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation']);
    expect(onBoard).not.toContain('won');
    expect(onBoard).not.toContain('lost');
  });

  it('resolves metadata for every stage, and never returns undefined', () => {
    for (const s of LEAD_STAGES) {
      expect(stageMeta(s.value).label.length).toBeGreaterThan(0);
    }
  });
});

describe('next-action urgency (Kampala day boundary)', () => {
  it('is "none" when unset', () => {
    expect(urgencyOf(null)).toBe('none');
  });

  it('classifies a past date as overdue and a far-future date as future', () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(urgencyOf(yesterday)).toBe('overdue');
    expect(urgencyOf(nextWeek)).toBe('future');
  });

  it('treats any time later today (EAT) as "today", not "future"', () => {
    // 23:00 Kampala today, expressed in UTC (EAT = UTC+3, so 20:00Z).
    const now = new Date();
    const kampalaDate = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
    const lateToday = new Date(`${kampalaDate}T20:00:00+03:00`).toISOString();
    // Only meaningful when "now" is before 23:00 EAT; guard so the test is stable.
    if (new Date(lateToday).getTime() > now.getTime()) {
      expect(urgencyOf(lateToday)).toBe('today');
    }
  });
});

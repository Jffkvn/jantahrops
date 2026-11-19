import { describe, it, expect } from 'vitest';
import { groupFailedSubmissions } from './failed-submissions-api';

describe('groupFailedSubmissions', () => {
  it('excludes synthetic @example.test rows and groups retries by email or phone', () => {
    const grouped = groupFailedSubmissions([
      {
        id: 'test-1',
        lead_type: 'candidate',
        payload: { fullName: 'Test Runner', email: 'zz-deploy@example.test', vacancySlug: 'hr-assistant' },
        created_at: '2026-11-19T12:00:00.000Z',
      },
      {
        id: 'sub-2',
        lead_type: 'candidate',
        payload: {
          fullName: 'Jane Namuli',
          email: 'Jane@Example.com',
          phone: '+256772123456',
          vacancySlug: 'hr-assistant',
          cvPath: 'cvs/abc-Jane.pdf',
        },
        created_at: '2026-11-19T11:05:00.000Z',
      },
      {
        id: 'sub-1',
        lead_type: 'candidate',
        payload: {
          fullName: 'Jane Namuli',
          email: 'jane@example.com',
          phone: '+256772123456',
          vacancySlug: 'hr-assistant',
        },
        created_at: '2026-11-19T11:00:00.000Z',
      },
      {
        id: 'sub-3',
        lead_type: 'ai_training',
        payload: {
          fullName: 'Kev Odhis',
          email: 'kev@company.ug',
          trainingUnit: 'HR Automation',
        },
        created_at: '2026-11-19T10:30:00.000Z',
      },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toEqual({
      id: 'sub-2',
      allIds: ['sub-2', 'sub-1'],
      leadType: 'candidate',
      name: 'Jane Namuli',
      email: 'jane@example.com',
      phone: '+256772123456',
      targetLabel: 'Application · hr-assistant',
      hasCv: true,
      attemptCount: 2,
      latestCreatedAt: '2026-11-19T11:05:00.000Z',
    });
    expect(grouped[1]?.targetLabel).toBe('AI training · HR Automation');
    expect(grouped[1]?.attemptCount).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TalentPoolPage } from './talent-pool-page';

vi.mock('./use-recruitment', () => ({
  useCandidatesList: vi.fn(() => ({ data: { rows: [], total: 0 }, isLoading: false })),
  useCreateApplication: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDistinctSkills: vi.fn(() => ({ data: [] })),
  useVacanciesList: vi.fn(() => ({ data: { rows: [] }, isLoading: false })),
}));

import { useCandidatesList } from './use-recruitment';
const mockedList = vi.mocked(useCandidatesList);

describe('TalentPoolPage search', () => {
  beforeEach(() => {
    mockedList.mockClear();
  });

  it('fires a server-side listCandidates query with the debounced search term', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TalentPoolPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const input = screen.getByPlaceholderText('Search name, headline, skills…');
    fireEvent.change(input, { target: { value: 'react' } });

    // Query is debounced to 250ms.
    await waitFor(
      () => {
        const calls = mockedList.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const last = calls[Math.max(0, calls.length - 1)];
        expect(last?.[0]?.search).toBe('react');
      },
      { timeout: 1000 },
    );
  });
});
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShortlistPrintView } from './shortlist-print-view';

vi.mock('./use-recruitment', () => ({
  useVacancy: vi.fn(() => ({
    data: {
      id: 'v1',
      organisation_id: 'org1',
      title: 'Senior React Engineer',
      slug: 'senior-react-engineer',
      summary: 'Build great products',
      description: null,
      requirements: null,
      location: 'Kampala',
      employment_type: 'full_time',
      salary_min_ugx: 2000000,
      salary_max_ugx: 5000000,
      status: 'open',
      is_public: true,
      published_at: '2026-08-01',
      closes_at: null,
      owner_id: null,
      created_by: null,
      created_at: '2026-08-01',
      updated_at: '2026-08-01',
      organisation: { id: 'org1', name: 'Acme Uganda Ltd' },
      owner: null,
      applications: [{ count: 2 }],
    },
    isLoading: false,
  })),
  useShortlist: vi.fn(() => ({
    data: [
      {
        id: 'app1',
        vacancy_id: 'v1',
        candidate_id: 'c1',
        source: 'manual',
        stage: 'shortlisted',
        applied_at: '2026-08-02',
        owner_id: null,
        notes: 'PRIVATE: pay lowball',
        rejected_reason: null,
        created_at: '2026-08-02',
        updated_at: '2026-08-02',
        candidate: {
          id: 'c1',
          headline: 'Senior React Engineer',
          skills: ['react', 'typescript'],
          rating: 5,
          years_experience: 8,
          salary_expectation_ugx: 4000000,
          availability: 'immediate',
          notes: 'Private internal note',
        },
        candidateContact: {
          id: 'c1',
          full_name: 'Sarah Nakato',
          email: 'sarah@acme.ug',
          phone_e164: '+256772123456',
        },
      },
    ],
    isLoading: false,
  })),
}));

vi.mock('@/features/finance/use-finance', () => ({
  useCompanyProfile: vi.fn(() => ({
    data: {
      legal_name: 'JantaHR',
      address: 'Kampala',
      email: 'hello@jantahr.ug',
      phone: '+256700000000',
    },
    isLoading: false,
  })),
}));

describe('ShortlistPrintView', () => {
  it('renders the vacancy title and each shortlisted candidate’s name + skills', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/recruitment/v1/shortlist']}>
          <Routes>
            <Route path="/recruitment/:vacancyId/shortlist" element={<ShortlistPrintView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Senior React Engineer').length).toBeGreaterThan(0);
    expect(screen.getByText('Sarah Nakato')).toBeInTheDocument();
    expect(screen.getByText('react, typescript')).toBeInTheDocument();
  });

  it('does NOT render internal rating or private notes', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/recruitment/v1/shortlist']}>
          <Routes>
            <Route path="/recruitment/:vacancyId/shortlist" element={<ShortlistPrintView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Internal rating (5) and the private notes must never appear on the pack.
    expect(screen.queryByText(/rating/i)).toBeNull();
    expect(screen.queryByText(/lowball/)).toBeNull();
    expect(screen.queryByText('Private internal note')).toBeNull();
    expect(screen.queryByText(/^5$/)).toBeNull();
  });
});
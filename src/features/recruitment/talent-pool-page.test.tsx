import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TalentPoolPage } from './talent-pool-page';
import { CandidateDetailSheet } from './candidate-detail-sheet';
import { CreateCandidateSheet } from './create-candidate-sheet';
import { assignableVacancies, formatAssignableVacancyLabel } from './recruitment-meta';
import type { VacancyWithRelations } from './recruitment-api';
import type { VacancyStatus } from '@/types/database';

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ isAdmin: false }),
}));

vi.mock('./use-recruitment', () => ({
  useCandidatesList: vi.fn(() => ({ data: { rows: [], total: 0 }, isLoading: false })),
  useCandidate: vi.fn(() => ({ data: null, isLoading: false })),
  useCandidateApplications: vi.fn(() => ({ data: [] })),
  useCandidateTimeline: vi.fn(() => ({ data: [] })),
  useCreateApplication: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateCandidate: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useParseCandidateCv: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDistinctSkills: vi.fn(() => ({ data: [] })),
  useVacanciesList: vi.fn(() => ({ data: { rows: [] }, isLoading: false, isError: false })),
}));

import {
  useCandidate,
  useCandidatesList,
  useVacanciesList,
} from './use-recruitment';

const mockedList = vi.mocked(useCandidatesList);
const mockedCandidate = vi.mocked(useCandidate);
const mockedVacanciesList = vi.mocked(useVacanciesList);

function makeVacancy(id: string, title: string, status: VacancyStatus): VacancyWithRelations {
  return {
    id,
    title,
    status,
    slug: id,
    organisation_id: null,
    summary: null,
    description: null,
    requirements: null,
    recruiter_context: null,
    forwarding_emails: [],
    location: null,
    employment_type: null,
    salary_min_ugx: null,
    salary_max_ugx: null,
    is_public: status === 'open',
    published_at: null,
    closes_at: null,
    owner_id: null,
    created_by: null,
    created_at: '2026-11-24T00:00:00Z',
    updated_at: '2026-11-24T00:00:00Z',
    screening_questions: [],
    organisation: null,
    owner: null,
    applications: [{ count: 0 }],
  };
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('assignableVacancies helpers', () => {
  it('orders open -> draft -> paused -> closed and keeps closed roles assignable', () => {
    const input = [
      { id: '1', title: 'Closed Role', status: 'closed' as const },
      { id: '2', title: 'Paused Role', status: 'paused' as const },
      { id: '3', title: 'Draft Role', status: 'draft' as const },
      { id: '4', title: 'Open Role A', status: 'open' as const },
      { id: '5', title: 'Open Role B', status: 'open' as const },
    ];

    const result = assignableVacancies(input);
    expect(result.map((v) => v.title)).toEqual([
      'Open Role A',
      'Open Role B',
      'Draft Role',
      'Paused Role',
      'Closed Role',
    ]);
    expect(result.map(formatAssignableVacancyLabel)).toEqual([
      'Open Role A',
      'Open Role B',
      'Draft Role (Draft)',
      'Paused Role (Paused)',
      'Closed Role (Closed)',
    ]);
  });
});

describe('TalentPoolPage search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockReturnValue({
      data: { rows: [], total: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof useCandidatesList>);
    mockedVacanciesList.mockReturnValue({
      data: { rows: [], total: 0 },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useVacanciesList>);
  });

  it('fires a server-side listCandidates query with the debounced search term', async () => {
    renderWithProviders(<TalentPoolPage />);

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

  it('loads open, draft, paused, and closed vacancies into the Add to vacancy dropdown', async () => {
    const user = userEvent.setup();
    mockedVacanciesList.mockReturnValue({
      data: {
        rows: [
          makeVacancy('v-closed', 'Archived Role', 'closed'),
          makeVacancy('v-draft', 'Confidential CFO', 'draft'),
          makeVacancy('v-paused', 'Field Tech', 'paused'),
          makeVacancy('v-open', 'Senior Accountant', 'open'),
        ],
        total: 4,
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useVacanciesList>);

    renderWithProviders(<TalentPoolPage />);

    expect(mockedVacanciesList).toHaveBeenCalledWith({ status: 'all', pageSize: 100 });

    const trigger = screen.getByRole('combobox', { name: 'Add to vacancy' });
    await user.click(trigger);

    expect(await screen.findByRole('option', { name: 'Senior Accountant' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Confidential CFO (Draft)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Field Tech (Paused)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Archived Role (Closed)' })).toBeInTheDocument();
  });

  it('shows a clear empty message when no vacancies exist', async () => {
    const user = userEvent.setup();
    mockedVacanciesList.mockReturnValue({
      data: { rows: [], total: 0 },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useVacanciesList>);

    renderWithProviders(<TalentPoolPage />);

    const trigger = screen.getByRole('combobox', { name: 'Add to vacancy' });
    await user.click(trigger);

    expect(await screen.findByText('No vacancies available.')).toBeInTheDocument();
  });

  it('dismisses the row Confirm/Cancel controls when Cancel is clicked', async () => {
    const user = userEvent.setup();
    mockedVacanciesList.mockReturnValue({
      data: { rows: [makeVacancy('v-open', 'Senior Accountant', 'open')], total: 1 },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useVacanciesList>);
    mockedList.mockReturnValue({
      data: {
        rows: [
          {
            id: 'cand-1',
            contact_id: 'contact-1',
            headline: 'Accountant',
            years_experience: 4,
            skills: ['Excel'],
            education: [],
            work_history: [],
            salary_expectation_ugx: null,
            availability: 'immediate',
            cv_file_id: null,
            cv_parsed: null,
            cv_parsed_at: null,
            rating: null,
            is_available: true,
            source: 'manual',
            notes: null,
            needs_review: false,
            review_reason: null,
            owner_id: null,
            created_at: '2026-11-24T00:00:00Z',
            updated_at: '2026-11-24T00:00:00Z',
            contact: {
              id: 'contact-1',
              full_name: 'Sarah Nakato',
              email: 'sarah@example.com',
              phone_e164: '+256772123456',
              location: 'Kampala',
            },
            owner: null,
          },
        ],
        total: 1,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useCandidatesList>);

    renderWithProviders(<TalentPoolPage />);

    await user.click(screen.getByRole('combobox', { name: 'Add to vacancy' }));
    await user.click(await screen.findByRole('option', { name: 'Senior Accountant' }));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('CandidateDetailSheet Add to vacancy dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCandidate.mockReturnValue({
      data: {
        id: 'cand-1',
        contact_id: 'contact-1',
        headline: 'Finance Lead',
        years_experience: 6,
        skills: ['IFRS'],
        education: [],
        work_history: [],
        salary_expectation_ugx: null,
        availability: 'immediate',
        cv_file_id: null,
        cv_parsed: null,
        cv_parsed_at: null,
        rating: null,
        is_available: true,
        source: 'manual',
        notes: null,
        needs_review: false,
        review_reason: null,
        owner_id: null,
        created_at: '2026-11-24T00:00:00Z',
        updated_at: '2026-11-24T00:00:00Z',
        contact: {
          id: 'contact-1',
          full_name: 'John Doe',
          email: 'john@example.com',
          phone_e164: '+256772000001',
          location: 'Kampala',
        },
        owner: null,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useCandidate>);
  });

  it('lists open, draft, and paused vacancies inside the candidate detail modal', async () => {
    const user = userEvent.setup();
    mockedVacanciesList.mockReturnValue({
      data: {
        rows: [
          makeVacancy('v-closed', 'Closed Role', 'closed'),
          makeVacancy('v-draft', 'Payroll Specialist', 'draft'),
          makeVacancy('v-open', 'HR Manager', 'open'),
        ],
        total: 3,
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useVacanciesList>);

    renderWithProviders(
      <CandidateDetailSheet candidateId="cand-1" onOpenChange={() => {}} open />,
    );

    expect(mockedVacanciesList).toHaveBeenCalledWith({ status: 'all', pageSize: 100 });

    const trigger = await screen.findByRole('combobox', { name: 'Choose a vacancy' });
    await user.click(trigger);

    expect(await screen.findByRole('option', { name: 'HR Manager' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Payroll Specialist (Draft)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Closed Role (Closed)' })).toBeInTheDocument();
  });

  it('shows an empty message when no vacancies are available', async () => {
    const user = userEvent.setup();
    mockedVacanciesList.mockReturnValue({
      data: { rows: [], total: 0 },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useVacanciesList>);

    renderWithProviders(
      <CandidateDetailSheet candidateId="cand-1" onOpenChange={() => {}} open />,
    );

    const trigger = await screen.findByRole('combobox', { name: 'Choose a vacancy' });
    await user.click(trigger);

    expect(await screen.findByText('No vacancies available.')).toBeInTheDocument();
  });
});

describe('CreateCandidateSheet vacancy & email-application support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preselects a closed defaultVacancyId and lists closed vacancies with email source option', async () => {
    const user = userEvent.setup();
    mockedVacanciesList.mockReturnValue({
      data: {
        rows: [
          makeVacancy('v-closed', 'HR Assistant', 'closed'),
          makeVacancy('v-open', 'HR Manager', 'open'),
        ],
        total: 2,
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useVacanciesList>);

    renderWithProviders(
      <CreateCandidateSheet defaultVacancyId="v-closed" onOpenChange={() => {}} open />,
    );

    const vacancyTrigger = await screen.findByRole('combobox', { name: 'Vacancy' });
    expect(vacancyTrigger).toHaveTextContent('HR Assistant (Closed)');

    const sourceTrigger = screen.getByRole('combobox', { name: 'Application source' });
    expect(sourceTrigger).toHaveTextContent('Applied by email');

    await user.click(vacancyTrigger);
    expect(await screen.findByRole('option', { name: 'HR Assistant (Closed)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'HR Manager' })).toBeInTheDocument();
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VacancyEditorSheet } from './vacancy-editor-sheet';

const { api, hooks } = vi.hoisted(() => ({
  api: { listOrganisations: vi.fn(() => Promise.resolve([])) },
  hooks: {
    useCreateVacancy: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUpdateVacancy: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    usePublishVacancy: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useCloseVacancy: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  },
}));

vi.mock('@/features/finance/finance-api', () => ({
  listOrganisations: () => api.listOrganisations(),
}));

vi.mock('./use-recruitment', () => hooks);

describe('slug generation and collision handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.useCreateVacancy.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('surfaces a clear error on a slug collision (unique violation from the api)', async () => {
    // The data layer already resolves collisions by appending a suffix, so the
    // only collision the sheet itself sees is a raw 23505 from the api.
    const mutateAsync = vi.fn(() =>
      Promise.reject(Object.assign(new Error('duplicate'), { code: '23505' })),
    );
    hooks.useCreateVacancy.mockReturnValue({ mutateAsync, isPending: false });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <VacancyEditorSheet onOpenChange={() => {}} open />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Senior React Engineer'), {
      target: { value: 'Frontend Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create vacancy/i }));

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });

  it('clears the collision error on the next successful submit', async () => {
    let failOnce = true;
    const mutateAsync = vi.fn(() => {
      if (failOnce) {
        failOnce = false;
        return Promise.reject(Object.assign(new Error('duplicate'), { code: '23505' }));
      }
      return Promise.resolve({ id: 'new-id' });
    });
    hooks.useCreateVacancy.mockReturnValue({ mutateAsync, isPending: false });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <VacancyEditorSheet onOpenChange={() => {}} open />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Senior React Engineer'), {
      target: { value: 'Frontend Engineer' },
    });
    const submit = screen.getByRole('button', { name: /create vacancy/i });

    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());

    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByText(/already exists/i)).toBeNull());
  });
});
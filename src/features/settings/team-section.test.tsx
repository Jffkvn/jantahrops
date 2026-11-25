import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamSection } from './team-section';

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
  useAuth: vi.fn(),
}));

vi.mock('./use-settings', () => ({
  useAllProfiles: vi.fn(),
  useUpdateTeamMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCreateTeamMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { useAuth } from '@/features/auth/auth-provider';
import { useAllProfiles, useCreateTeamMember } from './use-settings';

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseAllProfiles = vi.mocked(useAllProfiles);
const mockedUseCreateTeamMember = vi.mocked(useCreateTeamMember);

function renderWithQuery(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('TeamSection user creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAllProfiles.mockReturnValue({
      data: [
        {
          id: 'admin-1',
          email: 'jffkvn@gmail.com',
          full_name: 'Jeff Adhaya',
          phone: null,
          role: 'admin',
          avatar_file_id: null,
          is_active: true,
          created_at: '2026-09-28T22:24:26Z',
          updated_at: '2026-10-09T13:55:01Z',
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useAllProfiles>);
  });

  it('shows Add user button for admins and hides it for non-admins', () => {
    mockedUseAuth.mockReturnValue({
      isAdmin: true,
      profile: { id: 'admin-1' },
    } as unknown as ReturnType<typeof useAuth>);

    const { unmount } = renderWithQuery(<TeamSection />);
    expect(screen.getByRole('button', { name: 'Add user' })).toBeInTheDocument();
    unmount();

    mockedUseAuth.mockReturnValue({
      isAdmin: false,
      profile: { id: 'staff-1' },
    } as unknown as ReturnType<typeof useAuth>);

    renderWithQuery(<TeamSection />);
    expect(screen.queryByRole('button', { name: 'Add user' })).toBeNull();
  });

  it('submits new user form and shows temporary credentials card', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      user: {
        id: 'user-dora',
        email: 'admin_ug@egypro.com',
        full_name: 'Dora',
        phone: null,
        role: 'staff',
        avatar_file_id: null,
        is_active: true,
        created_at: '2026-11-25T10:15:00Z',
        updated_at: '2026-11-25T10:15:00Z',
      },
      temporaryPassword: 'TempPass!23456',
      loginUrl: 'https://ops.jantahr.com/login',
      emailSent: true,
    });

    mockedUseAuth.mockReturnValue({
      isAdmin: true,
      profile: { id: 'admin-1' },
    } as unknown as ReturnType<typeof useAuth>);

    mockedUseCreateTeamMember.mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateTeamMember>);

    renderWithQuery(<TeamSection />);

    await user.click(screen.getByRole('button', { name: 'Add user' }));
    await user.type(await screen.findByLabelText(/Full name/i), 'Dora');
    await user.type(screen.getByLabelText(/^Email/i), 'admin_ug@egypro.com');
    await user.click(screen.getByRole('button', { name: 'Create user' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        fullName: 'Dora',
        email: 'admin_ug@egypro.com',
        role: 'staff',
        password: undefined,
        sendWelcomeEmail: true,
      });
    });

    expect(await screen.findByText('TempPass!23456')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy login details' })).toBeInTheDocument();
  });
});

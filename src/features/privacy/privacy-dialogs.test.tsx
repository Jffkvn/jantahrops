import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErasePersonDialog } from './erase-person-dialog';
import { DangerZone } from './danger-zone';
import type { ErasurePreview } from './privacy-api';

const { hooks, auth } = vi.hoisted(() => ({
  hooks: {
    useErasurePreview: vi.fn(),
    useErasePerson: vi.fn(),
    useDeleteLead: vi.fn(),
  },
  auth: { useAuth: vi.fn(() => ({ isAdmin: true })) },
}));

vi.mock('./use-privacy', () => hooks);
vi.mock('@/features/auth/auth-provider', () => auth);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const preview: ErasurePreview = {
  full_name: 'Jane Namuli',
  email: 'jane@example.com',
  leads: 2,
  is_candidate: true,
  applications: 1,
  submissions: 3,
  files: ['cv-import-2026-08/abc.pdf'],
  blockers: [],
};

function renderDialog(onErased = vi.fn()) {
  render(<ErasePersonDialog contactId="c1" onErased={onErased} onOpenChange={() => {}} open />);
  return onErased;
}

describe('ErasePersonDialog', () => {
  const mutateAsync = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    hooks.useErasurePreview.mockReturnValue({ data: preview, isLoading: false, error: null });
    hooks.useErasePerson.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('lists what will be deleted', () => {
    renderDialog();
    expect(screen.getByText(/2 leads, with history/)).toBeInTheDocument();
    expect(screen.getByText(/candidate profile and 1 application/)).toBeInTheDocument();
    expect(screen.getByText(/1 stored file/)).toBeInTheDocument();
    expect(screen.getByText(/3 website submissions/)).toBeInTheDocument();
  });

  it('stays locked until ERASE is typed, then erases files and record', async () => {
    const onErased = renderDialog();
    const button = screen.getByRole('button', { name: 'Erase permanently' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'erase' } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'ERASE' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ contactId: 'c1', files: preview.files }),
    );
    await waitFor(() => expect(onErased).toHaveBeenCalled());
  });

  it('refuses while the person is linked to records that must be kept', () => {
    hooks.useErasurePreview.mockReturnValue({
      data: { ...preview, blockers: ['2 finance document(s)'] },
      isLoading: false,
      error: null,
    });
    renderDialog();
    expect(screen.getByText(/linked to 2 finance document\(s\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/to confirm/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erase permanently' })).toBeDisabled();
  });
});

describe('DangerZone', () => {
  it('shows admin actions to admins only', () => {
    auth.useAuth.mockReturnValue({ isAdmin: false });
    const { rerender } = render(<DangerZone>Delete</DangerZone>);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();

    auth.useAuth.mockReturnValue({ isAdmin: true });
    rerender(<DangerZone>Delete</DangerZone>);
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });
});

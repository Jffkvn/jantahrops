import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import type { ProfileRow } from '@/types/database';

/**
 * Supabase is mocked at the module edge — the seam where our code meets theirs.
 * We are testing OUR behaviour: error mapping, the deactivated-account path,
 * enumeration resistance, and the loading gate. RLS itself is not mockable and
 * is covered by the opt-in suite in rls.test.ts.
 */
const mockSignInWithPassword = vi.fn();
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      getSession: mockGetSession,
      signOut: mockSignOut,
      resetPasswordForEmail: mockResetPasswordForEmail,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybeSingle }),
      }),
    }),
  }),
}));

const { AuthProvider, useAuth, DEACTIVATED_MESSAGE } = await import('./auth-provider');
const { ProtectedRoute } = await import('./protected-route');

const activeProfile: ProfileRow = {
  id: 'user-1',
  email: 'dora@jantahr.com',
  full_name: 'Dora',
  phone: null,
  role: 'admin',
  avatar_file_id: null,
  is_active: true,
  created_at: '2026-07-27T00:00:00Z',
  updated_at: '2026-07-27T00:00:00Z',
};

function Probe() {
  const { signIn, requestPasswordReset, user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.id ?? 'none'}</span>
      <button
        onClick={() => {
          void signIn('a@b.com', 'pw').then((r) => {
            if (!r.ok) document.title = r.message;
          });
        }}
        type="button"
      >
        sign in
      </button>
      <button
        onClick={() => {
          void requestPasswordReset('nobody@nowhere.com').then((r) => {
            document.title = r.ok ? 'reset-ok' : 'reset-failed';
          });
        }}
        type="button"
      >
        reset
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  document.title = '';
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('signIn error mapping', () => {
  it('maps invalid credentials to a message that does not reveal whether the email exists', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    screen.getByText('sign in').click();

    await waitFor(() => expect(document.title).toBe('Incorrect email or password.'));
    // Must not distinguish "no such user" from "wrong password".
    expect(document.title).not.toMatch(/not found|no account|unknown/i);
  });

  it('does not throw when the network fails', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Failed to fetch' },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(() => screen.getByText('sign in').click()).not.toThrow();
    await waitFor(() => expect(document.title).toMatch(/connection/i));
  });

  it('rejects a deactivated account and signs it back out', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { ...activeProfile, is_active: false },
      error: null,
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    screen.getByText('sign in').click();

    await waitFor(() => expect(document.title).toBe(DEACTIVATED_MESSAGE));
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe('password reset', () => {
  it('reports success for an address that has no account', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    screen.getByText('reset').click();
    // Reporting failure here would confirm which addresses have accounts.
    await waitFor(() => expect(document.title).toBe('reset-ok'));
  });
});

describe('ProtectedRoute', () => {
  it('renders a skeleton while auth is settling, never the login screen', () => {
    // A session that never resolves keeps loading true.
    mockGetSession.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/secret']}>
        <AuthProvider>
          <Routes>
            <Route element={<div>LOGIN SCREEN</div>} path="/login" />
            <Route
              element={
                <ProtectedRoute>
                  <div>SECRET</div>
                </ProtectedRoute>
              }
              path="/secret"
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText('LOGIN SCREEN')).toBeNull();
    expect(screen.queryByText('SECRET')).toBeNull();
  });

  it('redirects to /login and preserves the intended path', async () => {
    render(
      <MemoryRouter initialEntries={['/secret?tab=2']}>
        <AuthProvider>
          <Routes>
            <Route
              element={<PathProbe />}
              path="/login"
            />
            <Route
              element={
                <ProtectedRoute>
                  <div>SECRET</div>
                </ProtectedRoute>
              }
              path="/secret"
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('from').textContent).toBe('/secret?tab=2'));
  });
});

function PathProbe() {
  // Reads the state ProtectedRoute attached to the redirect. Under MemoryRouter
  // this lives in the router's own location, not window.history.
  const state = useLocation().state as { from?: string } | null;
  return <span data-testid="from">{state?.from ?? 'missing'}</span>;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import type { ProfileRow, UserRole } from '@/types/database';

export type AuthResult = { ok: true } | { ok: false; message: string };

interface AuthContextValue {
  user: User | null;
  profile: ProfileRow | null;
  role: UserRole | null;
  isAdmin: boolean;
  /** True until BOTH the session and the profile have settled. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const DEACTIVATED_MESSAGE = 'This account has been deactivated. Contact an administrator.';
const GENERIC_CREDENTIALS_MESSAGE = 'Incorrect email or password.';

/**
 * Supabase error strings are not a stable API and some of them leak whether an
 * address exists. Map to our own copy, and never distinguish "no such user"
 * from "wrong password" — that difference turns the form into an account
 * enumeration oracle.
 */
function toMessage(raw: string | undefined): string {
  const message = (raw ?? '').toLowerCase();
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return GENERIC_CREDENTIALS_MESSAGE;
  }
  if (message.includes('email not confirmed')) {
    return 'This email address has not been confirmed yet.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return GENERIC_CREDENTIALS_MESSAGE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (nextUser: User | null): Promise<ProfileRow | null> => {
      if (!nextUser) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', nextUser.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    const apply = async (session: Session | null) => {
      const nextUser = session?.user ?? null;
      const nextProfile = await loadProfile(nextUser);
      if (cancelled) return;

      // A deactivated account is treated as signed out rather than shown a
      // half-working app.
      if (nextProfile && !nextProfile.is_active) {
        await supabase.auth.signOut();
        if (cancelled) return;
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(nextUser);
      setProfile(nextProfile);
      setLoading(false);
    };

    // `loading` stays true until the session AND the profile have both settled,
    // so ProtectedRoute never flashes the login screen at a signed-in user.
    void supabase.auth.getSession().then(({ data }) => apply(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void apply(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { ok: false, message: toMessage(error.message) };

      const nextProfile = await loadProfile(data.user);
      if (nextProfile && !nextProfile.is_active) {
        await supabase.auth.signOut();
        return { ok: false, message: DEACTIVATED_MESSAGE };
      }
      return { ok: true };
    },
    [supabase, loadProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase]);

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      // Always reports success. Reporting failure for an unknown address would
      // confirm which addresses have accounts.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { ok: true };
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        return { ok: false, message: error.message || 'Could not update the password.' };
      }
      return { ok: true };
    },
    [supabase],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      isAdmin: profile?.role === 'admin',
      loading,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [user, profile, loading, signIn, signOut, requestPasswordReset, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

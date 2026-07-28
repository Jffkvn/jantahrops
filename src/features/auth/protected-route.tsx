import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './auth-provider';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Renders a full-page skeleton while auth settles.
 *
 * It must never render the login screen first and then swap: on a reload the
 * session restore is asynchronous, so an "unauthenticated until proven
 * otherwise" check flashes the login page at an already-signed-in user.
 */
function AuthPending() {
  return (
    <div className="min-h-screen bg-canvas p-8">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthPending />;

  if (!user) {
    // Carry the intended path so signing in lands where the user was going,
    // not on the home page.
    return <Navigate replace state={{ from: location.pathname + location.search }} to="/login" />;
  }

  return <>{children}</>;
}

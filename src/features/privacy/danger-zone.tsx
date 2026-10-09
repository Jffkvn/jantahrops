import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';

/** Admin-only footer for destructive actions. Renders nothing for staff. */
export function DangerZone({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;
  return (
    <div className="border-border border-t p-6">
      <h3 className="text-ink-secondary mb-3 text-xs font-semibold tracking-wide uppercase">
        Admin
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

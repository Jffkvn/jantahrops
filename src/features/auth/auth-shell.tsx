import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Shared frame for /login, /forgot-password and /reset-password.
 *
 * Deliberately plain: one centred card on the canvas. No split-screen hero, no
 * marketing copy, no gradient. This is an internal tool and the sign-in screen
 * should read as a door, not a landing page.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="rounded-card border border-border bg-surface p-8">
          <div className="flex flex-col items-center text-center">
            <Logo className="text-primary" size={40} title="JantaHR Ops" />
            <h1 className="mt-4 font-display text-xl font-semibold tracking-[-0.02em] text-ink">
              {title}
            </h1>
            <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
          </div>
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-ink-secondary">{footer}</div>}
      </div>
      <div className="mt-10">
        <ThemeToggle />
      </div>
    </main>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {message}
    </div>
  );
}

export function FormNotice({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-control border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
      role="status"
    >
      {message}
    </div>
  );
}

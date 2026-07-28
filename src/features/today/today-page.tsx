import { Target, FileText, UsersRound, Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';

/**
 * The Today view — the home screen and, once Phase 1 lands, the reason to open
 * Ops every morning: a work queue of follow-ups due, signals, and tasks.
 *
 * For now it is an honest empty state. It does NOT show fake numbers; a
 * dashboard of zeroes teaches nothing and a dashboard of invented data lies.
 */
export function TodayPage() {
  const { profile } = useAuth();
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';

  const quiet = [
    { label: 'Open leads', icon: Target },
    { label: 'Quotes waiting', icon: FileText },
    { label: 'Candidates in play', icon: UsersRound },
  ];

  return (
    <div>
      <PageHeader
        description={formatDate(new Date())}
        title={`Good day, ${firstName}`}
      />

      <EmptyState
        description="Your follow-ups, signals and tasks will gather here once the pipeline is live. Nothing needs you yet."
        headline="You're all caught up"
        icon={<Sparkles className="h-6 w-6" />}
      />

      {/* The quiet strip of numbers lives at the BOTTOM by design — this is a
          work queue, not a metrics dashboard. Zeroes until Phase 1 wires data. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {quiet.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-control bg-surface-sunken text-ink-muted">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="num text-lg font-semibold text-ink">0</p>
              <p className="text-xs text-ink-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSignals, useDismissSignal } from './use-signals';
import type { Signal, SignalSeverity } from './signals-api';

const SEVERITY_DOT: Record<SignalSeverity, string> = {
  urgent: 'bg-danger',
  warn: 'bg-warning',
  info: 'bg-primary',
};

/**
 * The signals block on the Day View. Each row is a flagged problem with a
 * one-click action (open the subject) and a dismiss. Renders nothing when
 * there is nothing to flag — an empty signals list is a good day, not a gap.
 */
export function SignalsSection({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const { data: signals, isLoading } = useSignals();
  const dismiss = useDismissSignal();

  if (isLoading || !signals || signals.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        <AlertTriangle className="h-3.5 w-3.5" />
        Signals
        <span className="num rounded-pill bg-surface-sunken px-1.5 text-[11px] font-medium text-ink-muted">
          {signals.length}
        </span>
      </h2>
      <ul className="space-y-2">
        {signals.map((signal) => (
          <SignalRow
            key={signal.id}
            onDismiss={() => dismiss.mutate(signal.id)}
            onOpen={() => signal.subject_type === 'lead' && onOpenLead(signal.subject_id)}
            signal={signal}
          />
        ))}
      </ul>
    </section>
  );
}

function SignalRow({
  signal,
  onOpen,
  onDismiss,
}: {
  signal: Signal;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[signal.severity])} />
      <button className="min-w-0 flex-1 text-left" onClick={onOpen} type="button">
        <p className="truncate text-sm font-medium text-ink">{signal.title}</p>
        {signal.detail && <p className="truncate text-xs text-ink-secondary">{signal.detail}</p>}
      </button>
      {signal.suggested_action && (
        <button
          className="hidden shrink-0 items-center gap-1 rounded-control border border-border px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:border-border-strong hover:text-ink sm:inline-flex"
          onClick={onOpen}
          type="button"
        >
          {signal.suggested_action}
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
      <button
        aria-label="Dismiss signal"
        className="shrink-0 rounded-control p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        onClick={onDismiss}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

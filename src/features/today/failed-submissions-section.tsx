import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/format';
import type { FailedSubmission } from './failed-submissions-api';
import {
  useDismissFailedSubmission,
  useFailedSubmissions,
  useRecoverSubmission,
} from './use-failed-submissions';

/**
 * High-visibility warning banner shown at the top of Today when any website
 * form POST stalled after logging to `web_submissions`. Renders nothing when empty.
 */
export function FailedSubmissionsSection() {
  const { data: failed } = useFailedSubmissions();
  const recover = useRecoverSubmission();
  const dismiss = useDismissFailedSubmission();

  if (!failed || failed.length === 0) return null;

  const busy = recover.isPending || dismiss.isPending;

  const handleRecover = async (item: FailedSubmission) => {
    try {
      await recover.mutateAsync(item);
      toast.success(`Recovered ${item.name} into JantaHR Ops`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not recover submission');
    }
  };

  const handleDismiss = async (item: FailedSubmission) => {
    try {
      await dismiss.mutateAsync(item);
      toast.success(`Dismissed failed submission log for ${item.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not dismiss submission');
    }
  };

  return (
    <section className="rounded-card border-danger/40 bg-danger-soft/50 mb-8 border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-danger flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed website submissions
          <span className="bg-danger text-primary-ink rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-normal normal-case">
            {failed.length}
          </span>
        </h2>
        <span className="text-ink-secondary text-xs">
          Saved in intake log — recover into pipeline with one click
        </span>
      </div>

      <ul className="space-y-2">
        {failed.map((item) => {
          const contactInfo = [item.email, item.phone].filter(Boolean).join(' · ');
          return (
            <li
              className="rounded-card border-danger/25 bg-surface flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
              key={`${item.leadType}-${item.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink truncate text-sm font-semibold">{item.name}</span>
                  <span className="text-ink-secondary text-xs">{item.targetLabel}</span>
                  {item.attemptCount > 1 && (
                    <span className="rounded-pill bg-danger-soft text-danger px-2 py-0.5 text-[11px] font-semibold">
                      {item.attemptCount} attempts
                    </span>
                  )}
                </div>
                <p className="text-ink-secondary mt-0.5 truncate text-xs">
                  {contactInfo || 'No contact info'}
                  {item.hasCv ? ' · CV attached' : ''}
                  <span className="text-ink-muted"> · {formatRelative(item.latestCreatedAt)}</span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  disabled={busy}
                  onClick={() => void handleRecover(item)}
                  size="sm"
                  variant="danger"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Recover
                </Button>
                <Button
                  aria-label={`Dismiss failed submission for ${item.name}`}
                  disabled={busy}
                  onClick={() => void handleDismiss(item)}
                  size="icon"
                  title="Dismiss"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

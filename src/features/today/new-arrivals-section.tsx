import { useNavigate } from 'react-router';
import { Check, ChevronRight, FileUser, Inbox, Target, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/format';
import type { Arrival, ArrivalKind } from './new-arrivals-api';
import { useMarkReviewed, useNewArrivals } from './use-new-arrivals';

const ICONS: Record<ArrivalKind, typeof Target> = {
  lead: Target,
  application: FileUser,
  candidate: UserPlus,
};

/**
 * Everything that came in through jantahr.com and nobody has looked at yet.
 * Renders nothing when the queue is empty, like the other Today sections.
 */
export function NewArrivalsSection({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const navigate = useNavigate();
  const { data: arrivals } = useNewArrivals();
  const mark = useMarkReviewed();

  if (!arrivals || arrivals.length === 0) return null;

  const open = (a: Arrival) => {
    if (a.kind === 'lead') onOpenLead(a.id);
    else if (a.kind === 'application')
      void navigate(`/recruitment/${a.vacancyId}?application=${a.id}`);
    else void navigate(`/talent?candidate=${a.id}`);
  };

  const review = async (items: Arrival[]) => {
    try {
      await mark.mutateAsync(items);
      if (items.length > 1) toast.success(`${items.length} items marked as reviewed`);
    } catch {
      toast.error('Could not mark as reviewed. Please try again.');
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-ink-secondary flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <Inbox className="h-3.5 w-3.5" />
          New from the website
          <span className="bg-primary text-primary-ink rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-normal normal-case">
            {arrivals.length}
          </span>
        </h2>
        {arrivals.length > 1 && (
          <Button
            disabled={mark.isPending}
            onClick={() => void review(arrivals)}
            size="sm"
            variant="ghost"
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            Mark all reviewed
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {arrivals.map((a) => {
          const Icon = ICONS[a.kind];
          return (
            <li
              className="rounded-card border-border bg-surface hover:border-border-strong flex items-center gap-2 border pr-2 transition-colors"
              key={`${a.kind}-${a.id}`}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                onClick={() => open(a)}
                type="button"
              >
                <Icon className="text-ink-muted h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm font-medium">{a.name}</span>
                  <span className="text-ink-secondary block truncate text-xs">
                    {a.detail}
                    <span className="text-ink-muted"> · {formatRelative(a.createdAt)}</span>
                  </span>
                </span>
                <ChevronRight className="text-ink-muted h-4 w-4 shrink-0" />
              </button>
              <Button
                aria-label={`Mark ${a.name} as reviewed`}
                disabled={mark.isPending}
                onClick={() => void review([a])}
                size="icon"
                title="Mark as reviewed"
                variant="ghost"
              >
                <Check className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

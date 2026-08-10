import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatDays } from './project-meta';
import type { ProjectPnlViewRow } from '@/types/database';

/**
 * The estimated P&L.
 *
 * Two rules govern this panel. First, it always shows its working — contracted
 * value, minus expenses, minus labour — because a bare profit number invites
 * more trust than an estimate deserves. Second, when the internal day rate is
 * unset the labour line and the profit are ABSENT, not zero: a project showing
 * "profit = full contracted value" because nobody set a rate is worse than one
 * showing nothing at all.
 */
export function ProjectPnlPanel({
  pnl,
  isLoading,
}: {
  pnl: ProjectPnlViewRow | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-40 w-full rounded-card" />;
  if (!pnl) return null;

  const rateUnset = pnl.estimated_profit_ugx === null;
  const outstanding = pnl.invoiced_ugx - pnl.received_ugx;

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Estimated P&amp;L
        </h3>
        <span className="text-[11px] text-ink-muted">an estimate, not the accounts</span>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Line label="Contracted" value={pnl.contracted_value_ugx} />
        <Line label="Direct expenses" negative value={pnl.expenses_ugx} />
        {rateUnset ? (
          <div className="flex items-baseline justify-between gap-3 text-ink-muted">
            <dt>Cost of time ({formatDays(pnl.days_logged)})</dt>
            <dd className="text-xs">no day rate set</dd>
          </div>
        ) : (
          <Line
            label={`Cost of time (${formatDays(pnl.days_logged)})`}
            negative
            value={pnl.labour_cost_ugx ?? 0}
          />
        )}

        <div className="!mt-2.5 flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
          <dt className="font-medium text-ink">Estimated profit</dt>
          <dd>
            {rateUnset ? (
              <span className="text-sm text-ink-muted">—</span>
            ) : (
              <Money
                className={cn(
                  'text-md',
                  (pnl.estimated_profit_ugx ?? 0) >= 0 ? 'text-success' : 'text-danger',
                )}
                value={BigInt(pnl.estimated_profit_ugx ?? 0)}
              />
            )}
          </dd>
        </div>
      </dl>

      {rateUnset && (
        <p className="mt-3 flex items-start gap-1.5 rounded-control bg-surface-sunken/60 px-3 py-2 text-xs text-ink-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Profit needs to know what a day of your time costs. Set it in{' '}
            <Link className="font-medium text-primary hover:underline" to="/settings">
              Settings → Company
            </Link>{' '}
            and every project gets an estimate.
          </span>
        </p>
      )}

      {/* Billing is a separate question from profitability: a project can be
          profitable on paper and still have nothing in the bank. */}
      {(pnl.invoiced_ugx > 0 || pnl.received_ugx > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2.5 text-xs">
          <span className="text-ink-muted">
            Invoiced <Money className="num text-ink-secondary" compact value={BigInt(pnl.invoiced_ugx)} />
          </span>
          <span className="text-ink-muted">
            Received <Money className="num text-ink-secondary" compact value={BigInt(pnl.received_ugx)} />
          </span>
          {outstanding > 0 && (
            <span className="text-warning">
              Outstanding <Money className="num" compact value={BigInt(outstanding)} />
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function Line({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className={cn('num', negative && value > 0 ? 'text-ink-secondary' : 'text-ink')}>
        {negative && value > 0 && '−'}
        <Money className="text-sm" value={BigInt(Math.abs(value))} />
      </dd>
    </div>
  );
}

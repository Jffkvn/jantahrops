import { Money } from '@/components/money';
import { StatusChip } from '@/components/status-chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { Target } from 'lucide-react';
import { formatRelative } from '@/lib/format';
import { stageMeta } from './lead-stages';
import { NextActionDot } from './next-action-dot';
import { useLeadsList } from './use-leads';
import type { ListLeadsParams } from './leads-api';

export function LeadTable({
  params,
  page,
  onPageChange,
  onOpenLead,
  onNewLead,
}: {
  params: ListLeadsParams;
  page: number;
  onPageChange: (page: number) => void;
  onOpenLead: (id: string) => void;
  onNewLead: () => void;
}) {
  const pageSize = params.pageSize ?? 25;
  const { data, isLoading } = useLeadsList({ ...params, page, pageSize });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton className="h-12 w-full rounded-control" key={i} />
        ))}
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  if (rows.length === 0) {
    return (
      <EmptyState
        action={
          <Button onClick={onNewLead} variant="primary">
            Add a lead
          </Button>
        }
        description={
          params.search || params.stage !== 'all'
            ? 'No leads match these filters. Try clearing them.'
            : 'Leads captured here — or arriving from the website — will appear in this list.'
        }
        headline="No leads yet"
        icon={<Target className="h-6 w-6" />}
      />
    );
  }

  const pageCount = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              <Th>Contact</Th>
              <Th>Organisation</Th>
              <Th>Stage</Th>
              <Th className="text-right">Value</Th>
              <Th>Owner</Th>
              <Th>Next action</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead) => (
              <tr
                className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-sunken/60"
                key={lead.id}
                onClick={() => onOpenLead(lead.id)}
              >
                <td className="px-4 py-2.5 font-medium text-ink">
                  {lead.contact?.full_name ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-ink-secondary">{lead.organisation?.name ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <StatusChip variant={stageMeta(lead.stage).tone}>
                    {stageMeta(lead.stage).label}
                  </StatusChip>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {lead.value_ugx > 0 ? (
                    <Money value={BigInt(lead.value_ugx)} />
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-secondary">{lead.owner?.full_name ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <NextActionDot nextActionAt={lead.next_action_at} withLabel />
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{formatRelative(lead.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
          <span className="num">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button disabled={page === 0} onClick={() => onPageChange(page - 1)} size="sm" variant="secondary">
              Previous
            </Button>
            <Button
              disabled={page >= pageCount - 1}
              onClick={() => onPageChange(page + 1)}
              size="sm"
              variant="secondary"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 font-display text-xs font-semibold text-ink-secondary ${className}`}
    >
      {children}
    </th>
  );
}

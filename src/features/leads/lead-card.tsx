import { Building2 } from 'lucide-react';
import { Money } from '@/components/money';
import { NextActionDot } from './next-action-dot';
import type { LeadWithRelations } from './leads-api';

/** Compact card for the board column. Click opens the detail sheet. */
export function LeadCard({
  lead,
  onClick,
  draggable,
  onDragStart,
}: {
  lead: LeadWithRelations;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      className="w-full cursor-pointer rounded-control border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong"
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink">
          {lead.contact?.full_name ?? 'Unknown contact'}
        </span>
        <NextActionDot nextActionAt={lead.next_action_at} />
      </div>

      {lead.organisation && (
        <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{lead.organisation.name}</span>
        </span>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        {lead.value_ugx > 0 ? (
          <Money className="text-sm font-semibold text-ink" compact value={BigInt(lead.value_ugx)} />
        ) : (
          <span className="text-xs text-ink-muted">No value</span>
        )}
        {lead.owner && (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary"
            title={lead.owner.full_name}
          >
            {initials(lead.owner.full_name)}
          </span>
        )}
      </div>
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

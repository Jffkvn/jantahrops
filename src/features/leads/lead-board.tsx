import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import { BOARD_STAGES } from './lead-stages';
import { LeadCard } from './lead-card';
import { useBoardLeads, useUpdateLeadStage } from './use-leads';
import type { LeadWithRelations } from './leads-api';
import type { LeadStage } from '@/types/database';

export function LeadBoard({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const { data: leads, isLoading } = useBoardLeads();
  const updateStage = useUpdateLeadStage();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStage | null>(null);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {BOARD_STAGES.map((s) => (
          <div key={s.value} className="w-72 shrink-0 space-y-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-24 w-full rounded-control" />
            <Skeleton className="h-24 w-full rounded-control" />
          </div>
        ))}
      </div>
    );
  }

  const byStage = (stage: LeadStage) => (leads ?? []).filter((l) => l.stage === stage);
  const columnValue = (rows: LeadWithRelations[]) =>
    rows.reduce((sum, l) => sum + BigInt(l.value_ugx), 0n);

  const drop = (stage: LeadStage) => {
    if (dragId) {
      const lead = leads?.find((l) => l.id === dragId);
      if (lead && lead.stage !== stage) updateStage.mutate({ id: dragId, stage });
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {BOARD_STAGES.map((stage) => {
        const rows = byStage(stage.value);
        return (
          <div
            key={stage.value}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-card border p-2 transition-colors',
              overStage === stage.value
                ? 'border-primary bg-primary-soft/40'
                : 'border-transparent bg-surface-sunken/50',
            )}
            onDragLeave={() => setOverStage((s) => (s === stage.value ? null : s))}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(stage.value);
            }}
            onDrop={() => drop(stage.value)}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                {stage.label}
                <span className="num rounded-pill bg-surface px-1.5 text-xs font-medium text-ink-muted">
                  {rows.length}
                </span>
              </span>
              {columnValue(rows) > 0n && (
                <Money className="text-xs text-ink-muted" compact value={columnValue(rows)} />
              )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-1">
              {rows.map((lead) => (
                <LeadCard
                  key={lead.id}
                  draggable
                  lead={lead}
                  onClick={() => onOpenLead(lead.id)}
                  onDragStart={() => setDragId(lead.id)}
                />
              ))}
              {rows.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-ink-muted">Nothing here yet</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

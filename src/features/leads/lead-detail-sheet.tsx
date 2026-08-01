import { useState } from 'react';
import { Phone, Mail, MessageCircle, Building2, Send } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusChip } from '@/components/status-chip';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime, formatRelative } from '@/lib/format';
import { formatPhoneDisplay } from '@/lib/phone';
import { LEAD_STAGES, stageMeta } from './lead-stages';
import { NextActionDot } from './next-action-dot';
import { useLead, useLeadTimeline, useUpdateLeadStage, useAddLeadNote } from './use-leads';
import type { LeadStage } from '@/types/database';

export function LeadDetailSheet({
  leadId,
  onOpenChange,
}: {
  leadId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={leadId !== null}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg" side="right">
        {leadId && <LeadDetailBody leadId={leadId} />}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetailBody({ leadId }: { leadId: string }) {
  const { data: lead, isLoading } = useLead(leadId);
  const { data: timeline } = useLeadTimeline(leadId);
  const updateStage = useUpdateLeadStage();
  const addNote = useAddLeadNote(leadId);
  const [note, setNote] = useState('');

  if (isLoading || !lead) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  const contact = lead.contact;
  const submitNote = async () => {
    const body = note.trim();
    if (!body) return;
    await addNote.mutateAsync(body);
    setNote('');
  };

  return (
    <div>
      {/* Header */}
      <div className="border-b border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold text-ink">
              {contact?.full_name ?? 'Unknown contact'}
            </h2>
            {lead.organisation && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-secondary">
                <Building2 className="h-3.5 w-3.5" />
                {lead.organisation.name}
              </p>
            )}
          </div>
          <StatusChip variant={stageMeta(lead.stage).tone}>{stageMeta(lead.stage).label}</StatusChip>
        </div>

        {/* Quick actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {contact?.phone_e164 && (
            <>
              <QuickAction href={`tel:${contact.phone_e164}`} icon={Phone} label="Call" />
              <QuickAction
                href={`https://wa.me/${contact.phone_e164.replace('+', '')}`}
                icon={MessageCircle}
                label="WhatsApp"
              />
            </>
          )}
          {contact?.email && (
            <QuickAction href={`mailto:${contact.email}`} icon={Mail} label="Email" />
          )}
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-6 text-sm">
        <Fact label="Value">
          {lead.value_ugx > 0 ? (
            <Money className="font-semibold text-ink" value={BigInt(lead.value_ugx)} />
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </Fact>
        <Fact label="Owner">{lead.owner?.full_name ?? <span className="text-ink-muted">Unassigned</span>}</Fact>
        <Fact label="Service">{lead.service_interest ?? <span className="text-ink-muted">—</span>}</Fact>
        <Fact label="Source">{lead.source ?? <span className="text-ink-muted">—</span>}</Fact>
        {contact?.phone_e164 && <Fact label="Phone">{formatPhoneDisplay(contact.phone_e164)}</Fact>}
        {contact?.email && <Fact label="Email">{contact.email}</Fact>}
        <Fact label="Next action">
          <NextActionDot nextActionAt={lead.next_action_at} withLabel />
        </Fact>
        <Fact label="Created">{formatRelative(lead.created_at)}</Fact>
      </div>

      {/* Stage control */}
      <div className="border-b border-border p-6">
        <label className="mb-1.5 block text-xs font-semibold text-ink-secondary">Move stage</label>
        <Select
          onValueChange={(v) => updateStage.mutate({ id: lead.id, stage: v as LeadStage })}
          value={lead.stage}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <div className="p-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Activity
        </h3>

        <div className="mb-4 flex gap-2">
          <Textarea
            className="min-h-0"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            value={note}
          />
          <Button
            className="shrink-0 self-end"
            disabled={!note.trim() || addNote.isPending}
            onClick={() => void submitNote()}
            size="icon"
            variant="primary"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <ol className="space-y-3">
          {(timeline ?? []).map((a) => (
            <li className="flex gap-3" key={a.id}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
              <div className="min-w-0">
                <p className="text-sm text-ink">{a.body}</p>
                <p className="text-xs text-ink-muted">{formatDateTime(a.occurred_at)}</p>
              </div>
            </li>
          ))}
          {(timeline ?? []).length === 0 && (
            <li className="text-sm text-ink-muted">No activity yet.</li>
          )}
        </ol>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
}) {
  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-sunken"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}

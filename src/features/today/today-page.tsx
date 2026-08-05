import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Target, Wallet, Sparkles, Building2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-provider';
import { getSupabase } from '@/lib/supabase';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { NextActionDot } from '@/features/leads/next-action-dot';
import { LeadDetailSheet } from '@/features/leads/lead-detail-sheet';
import { SignalsSection } from '@/features/signals/signals-section';
import { useDayView } from './use-today';
import type { LeadWithRelations } from '@/features/leads/leads-api';

export function TodayPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useDayView();
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';
  const due = data?.dueFollowUps ?? [];

  const openApplication = async (applicationId: string) => {
    const { data: application } = await getSupabase()
      .from('applications')
      .select('vacancy_id')
      .eq('id', applicationId)
      .maybeSingle();
    if (application?.vacancy_id) {
      void navigate(`/recruitment/${application.vacancy_id}?application=${applicationId}`);
    }
  };

  return (
    <div>
      <PageHeader description={formatDate(new Date())} title={`Good day, ${firstName}`} />

      {/* NEEDS YOU — the primary block. */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Needs you
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-16 w-full rounded-card" />
          </div>
        ) : due.length === 0 ? (
          <EmptyState
            description="No follow-ups are due today. Set a next action on a lead and it will surface here when it's time."
            headline="You're all caught up"
            icon={<Sparkles className="h-6 w-6" />}
          />
        ) : (
          <ul className="space-y-2">
            {due.map((lead) => (
              <FollowUpRow key={lead.id} lead={lead} onOpen={() => setOpenLeadId(lead.id)} />
            ))}
          </ul>
        )}
      </section>

      {/* Signals — flagged problems with a one-click action. Hidden when none. */}
      <SignalsSection onOpenApplication={(id) => void openApplication(id)} onOpenLead={setOpenLeadId} />

      {/* Quiet number strip — a footnote, not a hero. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={Target}
          label="Open leads"
          loading={isLoading}
          onClick={() => void navigate('/leads')}
          value={data ? String(data.counts.openLeads) : '—'}
        />
        <Stat
          icon={Wallet}
          label="Pipeline value"
          loading={isLoading}
          onClick={() => void navigate('/leads')}
          value={data ? <Money value={BigInt(data.counts.pipelineValueUgx)} /> : '—'}
        />
        <Stat
          icon={Sparkles}
          label="Due today"
          loading={isLoading}
          value={data ? String(data.counts.dueToday) : '—'}
        />
      </div>

      <LeadDetailSheet leadId={openLeadId} onOpenChange={(o) => !o && setOpenLeadId(null)} />
    </div>
  );
}

function FollowUpRow({ lead, onOpen }: { lead: LeadWithRelations; onOpen: () => void }) {
  return (
    <li>
      <button
        className="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong"
        onClick={onOpen}
        type="button"
      >
        <NextActionDot nextActionAt={lead.next_action_at} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {lead.contact?.full_name ?? 'Unknown contact'}
            </span>
            {lead.organisation && (
              <span className="flex items-center gap-1 truncate text-xs text-ink-muted">
                <Building2 className="h-3 w-3 shrink-0" />
                {lead.organisation.name}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-ink-secondary">
            {lead.next_action_note || 'Follow-up due'}
            {' · '}
            <span className="text-ink-muted">
              <NextActionDot nextActionAt={lead.next_action_at} withLabel />
            </span>
          </p>
        </div>
        {lead.value_ugx > 0 && (
          <Money className="text-sm font-medium text-ink" compact value={BigInt(lead.value_ugx)} />
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
      </button>
    </li>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  loading,
  onClick,
}: {
  icon: typeof Target;
  label: string;
  value: React.ReactNode;
  loading: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex h-9 w-9 items-center justify-center rounded-control bg-surface-sunken text-ink-muted">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="num text-lg font-semibold text-ink">
          {loading ? <Skeleton className="h-6 w-12" /> : value}
        </div>
        <p className="text-xs text-ink-muted">{label}</p>
      </div>
    </>
  );
  const cls =
    'flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left';
  return onClick ? (
    <button className={`${cls} transition-colors hover:border-border-strong`} onClick={onClick} type="button">
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

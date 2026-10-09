import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Target, Wallet, Sparkles, Building2, ChevronRight, ListTodo } from 'lucide-react';
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
import { DayTasksSection } from '@/features/tasks/day-tasks-section';
import { useTaskCounts } from '@/features/tasks/use-tasks';
import { useDayView } from './use-today';
import { NewArrivalsSection } from './new-arrivals-section';
import type { LeadWithRelations } from '@/features/leads/leads-api';

export function TodayPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useDayView();
  const { data: taskCounts } = useTaskCounts();
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';
  const due = data?.dueFollowUps ?? [];
  // "All caught up" has to mean caught up on everything. Tasks render in their
  // own section below, so claiming a clear morning while three are overdue
  // would make the whole page untrustworthy.
  const tasksDue = (taskCounts?.dueToday ?? 0) + (taskCounts?.overdue ?? 0);

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

      {/* Website submissions nobody has looked at yet. Hidden when none. */}
      <NewArrivalsSection onOpenLead={setOpenLeadId} />

      {/* NEEDS YOU — the primary block. */}
      <section>
        <h2 className="text-ink-secondary mb-3 text-xs font-semibold tracking-wide uppercase">
          Needs you
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="rounded-card h-16 w-full" />
            <Skeleton className="rounded-card h-16 w-full" />
          </div>
        ) : due.length === 0 ? (
          tasksDue > 0 ? (
            <p className="rounded-card border-border bg-surface text-ink-secondary border px-4 py-3 text-sm">
              No follow-ups are due — your tasks are below.
            </p>
          ) : (
            <EmptyState
              description="No follow-ups are due today. Set a next action on a lead and it will surface here when it's time."
              headline="You're all caught up"
              icon={<Sparkles className="h-6 w-6" />}
            />
          )
        ) : (
          <ul className="space-y-2">
            {due.map((lead) => (
              <FollowUpRow key={lead.id} lead={lead} onOpen={() => setOpenLeadId(lead.id)} />
            ))}
          </ul>
        )}
      </section>

      {/* Signals — flagged problems with a one-click action. Hidden when none. */}
      <SignalsSection
        onOpenApplication={(id) => void openApplication(id)}
        onOpenLead={setOpenLeadId}
      />

      {/* Tasks due today or late. Renders nothing when there are none. */}
      <DayTasksSection />

      {/* Quiet number strip — a footnote, not a hero. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          label="Follow-ups due"
          loading={isLoading}
          value={data ? String(data.counts.dueToday) : '—'}
        />
        <Stat
          icon={ListTodo}
          label="Open tasks"
          loading={!taskCounts}
          onClick={() => void navigate('/tasks')}
          value={taskCounts ? String(taskCounts.open) : '—'}
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
        className="rounded-card border-border bg-surface hover:border-border-strong flex w-full items-center gap-3 border px-4 py-3 text-left transition-colors"
        onClick={onOpen}
        type="button"
      >
        <NextActionDot nextActionAt={lead.next_action_at} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-ink truncate text-sm font-medium">
              {lead.contact?.full_name ?? 'Unknown contact'}
            </span>
            {lead.organisation && (
              <span className="text-ink-muted flex items-center gap-1 truncate text-xs">
                <Building2 className="h-3 w-3 shrink-0" />
                {lead.organisation.name}
              </span>
            )}
          </div>
          <p className="text-ink-secondary truncate text-xs">
            {lead.next_action_note || 'Follow-up due'}
            {' · '}
            <span className="text-ink-muted">
              <NextActionDot nextActionAt={lead.next_action_at} withLabel />
            </span>
          </p>
        </div>
        {lead.value_ugx > 0 && (
          <Money className="text-ink text-sm font-medium" compact value={BigInt(lead.value_ugx)} />
        )}
        <ChevronRight className="text-ink-muted h-4 w-4 shrink-0" />
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
      <div className="rounded-control bg-surface-sunken text-ink-muted flex h-9 w-9 items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="num text-ink text-lg font-semibold">
          {loading ? <Skeleton className="h-6 w-12" /> : value}
        </div>
        <p className="text-ink-muted text-xs">{label}</p>
      </div>
    </>
  );
  const cls =
    'flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left';
  return onClick ? (
    <button
      className={`${cls} hover:border-border-strong transition-colors`}
      onClick={onClick}
      type="button"
    >
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

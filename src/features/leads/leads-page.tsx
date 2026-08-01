import { useEffect, useState } from 'react';
import { Plus, LayoutGrid, List, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LEAD_STAGES } from './lead-stages';
import { LeadBoard } from './lead-board';
import { LeadTable } from './lead-table';
import { CreateLeadSheet } from './create-lead-sheet';
import { LeadDetailSheet } from './lead-detail-sheet';
import { useTeam } from './use-leads';
import type { LeadStage } from '@/types/database';

type View = 'board' | 'table';
const VIEW_KEY = 'jantahr-ops-leads-view';

export function LeadsPage() {
  const [view, setView] = useState<View>(
    () => (localStorage.getItem(VIEW_KEY) as View | null) ?? 'board',
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stage, setStage] = useState<LeadStage | 'all'>('all');
  const [ownerId, setOwnerId] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const { data: team } = useTeam();

  useEffect(() => localStorage.setItem(VIEW_KEY, view), [view]);

  // Debounce search so each keystroke does not hit the server.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)} variant="primary">
            <Plus className="mr-1.5 h-4 w-4" />
            New lead
          </Button>
        }
        description="Every opportunity, from first contact to won or lost."
        title="Leads"
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company…"
            value={search}
          />
        </div>

        {view === 'table' && (
          <>
            <Select onValueChange={(v) => setStage(v as LeadStage | 'all')} value={stage}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {LEAD_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select onValueChange={setOwnerId} value={ownerId}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Any owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any owner</SelectItem>
                {(team ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {/* View toggle */}
        <div className="ml-auto flex rounded-control border border-border p-0.5">
          <ViewButton active={view === 'board'} icon={LayoutGrid} label="Board" onClick={() => setView('board')} />
          <ViewButton active={view === 'table'} icon={List} label="Table" onClick={() => setView('table')} />
        </div>
      </div>

      {view === 'board' ? (
        <LeadBoard onOpenLead={setOpenLeadId} />
      ) : (
        <LeadTable
          onNewLead={() => setCreateOpen(true)}
          onOpenLead={setOpenLeadId}
          onPageChange={setPage}
          page={page}
          params={{ search: debouncedSearch, stage, ownerId }}
        />
      )}

      <CreateLeadSheet onOpenChange={setCreateOpen} open={createOpen} />
      <LeadDetailSheet leadId={openLeadId} onOpenChange={(o) => !o && setOpenLeadId(null)} />
    </div>
  );
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof LayoutGrid;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-sm transition-colors',
        active ? 'bg-surface-sunken font-medium text-ink' : 'text-ink-muted hover:text-ink',
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

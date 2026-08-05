import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, UserRound } from 'lucide-react';
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
import { StatusChip } from '@/components/status-chip';
import { formatDate } from '@/lib/format';
import { applicantCount } from './recruitment-api';
import { VACANCY_STATUS_LABELS, VACANCY_STATUS_TONES } from './recruitment-meta';
import { useVacanciesList } from './use-recruitment';
import { VacancyEditorSheet } from './vacancy-editor-sheet';
import type { VacancyStatus } from '@/types/database';

export function RecruitmentPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VacancyStatus | 'all'>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const { data, isLoading } = useVacanciesList({ search, status, pageSize: 100 });

  const vacancies = useMemo(() => data?.rows ?? [], [data]);

  const counters = useMemo(() => {
    const counts: Record<string, number> = { all: vacancies.length };
    for (const v of vacancies) counts[v.status] = (counts[v.status] ?? 0) + 1;
    return counts;
  }, [vacancies]);

  const openCount = counters.open ?? 0;
  const activeApplicants = useMemo(
    () => vacancies.reduce((sum, v) => sum + applicantCount(v), 0),
    [vacancies],
  );

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => setEditorOpen(true)} variant="primary">
            <Plus className="mr-1.5 h-4 w-4" />
            New vacancy
          </Button>
        }
        description="Post jobs, run the pipeline, and build shortlists for clients."
        title="Recruitment"
      />

      {/* Counters */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-surface px-4 py-3">
          <div className="num text-lg font-semibold text-ink">{openCount}</div>
          <p className="text-xs text-ink-muted">Open vacancies</p>
        </div>
        <div className="rounded-card border border-border bg-surface px-4 py-3">
          <div className="num text-lg font-semibold text-ink">{activeApplicants}</div>
          <p className="text-xs text-ink-muted">Total applicants across all vacancies</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vacancies…"
            value={search}
          />
        </div>
        <Select onValueChange={(v) => setStatus(v as VacancyStatus | 'all')} value={status}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(VACANCY_STATUS_LABELS) as VacancyStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {VACANCY_STATUS_LABELS[s]} ({counters[s] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="rounded-card border border-border bg-surface p-6 text-sm text-ink-secondary">
          Loading vacancies…
        </div>
      ) : vacancies.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-12 text-center text-sm text-ink-secondary">
          {search || status !== 'all'
            ? 'No vacancies match your filters.'
            : 'No vacancies yet. Create one to start hiring.'}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {vacancies.map((v) => (
            <li
              className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-sunken"
              key={v.id}
              onClick={() => void navigate(`/recruitment/${v.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void navigate(`/recruitment/${v.id}`);
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-ink">{v.title}</span>
                  <StatusChip variant={VACANCY_STATUS_TONES[v.status]}>
                    {VACANCY_STATUS_LABELS[v.status]}
                  </StatusChip>
                </div>
                <p className="mt-0.5 truncate text-sm text-ink-secondary">
                  {v.organisation?.name ?? 'Unassigned client'}
                  {v.location ? ` · ${v.location}` : ''}
                  {v.closes_at ? ` · closes ${formatDate(v.closes_at)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm text-ink-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-4 w-4" />
                  {applicantCount(v)} applicant{applicantCount(v) === 1 ? '' : 's'}
                </span>
                {v.published_at && (
                  <span className="hidden sm:inline">Posted {formatDate(v.published_at)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <VacancyEditorSheet onOpenChange={setEditorOpen} open={editorOpen} />
    </div>
  );
}

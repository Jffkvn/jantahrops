import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatUGX } from '@/lib/format';
import { formatPhoneDisplay } from '@/lib/phone';
import { AVAILABILITY_LABELS } from './recruitment-meta';
import {
  useCandidatesList,
  useCreateApplication,
  useDistinctSkills,
  useVacanciesList,
} from './use-recruitment';
import { CreateCandidateSheet } from './create-candidate-sheet';
import { CandidateDetailSheet } from './candidate-detail-sheet';
import type { CandidateWithRelations, ListCandidatesParams } from './recruitment-api';

export function TalentPoolPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [vacancyId, setVacancyId] = useState<string>('');
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ⌘K deep-links here: ?candidate=<id> opens a candidate profile.
  useEffect(() => {
    const candidateParam = searchParams.get('candidate');
    if (candidateParam) {
      setOpenCandidateId(candidateParam);
      searchParams.delete('candidate');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const { data: skillsData } = useDistinctSkills();
  const { data: vacanciesData } = useVacanciesList({ status: 'open', pageSize: 100 });
  const createApplication = useCreateApplication();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const candidatesParams: ListCandidatesParams = useMemo(
    () => ({
      search: debouncedSearch,
      skills,
      pageSize: 100,
      ...(availableOnly ? { available: true } : {}),
    }),
    [debouncedSearch, skills, availableOnly],
  );
  const { data, isLoading } = useCandidatesList(candidatesParams);

  const candidates = data?.rows ?? [];
  const openVacancies = vacanciesData?.rows ?? [];

  const skillOptions = useMemo(() => {
    const set = new Set(skills);
    const pooled = [...set, ...(skillsData ?? [])];
    return [...new Set(pooled)].slice(0, 60);
  }, [skills, skillsData]);

  const addToVacancy = async (candidateId: string) => {
    if (!vacancyId) return;
    const result = await createApplication.mutateAsync({ vacancyId, candidateId });
    if (result === null) toast.info('Already applied to this vacancy');
    else toast.success('Added to vacancy');
    setAddTarget(null);
  };

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)} variant="primary">
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add candidate
          </Button>
        }
        description="Search everyone we have on file, across past and active applications."
        title="Talent Pool"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, headline, skills…"
            value={search}
          />
        </div>

        <Select
          onValueChange={(v) => setSkills(v === 'all' ? [] : [v])}
          value={skills[0] ?? 'all'}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All skills" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All skills</SelectItem>
            {skillOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5">
          <Switch checked={availableOnly} onCheckedChange={setAvailableOnly} />
          <span className="text-sm text-ink-secondary">Available</span>
        </div>

        <Select onValueChange={setVacancyId} value={vacancyId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Add to vacancy…" />
          </SelectTrigger>
          <SelectContent>
            {openVacancies.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-12 text-center text-sm text-ink-secondary">
          {debouncedSearch || skills.length > 0
            ? 'No candidates match your filters.'
            : 'No candidates yet. Add one to start building your talent pool.'}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {candidates.map((candidate) => (
            <CandidateRow
              addTarget={addTarget}
              candidate={candidate}
              key={candidate.id}
              onAdd={() => setAddTarget(candidate.id)}
              onAddToVacancy={() => void addToVacancy(candidate.id)}
              onOpen={() => setOpenCandidateId(candidate.id)}
              vacancyId={vacancyId}
            />
          ))}
        </ul>
      )}

      <CreateCandidateSheet onOpenChange={setCreateOpen} open={createOpen} />
      <CandidateDetailSheet
        candidateId={openCandidateId}
        onOpenChange={(o) => {
          if (!o) setOpenCandidateId(null);
        }}
        open={openCandidateId != null}
      />
    </div>
  );
}

function CandidateRow({
  candidate,
  vacancyId,
  addTarget,
  onAdd,
  onAddToVacancy,
  onOpen,
}: {
  candidate: CandidateWithRelations;
  vacancyId: string;
  addTarget: string | null;
  onAdd: () => void;
  onAddToVacancy: () => void;
  onOpen: () => void;
}) {
  const contact = candidate.contact;
  const name = contact?.full_name ?? 'Unnamed candidate';

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button className="min-w-0 flex-1 text-left" onClick={onOpen} type="button">
          <p className="font-medium text-ink">{name}</p>
          <p className="mt-0.5 truncate text-sm text-ink-secondary">
            {candidate.headline ??
              (candidate.skills.length > 0 ? candidate.skills.slice(0, 4).join(' · ') : 'No profile yet')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {contact?.email && <span>{contact.email}</span>}
            {contact?.phone_e164 && <span>{formatPhoneDisplay(contact.phone_e164)}</span>}
            {candidate.years_experience != null && <span>{candidate.years_experience} yrs</span>}
            {candidate.availability && <span>{AVAILABILITY_LABELS[candidate.availability]}</span>}
            {candidate.salary_expectation_ugx != null && candidate.salary_expectation_ugx > 0 && (
              <span>{formatUGX(BigInt(candidate.salary_expectation_ugx))}</span>
            )}
          </div>
          {candidate.skills.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {candidate.skills.slice(0, 6).map((s) => (
                <span
                  className="rounded-pill bg-surface-sunken px-2 py-0.5 text-xs text-ink-secondary"
                  key={s}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </button>

        {addTarget === candidate.id ? (
          <div className="flex items-center gap-2">
            {vacancyId ? (
              <>
                <Button onClick={() => onAddToVacancy()} size="sm" variant="primary">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Confirm
                </Button>
                <Button onClick={onAdd} size="sm" variant="ghost">
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={onAdd} size="sm" variant="ghost">
                Close
              </Button>
            )}
          </div>
        ) : (
          <Button
            disabled={!vacancyId}
            onClick={onAdd}
            size="sm"
            variant={vacancyId ? 'secondary' : 'ghost'}
            title={vacancyId ? undefined : 'Pick a vacancy first'}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>
    </li>
  );
}
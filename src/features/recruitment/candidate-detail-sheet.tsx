import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Phone, Mail, MessageCircle, FileText, ChevronRight, Star, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { StatusChip } from '@/components/status-chip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatDateTime, formatUGX, formatRelative } from '@/lib/format';
import { cvSignedUrl } from './recruitment-api';
import { AVAILABILITY_LABELS, stageMeta } from './recruitment-meta';
import {
  useCandidate,
  useCandidateApplications,
  useCandidateTimeline,
  useCreateApplication,
  useVacanciesList,
  useUpdateCandidate,
} from './use-recruitment';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { DangerZone } from '@/features/privacy/danger-zone';
import { ErasePersonDialog } from '@/features/privacy/erase-person-dialog';

export function CandidateDetailSheet({
  candidateId,
  onOpenChange,
  open,
}: {
  candidateId: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg" side="right">
        {candidateId && (
          <CandidateDetailBody candidateId={candidateId} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function CandidateDetailBody({
  candidateId,
  onClose,
}: {
  candidateId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: candidate, isLoading } = useCandidate(candidateId);
  const { data: applications } = useCandidateApplications(candidateId);
  const { data: timeline } = useCandidateTimeline(candidateId);
  const { data: vacanciesData } = useVacanciesList({ status: 'open', pageSize: 100 });
  const createApplication = useCreateApplication();
  const updateCandidate = useUpdateCandidate(candidateId);
  const [vacancyId, setVacancyId] = useState('');
  const [eraseOpen, setEraseOpen] = useState(false);

  if (isLoading || !candidate) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="rounded-card h-40 w-full" />
      </div>
    );
  }

  const contact = candidate.contact;
  const openVacancies = vacanciesData?.rows ?? [];

  const downloadCv = async () => {
    const url = await cvSignedUrl(candidate.id);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('No CV on file for this candidate');
  };

  const addToVacancy = async () => {
    if (!vacancyId) return;
    const result = await createApplication.mutateAsync({ vacancyId, candidateId: candidate.id });
    if (result === null) toast.info('Already applied to this vacancy');
    else toast.success('Added to vacancy');
  };

  return (
    <div>
      <div className="border-border bg-surface border-b p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-ink truncate text-xl font-semibold">
              {contact?.full_name ?? 'Unnamed candidate'}
            </h2>
            {candidate.headline && (
              <p className="text-ink-secondary mt-0.5 text-sm">{candidate.headline}</p>
            )}
          </div>
          <StatusChip variant={candidate.is_available ? 'success' : 'neutral'}>
            {candidate.is_available ? 'Available' : 'Inactive'}
          </StatusChip>
        </div>

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
          <button
            className="rounded-control border-border bg-surface text-ink hover:bg-surface-sunken inline-flex items-center gap-1.5 border px-3 py-1.5 text-sm transition-colors"
            onClick={() => void downloadCv()}
            type="button"
          >
            <FileText className="h-3.5 w-3.5" />
            CV
          </button>
        </div>
      </div>

      <div className="border-border grid grid-cols-2 gap-x-4 gap-y-3 border-b p-6 text-sm">
        {candidate.years_experience != null && (
          <Fact label="Experience">{candidate.years_experience} yrs</Fact>
        )}
        {candidate.availability && (
          <Fact label="Availability">{AVAILABILITY_LABELS[candidate.availability]}</Fact>
        )}
        {candidate.salary_expectation_ugx != null && candidate.salary_expectation_ugx > 0 && (
          <Fact label="Salary expectation">
            {formatUGX(BigInt(candidate.salary_expectation_ugx))}
          </Fact>
        )}
        <div>
          <p className="text-ink-muted text-xs">Rating</p>
          <div className="mt-0.5 flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                aria-label={`Rate ${n} out of 5`}
                className="p-0.5"
                key={n}
                onClick={() =>
                  updateCandidate.mutate({ rating: candidate.rating === n ? null : n })
                }
                type="button"
              >
                <Star
                  className={cn(
                    'h-4 w-4 transition-colors',
                    candidate.rating != null && candidate.rating >= n
                      ? 'text-warning fill-current'
                      : 'text-ink-muted',
                  )}
                />
              </button>
            ))}
          </div>
        </div>
        {candidate.source && <Fact label="Source">{candidate.source}</Fact>}
        <Fact label="Added">{formatRelative(candidate.created_at)}</Fact>
      </div>

      {candidate.skills.length > 0 && (
        <div className="border-border border-b p-6">
          <label className="text-ink-secondary mb-2 block text-xs font-semibold">Skills</label>
          <div className="flex flex-wrap gap-1.5">
            {candidate.skills.map((s) => (
              <span
                className="rounded-pill bg-surface-sunken text-ink-secondary px-2 py-0.5 text-xs"
                key={s}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {candidate.notes && (
        <div className="border-border border-b p-6">
          <label className="text-ink-secondary mb-1 block text-xs font-semibold">Notes</label>
          <p className="text-ink text-sm">{candidate.notes}</p>
        </div>
      )}

      {/* Add to vacancy */}
      <div className="border-border border-b p-6">
        <label className="text-ink-secondary mb-1.5 block text-xs font-semibold">
          Add to a vacancy
        </label>
        <div className="flex gap-2">
          <Select onValueChange={setVacancyId} value={vacancyId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Choose an open vacancy" />
            </SelectTrigger>
            <SelectContent>
              {openVacancies.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!vacancyId || createApplication.isPending}
            onClick={() => void addToVacancy()}
            variant="primary"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {/* Application history */}
      <div className="p-6">
        <h3 className="text-ink-secondary mb-3 text-xs font-semibold tracking-wide uppercase">
          Applications
        </h3>
        <ul className="space-y-2">
          {(applications ?? []).map((app) => (
            <li key={app.id}>
              <button
                className="rounded-control border-border hover:border-border-strong flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors"
                onClick={() =>
                  void navigate(`/recruitment/${app.vacancy_id}?application=${app.id}`)
                }
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-medium">
                    {app.vacancy_title ?? 'Unknown vacancy'}
                  </p>
                  <p className="text-ink-secondary mt-0.5 text-xs">{stageMeta(app.stage).label}</p>
                </div>
                <ChevronRight className="text-ink-muted h-4 w-4 shrink-0" />
              </button>
            </li>
          ))}
          {(applications ?? []).length === 0 && (
            <li className="text-ink-muted text-sm">No applications yet.</li>
          )}
        </ul>
      </div>

      {/* Timeline: website registrations (with their notes), and any
          differences between a form and this person's record. */}
      {(timeline ?? []).length > 0 && (
        <div className="border-border border-t p-6">
          <h3 className="text-ink-secondary mb-3 text-xs font-semibold tracking-wide uppercase">
            Activity
          </h3>
          <ol className="space-y-3">
            {(timeline ?? []).map((a) => (
              <li className="flex gap-3" key={a.id}>
                <span className="bg-border-strong mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                <div className="min-w-0">
                  <p className="text-ink text-sm whitespace-pre-line">{a.body}</p>
                  <p className="text-ink-muted text-xs">{formatDateTime(a.occurred_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <DangerZone>
        <Button onClick={() => setEraseOpen(true)} size="sm" variant="secondary">
          <UserX className="text-danger mr-1 h-3.5 w-3.5" />
          Erase this person
        </Button>
      </DangerZone>
      <ErasePersonDialog
        contactId={candidate.contact_id}
        onErased={onClose}
        onOpenChange={setEraseOpen}
        open={eraseOpen}
      />
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
      className="rounded-control border-border bg-surface text-ink hover:bg-surface-sunken inline-flex items-center gap-1.5 border px-3 py-1.5 text-sm transition-colors"
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
      <p className="text-ink-muted text-xs">{label}</p>
      <div className="text-ink mt-0.5">{children}</div>
    </div>
  );
}

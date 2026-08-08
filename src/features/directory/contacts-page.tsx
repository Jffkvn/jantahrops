import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search, UserPlus, Building2 } from 'lucide-react';
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
import { formatPhoneDisplay } from '@/lib/phone';
import { formatRelative } from '@/lib/format';
import { useContactsList } from './use-directory';
import { ContactDetailSheet } from './contact-detail-sheet';
import { CreateContactSheet } from './create-contact-sheet';
import type { ContactWithMeta } from './directory-api';
import type { ContactRole } from '@/types/database';

const ROLE_LABELS: Record<ContactRole, string> = {
  lead: 'Lead',
  candidate: 'Candidate',
  student: 'Student',
  client_contact: 'Client',
  partner: 'Partner',
};

const ROLE_TONE: Record<ContactRole, string> = {
  lead: 'bg-info-soft text-info',
  candidate: 'bg-primary-soft text-primary',
  student: 'bg-warning-soft text-warning',
  client_contact: 'bg-success-soft text-success',
  partner: 'bg-surface-sunken text-ink-secondary',
};

const PAGE_SIZE = 25;

export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState<ContactRole | 'all'>('all');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: ?contact=<id> opens a profile (used by ⌘K and other modules).
  useEffect(() => {
    const p = searchParams.get('contact');
    if (p) {
      setOpenId(p);
      searchParams.delete('contact');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(
    () => ({ search: debounced, role, page, pageSize: PAGE_SIZE }),
    [debounced, role, page],
  );
  const { data, isLoading } = useContactsList(params);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)} variant="primary">
            <UserPlus className="mr-1.5 h-4 w-4" />
            New contact
          </Button>
        }
        description="Every person the business knows — leads, candidates, clients and partners."
        title="Contacts"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or phone…"
            value={search}
          />
        </div>

        <Select
          onValueChange={(v) => {
            setRole(v as ContactRole | 'all');
            setPage(0);
          }}
          value={role}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {(Object.keys(ROLE_LABELS) as ContactRole[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && total > 0 && (
        <p className="mb-2 text-xs text-ink-muted">
          <span className="num font-medium text-ink-secondary">{total.toLocaleString()}</span>{' '}
          {total === 1 ? 'contact' : 'contacts'}
          {debounced || role !== 'all' ? ' matching' : ''}
          {pageCount > 1 && (
            <>
              {' · page '}
              <span className="num">{page + 1}</span> of <span className="num">{pageCount}</span>
            </>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton className="h-16 w-full rounded-card" key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-12 text-center text-sm text-ink-secondary">
          {debounced || role !== 'all'
            ? 'No contacts match your filters.'
            : 'No contacts yet. Add one, or they will arrive from the website and CV imports.'}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {rows.map((c) => (
              <ContactRow contact={c} key={c.id} onOpen={() => setOpenId(c.id)} />
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
              <span className="num">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  size="sm"
                  variant="secondary"
                >
                  Previous
                </Button>
                <Button
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                  size="sm"
                  variant="secondary"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ContactDetailSheet contactId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
      <CreateContactSheet onOpenChange={setCreateOpen} open={createOpen} />
    </div>
  );
}

function ContactRow({ contact, onOpen }: { contact: ContactWithMeta; onOpen: () => void }) {
  return (
    <li className="group px-4 py-3 transition-colors hover:bg-surface-sunken/40">
      <button className="flex w-full items-center gap-3 text-left" onClick={onOpen} type="button">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary"
        >
          {initials(contact.full_name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-ink">{contact.full_name}</p>
            {contact.roles.map((r) => (
              <span className={`rounded-pill px-2 py-0.5 text-[11px] ${ROLE_TONE[r]}`} key={r}>
                {ROLE_LABELS[r]}
              </span>
            ))}
          </div>

          {(contact.job_title || contact.organisation) && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-secondary">
              {contact.job_title}
              {contact.job_title && contact.organisation && ' · '}
              {contact.organisation && (
                <>
                  <Building2 className="h-3 w-3 shrink-0" />
                  {contact.organisation.name}
                </>
              )}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
            {contact.email && <span className="truncate">{contact.email}</span>}
            {contact.phone_e164 && <span>{formatPhoneDisplay(contact.phone_e164)}</span>}
          </div>
        </div>

        <span className="hidden shrink-0 text-xs text-ink-muted sm:block">
          {formatRelative(contact.created_at)}
        </span>
      </button>
    </li>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (a + b).toUpperCase() || '?';
}

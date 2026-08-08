import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, Building2, Plus, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusChip } from '@/components/status-chip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useOrganisationsList, useCreateOrganisation } from './use-directory';
import type { OrganisationWithMeta } from './directory-api';

const PAGE_SIZE = 25;

export function OrganisationsPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [clientsOnly, setClientsOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(
    () => ({ search: debounced, clientsOnly, page, pageSize: PAGE_SIZE }),
    [debounced, clientsOnly, page],
  );
  const { data, isLoading } = useOrganisationsList(params);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader
        actions={
          <Button onClick={() => setCreateOpen(true)} variant="primary">
            <Plus className="mr-1.5 h-4 w-4" />
            New organisation
          </Button>
        }
        description="Client companies, prospects and partners."
        title="Organisations"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organisations…"
            value={search}
          />
        </div>
        <div className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5">
          <Switch
            checked={clientsOnly}
            onCheckedChange={(v) => {
              setClientsOnly(v);
              setPage(0);
            }}
          />
          <span className="text-sm text-ink-secondary">Clients only</span>
        </div>
      </div>

      {!isLoading && total > 0 && (
        <p className="mb-2 text-xs text-ink-muted">
          <span className="num font-medium text-ink-secondary">{total.toLocaleString()}</span>{' '}
          {total === 1 ? 'organisation' : 'organisations'}
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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton className="h-14 w-full rounded-card" key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-12 text-center text-sm text-ink-secondary">
          {debounced || clientsOnly
            ? 'No organisations match your filters.'
            : 'No organisations yet. They are created automatically when a lead or invoice names a company.'}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {rows.map((o) => (
              <OrgRow key={o.id} org={o} />
            ))}
          </ul>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
              <span className="num">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)} size="sm" variant="secondary">
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

      <CreateOrganisationSheet onOpenChange={setCreateOpen} open={createOpen} />
    </div>
  );
}

function OrgRow({ org }: { org: OrganisationWithMeta }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-ink-muted"
      >
        <Building2 className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-ink">{org.name}</p>
          {org.is_client && <StatusChip variant="success">Client</StatusChip>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
          {org.industry && <span>{org.industry}</span>}
          {org.district && <span>{org.district}</span>}
          {org.tin && <span className="num">TIN {org.tin}</span>}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
        <Users className="h-3.5 w-3.5" />
        <span className="num">{org.contactCount}</span>
      </span>
    </li>
  );
}

const orgSchema = z.object({
  name: z.string().min(1, 'A name is required.'),
  industry: z.string(),
  tin: z.string(),
  district: z.string(),
  is_client: z.boolean(),
});
type OrgValues = z.infer<typeof orgSchema>;

function CreateOrganisationSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateOrganisation();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: '', industry: '', tin: '', district: '', is_client: false },
  });

  const isClient = watch('is_client');

  const onSubmit = async (v: OrgValues) => {
    await create.mutateAsync({
      name: v.name,
      industry: v.industry || null,
      tin: v.tin || null,
      district: v.district || null,
      is_client: v.is_client,
    });
    toast.success('Organisation created');
    reset();
    onOpenChange(false);
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>New organisation</SheetTitle>
          <SheetDescription>
            A company you work with, hire for, or invoice. The TIN prints on their invoices.
          </SheetDescription>
        </SheetHeader>

        <form className="mt-6 space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          <div className="space-y-1.5">
            <Label>
              Name<span className="text-danger"> *</span>
            </Label>
            <Input placeholder="Kampala Manufacturing Ltd" {...register('name')} />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input placeholder="Manufacturing" {...register('industry')} />
            </div>
            <div className="space-y-1.5">
              <Label>District</Label>
              <Input placeholder="Kampala" {...register('district')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>TIN</Label>
            <Input placeholder="1000123456" {...register('tin')} />
          </div>

          <div className="flex items-center gap-2 rounded-control border border-border px-3 py-2">
            <Switch checked={isClient} onCheckedChange={(v) => setValue('is_client', v)} />
            <span className="text-sm text-ink-secondary">This is a paying client</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

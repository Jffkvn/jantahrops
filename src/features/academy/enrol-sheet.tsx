import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSupabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useOrganisations } from '@/features/finance/use-finance';
import { useEnrol } from './use-academy';

const NONE = '__none__';

/**
 * Enrol an existing CONTACT. Deliberately no "create a new person" form here:
 * every student is someone already on the spine, added through Contacts, so a
 * delegate who was previously a lead or a candidate stays one record. Creating
 * people from three different screens is how duplicate humans appear.
 */
function useContactSearch(term: string) {
  return useQuery({
    queryKey: ['academy', 'contact-search', term],
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const like = `%${term.trim()}%`;
      const { data, error } = await getSupabase()
        .from('contacts')
        .select('id, full_name, email, organisation_id')
        .or(`full_name.ilike.${like},email.ilike.${like}`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function EnrolSheet({
  cohortId,
  open,
  onOpenChange,
}: {
  cohortId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const enrolMutation = useEnrol();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [contactId, setContactId] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [organisationId, setOrganisationId] = useState(NONE);
  const [error, setError] = useState<string | null>(null);

  const { data: contacts, isFetching } = useContactSearch(debounced);
  const { data: orgs } = useOrganisations(orgSearch);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setDebounced('');
      setContactId('');
      setOrgSearch('');
      setOrganisationId(NONE);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!contactId) {
      setError('Pick the person you are enrolling.');
      return;
    }
    setError(null);
    try {
      await enrolMutation.mutateAsync({
        cohort_id: cohortId,
        contact_id: contactId,
        organisation_id: organisationId === NONE ? null : organisationId,
      });
      toast.success('Enrolled');
      onOpenChange(false);
    } catch (e) {
      // unique (cohort_id, contact_id) — the constraint that stops a double
      // booking becoming a double invoice.
      const dup = e && typeof e === 'object' && 'code' in e && e.code === '23505';
      setError(
        dup
          ? 'That person is already on this cohort.'
          : 'Could not enrol them. Please try again.',
      );
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Enrol someone</SheetTitle>
          <SheetDescription>
            Pick an existing contact. They gain the <strong>student</strong> role and stay one
            person across leads, candidates and training.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {error && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="e-search">
              Person<span className="text-danger"> *</span>
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input
                className="pl-9"
                id="e-search"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email…"
                value={search}
              />
            </div>

            {debounced.trim().length >= 2 && (
              <div className="mt-1.5 max-h-56 overflow-y-auto rounded-control border border-border">
                {isFetching ? (
                  <p className="px-3 py-2 text-xs text-ink-muted">Searching…</p>
                ) : (contacts?.length ?? 0) === 0 ? (
                  <p className="px-3 py-2 text-xs text-ink-muted">
                    Nobody matches. Add them under Contacts first — that keeps one record per
                    person.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {(contacts ?? []).map((c) => (
                      <li key={c.id}>
                        <button
                          className={`flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-surface-sunken/60 ${
                            contactId === c.id ? 'bg-primary-soft' : ''
                          }`}
                          onClick={() => {
                            setContactId(c.id);
                            // Default the payer to their own organisation; still
                            // editable, because the bill often goes elsewhere.
                            if (c.organisation_id) setOrganisationId(c.organisation_id);
                          }}
                          type="button"
                        >
                          <span className="text-sm text-ink">{c.full_name}</span>
                          {c.email && <span className="text-xs text-ink-muted">{c.email}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Who is paying</Label>
            <Input
              className="mb-1.5"
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder="Search organisations…"
              value={orgSearch}
            />
            <Select onValueChange={setOrganisationId} value={organisationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>The student themselves</SelectItem>
                {(orgs ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-muted">
              Who the invoice goes to. Often a company sending delegates rather than the
              student's own employer.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!contactId || enrolMutation.isPending}
              onClick={() => void submit()}
              type="button"
              variant="primary"
            >
              {enrolMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enrol
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

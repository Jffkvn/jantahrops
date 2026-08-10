import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseUGX, formatUGX } from '@/lib/format';
import { useAuth } from '@/features/auth/auth-provider';
import { useTeam } from '@/features/team/use-team';
import { useOrganisations, useContactsForOrganisation } from '@/features/finance/use-finance';
import { useCreateProject } from './use-projects';
import { PROJECT_TYPES, STAGE_LABELS } from './project-meta';
import type { ProjectStage } from '@/types/database';

const NONE = '__none__';

export function CreateProjectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile } = useAuth();
  const { data: team } = useTeam();
  const createProject = useCreateProject();

  const [name, setName] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [organisationId, setOrganisationId] = useState('');
  const [contactId, setContactId] = useState(NONE);
  const [projectType, setProjectType] = useState<string>(NONE);
  const [stage, setStage] = useState<ProjectStage>('planned');
  const [ownerId, setOwnerId] = useState(NONE);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: orgOptions } = useOrganisations(orgSearch);
  const { data: contactOptions } = useContactsForOrganisation(organisationId || null);

  // Default the owner to whoever is creating it — the common case, and it means
  // the "Mine" filter is useful without anyone thinking about ownership.
  useEffect(() => {
    if (open && profile?.id) setOwnerId(profile.id);
  }, [open, profile?.id]);

  const reset = () => {
    setName('');
    setOrgSearch('');
    setOrganisationId('');
    setContactId(NONE);
    setProjectType(NONE);
    setStage('planned');
    setStartDate('');
    setEndDate('');
    setValue('');
    setDescription('');
    setError(null);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError('Give the project a name.');
      return;
    }
    if (!organisationId) {
      setError('A project belongs to a client organisation.');
      return;
    }
    const parsed = value.trim() ? parseUGX(value) : 0n;
    if (parsed === null) {
      setError('Enter the contracted value as a plain number, e.g. 12,000,000.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('The end date is before the start date.');
      return;
    }
    setError(null);

    try {
      await createProject.mutateAsync({
        name,
        organisation_id: organisationId,
        contact_id: contactId === NONE ? null : contactId,
        project_type: projectType === NONE ? null : projectType,
        owner_id: ownerId === NONE ? null : ownerId,
        stage,
        start_date: startDate || null,
        end_date: endDate || null,
        contracted_value_ugx: Number(parsed),
        description: description.trim() || null,
      });
      toast.success('Project created');
      reset();
      onOpenChange(false);
    } catch {
      setError('Could not create the project. Please try again.');
    }
  };

  const preview = value.trim() ? parseUGX(value) : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>New project</SheetTitle>
          <SheetDescription>
            An engagement you have been contracted to deliver. Milestones, time and invoices
            all hang off it.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {error && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="p-name">
              Name<span className="text-danger"> *</span>
            </Label>
            <Input
              id="p-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Payroll setup — Q3"
              value={name}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Client<span className="text-danger"> *</span>
            </Label>
            <Input
              className="mb-1.5"
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder="Search organisations…"
              value={orgSearch}
            />
            <Select
              onValueChange={(v) => {
                setOrganisationId(v);
                setContactId(NONE);
              }}
              value={organisationId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick an organisation" />
              </SelectTrigger>
              <SelectContent>
                {(orgOptions ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Contact there</Label>
            <Select disabled={!organisationId} onValueChange={setContactId} value={contactId}>
              <SelectTrigger>
                <SelectValue placeholder={organisationId ? 'Optional' : 'Pick a client first'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No specific contact</SelectItem>
                {(contactOptions ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select onValueChange={setProjectType} value={projectType}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unspecified</SelectItem>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select onValueChange={(v) => setStage(v as ProjectStage)} value={stage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STAGE_LABELS) as ProjectStage[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-value">Contracted value</Label>
            <Input
              className="num"
              id="p-value"
              inputMode="numeric"
              onChange={(e) => setValue(e.target.value)}
              placeholder="12,000,000"
              value={value}
            />
            <p className="text-xs text-ink-muted">
              {preview !== null && preview > 0n
                ? formatUGX(preview)
                : 'Whole shillings. Drives the estimated profit.'}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-start">Starts</Label>
              <Input
                id="p-start"
                onChange={(e) => setStartDate(e.target.value)}
                type="date"
                value={startDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-end">Ends</Label>
              <Input
                id="p-end"
                onChange={(e) => setEndDate(e.target.value)}
                type="date"
                value={endDate}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Owner</Label>
            <Select onValueChange={setOwnerId} value={ownerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {(team ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Scope</Label>
            <Textarea
              id="p-desc"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What you agreed to deliver."
              rows={3}
              value={description}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={createProject.isPending}
              onClick={() => void submit()}
              type="button"
              variant="primary"
            >
              {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create project
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

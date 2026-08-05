import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
import { Switch } from '@/components/ui/switch';
import { dateInputToISO, parseUGX, toDateInputValue } from '@/lib/format';
import { listOrganisations } from '@/features/finance/finance-api';
import { useCreateVacancy, useUpdateVacancy, usePublishVacancy, useCloseVacancy } from './use-recruitment';
import { EMPLOYMENT_TYPE_LABELS, VACANCY_STATUS_LABELS } from './recruitment-meta';
import type { EmploymentType, VacancyStatus } from '@/types/database';

const schema = z.object({
  title: z.string().min(1, 'A title is required.'),
  organisationId: z.string(),
  summary: z.string(),
  description: z.string(),
  requirements: z.string(),
  location: z.string(),
  employmentType: z.string(),
  salaryMin: z.string(),
  salaryMax: z.string(),
  closesDate: z.string(),
  public: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export interface VacancyEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the sheet edits this vacancy instead of creating a new one. */
  vacancy?: {
    id: string;
    title: string;
    organisationId: string | null;
    summary: string | null;
    description: string | null;
    requirements: string | null;
    location: string | null;
    employmentType: EmploymentType | null;
    salaryMinUgx: number | null;
    salaryMaxUgx: number | null;
    closesAt: string | null;
    isPublic: boolean;
    status: VacancyStatus;
  } | null;
}

function defaultValues(v: VacancyEditorProps['vacancy']): FormValues {
  return {
    title: v?.title ?? '',
    organisationId: v?.organisationId ?? '',
    summary: v?.summary ?? '',
    description: v?.description ?? '',
    requirements: v?.requirements ?? '',
    location: v?.location ?? '',
    employmentType: v?.employmentType ?? '',
    salaryMin: v?.salaryMinUgx != null ? v.salaryMinUgx.toString() : '',
    salaryMax: v?.salaryMaxUgx != null ? v.salaryMaxUgx.toString() : '',
    closesDate: toDateInputValue(v?.closesAt ?? null),
    public: v?.isPublic ?? false,
  };
}

export function VacancyEditorSheet({
  open,
  onOpenChange,
  vacancy,
}: VacancyEditorProps) {
  const createVacancy = useCreateVacancy();
  const updateVacancy = useUpdateVacancy(vacancy?.id ?? '');
  const publish = usePublishVacancy(vacancy?.id ?? '');
  const close = useCloseVacancy(vacancy?.id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(vacancy),
  });

  useEffect(() => {
    if (open) {
      reset(defaultValues(vacancy));
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vacancy]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const payload = {
        title: values.title,
        organisationId: values.organisationId || null,
        summary: values.summary || null,
        description: values.description || null,
        requirements: values.requirements || null,
        location: values.location || null,
        employmentType: (values.employmentType as EmploymentType) || null,
        salaryMinUgx: values.salaryMin && parseUGX(values.salaryMin) != null ? Number(parseUGX(values.salaryMin)) : null,
        salaryMaxUgx: values.salaryMax && parseUGX(values.salaryMax) != null ? Number(parseUGX(values.salaryMax)) : null,
        closesAt: values.closesDate ? dateInputToISO(values.closesDate) : null,
      };
      if (vacancy) {
        await updateVacancy.mutateAsync(payload);
        // Toggling visibility separately from core fields.
        if (vacancy.isPublic !== values.public) {
          if (values.public) await publish.mutateAsync();
          else await close.mutateAsync();
        }
        toast.success('Vacancy updated');
      } else {
        await createVacancy.mutateAsync(payload);
        toast.success('Vacancy created');
      }
      onOpenChange(false);
    } catch (e) {
      setServerError(
        e && typeof e === 'object' && 'code' in e && e.code === '23505'
          ? 'A vacancy with this name already exists.'
          : 'Could not save the vacancy. Please try again.',
      );
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{vacancy ? 'Edit vacancy' : 'New vacancy'}</SheetTitle>
          <SheetDescription>
            The public job board mirrors these details through the auto-generated slug.
          </SheetDescription>
        </SheetHeader>

        <form className="mt-6 space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          {serverError && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          )}

          <Field error={errors.title?.message} label="Title" required>
            <Input placeholder="Senior React Engineer" {...register('title')} />
          </Field>

          <OrganisationField
            onSelect={(id) => setValue('organisationId', id, { shouldValidate: true })}
            value={watch('organisationId')}
          />

          <Field label="Summary">
            <Textarea
              className="min-h-0"
              placeholder="One or two sentences candidates see first."
              rows={2}
              {...register('summary')}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Employment type">
              <Select
                onValueChange={(v) => setValue('employmentType', v)}
                value={watch('employmentType')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {EMPLOYMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Location">
              <Input placeholder="Kampala" {...register('location')} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Salary from (UGX)">
              <Input inputMode="numeric" placeholder="2,000,000" {...register('salaryMin')} />
            </Field>
            <Field label="Salary to (UGX)">
              <Input inputMode="numeric" placeholder="5,000,000" {...register('salaryMax')} />
            </Field>
          </div>

          <Field label="Closing date">
            <Input type="date" {...register('closesDate')} />
          </Field>

          <Field label="Description">
            <Textarea
              className="min-h-0"
              placeholder="Full description for the job board."
              rows={4}
              {...register('description')}
            />
          </Field>

          <Field label="Requirements">
            <Textarea
              className="min-h-0"
              placeholder="One requirement per line."
              rows={3}
              {...register('requirements')}
            />
          </Field>

          <div className="flex items-center justify-between rounded-control border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-ink">Public job board</p>
              <p className="text-xs text-ink-secondary">
                {vacancy ? `Status: ${VACANCY_STATUS_LABELS[vacancy.status]}` : 'Keeps the vacancy private until you publish.'}
              </p>
            </div>
            <Switch
              checked={watch('public')}
              onCheckedChange={(v) => setValue('public', v)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {vacancy ? 'Save changes' : 'Create vacancy'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function OrganisationField({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const { data: organisations } = useQuery({
    queryKey: ['org-search', debounced],
    queryFn: () => listOrganisations(debounced, 8),
    enabled: debounced.length >= 2 || debounced === '',
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const selected = useMemo(
    () => (organisations ?? []).find((o) => o.id === value),
    [organisations, value],
  );

  return (
    <Field label="Client organisation">
      {selected ? (
        <div className="flex items-center justify-between rounded-control border border-border px-3 py-2">
          <span className="text-sm text-ink">{selected.name}</span>
          <button
            className="text-xs text-ink-muted underline hover:text-ink"
            onClick={() => onSelect('')}
            type="button"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <Input
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organisations…"
            value={search}
          />
          {(organisations ?? []).length > 0 && (
            <ul className="mt-1 max-h-40 divide-y divide-border overflow-y-auto rounded-control border border-border">
              {(organisations ?? []).map((o) => (
                <li key={o.id}>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-sunken"
                    onClick={() => onSelect(o.id)}
                    type="button"
                  >
                    {o.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {debounced && (organisations ?? []).length === 0 && (
            <p className="text-xs text-ink-muted">No organisations found. You can leave this blank.</p>
          )}
        </>
      )}
    </Field>
  );
}
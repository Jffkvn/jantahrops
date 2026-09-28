import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
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
import type { EmploymentType, VacancyStatus, ScreeningQuestionRow, ScreeningQuestionType } from '@/types/database';

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
    screeningQuestions?: ScreeningQuestionRow[] | null;
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
  const [questions, setQuestions] = useState<ScreeningQuestionRow[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<ScreeningQuestionType>('number');
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [newQuestionOptions, setNewQuestionOptions] = useState('');
  const [showAddQuestion, setShowAddQuestion] = useState(false);

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
      setQuestions(vacancy?.screeningQuestions ?? []);
      setServerError(null);
      setShowAddQuestion(false);
      setNewQuestionText('');
      setNewQuestionOptions('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vacancy]);

  const handleAddQuestion = () => {
    const prompt = newQuestionText.trim();
    if (!prompt) return;

    const newQ: ScreeningQuestionRow = {
      id: `sq_${Date.now()}`,
      question: prompt,
      type: newQuestionType,
      required: newQuestionRequired,
      ...(newQuestionType === 'select'
        ? {
            options: newQuestionOptions
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {}),
    };

    setQuestions((prev) => [...prev, newQ]);
    setNewQuestionText('');
    setNewQuestionOptions('');
    setShowAddQuestion(false);
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

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
        screeningQuestions: questions,
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

          {/* Screening Questions Builder */}
          <div className="space-y-3 rounded-control border border-border p-3.5 bg-surface-sunken/40">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-ink">Screening questions</Label>
                <p className="text-xs text-ink-secondary">
                  Custom role requirements candidates must answer when applying on the website.
                </p>
              </div>
              {!showAddQuestion && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddQuestion(true)}
                  className="inline-flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add question
                </Button>
              )}
            </div>

            {questions.length > 0 && (
              <div className="space-y-2 pt-1">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="flex items-start justify-between gap-3 rounded-control border border-border bg-surface p-2.5 text-xs shadow-soft"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-ink">Q{idx + 1}.</span>
                        <span className="text-ink">{q.question}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
                        <span className="rounded bg-surface-sunken px-1.5 py-0.5 uppercase tracking-wide font-medium">
                          {q.type}
                        </span>
                        <span>{q.required ? 'Required' : 'Optional'}</span>
                        {q.options && q.options.length > 0 && (
                          <span>Options: {q.options.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(q.id)}
                      className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
                      title="Remove question"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showAddQuestion && (
              <div className="mt-2 space-y-3 rounded-control border border-primary/20 bg-surface p-3">
                <Label className="text-xs font-semibold text-ink">New screening question</Label>
                <Input
                  placeholder="e.g. How many years of commercial payroll experience do you have?"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  className="text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-ink-muted">Answer type</Label>
                    <Select
                      value={newQuestionType}
                      onValueChange={(v) => setNewQuestionType(v as ScreeningQuestionType)}
                    >
                      <SelectTrigger className="mt-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="number">Numeric (e.g. Years)</SelectItem>
                        <SelectItem value="text">Short text</SelectItem>
                        <SelectItem value="boolean">Yes / No</SelectItem>
                        <SelectItem value="select">Dropdown list</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between pt-5 px-1">
                    <span className="text-xs text-ink font-medium">Mandatory?</span>
                    <Switch
                      checked={newQuestionRequired}
                      onCheckedChange={setNewQuestionRequired}
                    />
                  </div>
                </div>

                {newQuestionType === 'select' && (
                  <div>
                    <Label className="text-[11px] text-ink-muted">Options (comma-separated)</Label>
                    <Input
                      placeholder="e.g. QuickBooks, SAP, Tally, Sage"
                      value={newQuestionOptions}
                      onChange={(e) => setNewQuestionOptions(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddQuestion(false);
                      setNewQuestionText('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!newQuestionText.trim()}
                    onClick={handleAddQuestion}
                  >
                    Add to vacancy
                  </Button>
                </div>
              </div>
            )}
          </div>

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
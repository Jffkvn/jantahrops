import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getSupabase } from '@/lib/supabase';
import { normalizeUgandanPhone } from '@/lib/phone';
import { useQueryClient } from '@tanstack/react-query';
import {
  createApplication,
  evaluateApplicationWithAi,
  uploadCandidateCvFile,
} from './recruitment-api';
import { assignableVacancies, formatAssignableVacancyLabel } from './recruitment-meta';
import { useVacanciesList } from './use-recruitment';

const NO_VACANCY_VALUE = 'none';

const schema = z
  .object({
    fullName: z.string().min(1, 'A name is required.'),
    email: z.string().email('Enter a valid email.').or(z.literal('')),
    phone: z.string(),
    headline: z.string(),
    skills: z.string(),
    notes: z.string(),
    vacancyId: z.string(),
    source: z.enum(['email', 'manual']),
  })
  .refine((v) => !v.phone || normalizeUgandanPhone(v.phone) !== null, {
    message: 'Enter a valid Ugandan phone number.',
    path: ['phone'],
  });

type FormValues = z.infer<typeof schema>;

/** Manually record a candidate (e.g. email applications) and optionally add them to any vacancy, including closed roles. */
export function CreateCandidateSheet({
  open,
  onOpenChange,
  defaultVacancyId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultVacancyId?: string | null;
}) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: vacanciesData,
    isLoading: vacanciesLoading,
    isError: vacanciesError,
  } = useVacanciesList({ status: 'all', pageSize: 100 });

  const vacancies = useMemo(
    () => assignableVacancies(vacanciesData?.rows ?? []),
    [vacanciesData],
  );

  const initialVacancyId = defaultVacancyId?.trim() || NO_VACANCY_VALUE;

  const {
    register,
    control,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      headline: '',
      skills: '',
      notes: '',
      vacancyId: initialVacancyId,
      source: 'email',
    },
  });

  const selectedVacancyId = watch('vacancyId');
  const hasSelectedVacancy = Boolean(selectedVacancyId && selectedVacancyId !== NO_VACANCY_VALUE);

  useEffect(() => {
    if (open) {
      reset({
        fullName: '',
        email: '',
        phone: '',
        headline: '',
        skills: '',
        notes: '',
        vacancyId: defaultVacancyId?.trim() || NO_VACANCY_VALUE,
        source: 'email',
      });
      setCvFile(null);
      setServerError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, defaultVacancyId, reset]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const supabase = getSupabase();
      const email = values.email.trim().toLowerCase() || null;
      const phone = values.phone ? normalizeUgandanPhone(values.phone) : null;
      const targetVacancyId =
        values.vacancyId && values.vacancyId !== NO_VACANCY_VALUE ? values.vacancyId : null;

      let cvFileId: string | null = null;
      if (cvFile) {
        cvFileId = await uploadCandidateCvFile(cvFile);
      }

      let contactId: string | null = null;
      if (email) {
        const { data } = await supabase.from('contacts').select('id').ilike('email', email).maybeSingle();
        contactId = data?.id ?? null;
      }
      if (!contactId && phone) {
        const { data } = await supabase.from('contacts').select('id').eq('phone_e164', phone).maybeSingle();
        contactId = data?.id ?? null;
      }
      if (!contactId) {
        const { data, error } = await supabase
          .from('contacts')
          .insert({ full_name: values.fullName.trim(), email, phone_e164: phone })
          .select('id')
          .single();
        if (error) throw error;
        contactId = data.id;
      }
      await supabase.from('contact_roles').upsert({ contact_id: contactId, role: 'candidate' });

      const skills = values.skills
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const { data: existingCandidate } = await supabase
        .from('candidates')
        .select('id')
        .eq('contact_id', contactId)
        .maybeSingle();

      let candidateId: string;
      if (existingCandidate) {
        if (!targetVacancyId) {
          setServerError('A candidate with this contact already exists.');
          return;
        }
        candidateId = existingCandidate.id;
        if (cvFileId) {
          await supabase.from('candidates').update({ cv_file_id: cvFileId }).eq('id', candidateId);
        }
      } else {
        const { data: createdCandidate, error } = await supabase
          .from('candidates')
          .insert({
            contact_id: contactId,
            headline: values.headline.trim() || null,
            skills,
            notes: values.notes.trim() || null,
            is_available: true,
            cv_file_id: cvFileId,
            source: targetVacancyId ? values.source : 'manual',
          })
          .select('id')
          .single();
        if (error) throw error;
        candidateId = createdCandidate.id;
      }

      if (targetVacancyId) {
        const createdApp = await createApplication(targetVacancyId, candidateId, {
          source: values.source,
          notes: values.notes.trim() || null,
        });
        await qc.invalidateQueries({ queryKey: ['recruitment'] });
        if (createdApp === null) {
          toast.info('Candidate is already on this vacancy');
        } else {
          toast.success('Candidate added to vacancy');
          void evaluateApplicationWithAi(createdApp.id)
            .then(() => qc.invalidateQueries({ queryKey: ['recruitment'] }))
            .catch(() => {});
        }
      } else {
        await qc.invalidateQueries({ queryKey: ['recruitment'] });
        toast.success('Candidate added to the talent pool');
      }

      onOpenChange(false);
    } catch (e) {
      setServerError(
        e && typeof e === 'object' && 'code' in e && e.code === '23505'
          ? 'A candidate with this contact already exists.'
          : e instanceof Error && e.message
            ? e.message
            : 'Could not add the candidate. Please try again.',
      );
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>Add candidate</SheetTitle>
          <SheetDescription>
            Record an applicant (for example, someone who applied by email) and optionally assign them to any vacancy, including closed roles.
          </SheetDescription>
        </SheetHeader>

        <form className="mt-6 space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          {serverError && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Vacancy (optional)">
              <Controller
                control={control}
                name="vacancyId"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger aria-label="Vacancy">
                      <SelectValue placeholder="Talent pool only" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_VACANCY_VALUE}>Talent pool only (no vacancy)</SelectItem>
                      {vacanciesLoading ? (
                        <div className="px-2 py-2 text-center text-xs text-ink-muted">
                          Loading vacancies…
                        </div>
                      ) : vacanciesError ? (
                        <div className="px-2 py-2 text-center text-xs text-danger">
                          Could not load vacancies.
                        </div>
                      ) : (
                        vacancies.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {formatAssignableVacancyLabel(v)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {hasSelectedVacancy && (
              <Field label="Application source">
                <Controller
                  control={control}
                  name="source"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger aria-label="Application source">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Applied by email</SelectItem>
                        <SelectItem value="manual">Manual / referral</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            )}
          </div>

          <Field error={errors.fullName?.message} label="Full name" required>
            <Input placeholder="Sarah Nakato" {...register('fullName')} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field error={errors.email?.message} label="Email">
              <Input placeholder="sarah@acme.ug" type="email" {...register('email')} />
            </Field>
            <Field error={errors.phone?.message} label="Phone">
              <Input placeholder="0772 123 456" {...register('phone')} />
            </Field>
          </div>

          <Field label="Headline">
            <Input placeholder="HR Assistant / Administrative Officer" {...register('headline')} />
          </Field>

          <Field label="CV attachment (PDF or Word, max 10 MB)">
            <div className="flex flex-wrap items-center gap-2">
              <input
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                id="create-candidate-cv-input"
                onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                ref={fileInputRef}
                type="file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                {cvFile ? 'Replace CV' : 'Attach CV'}
              </Button>
              {cvFile ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-border bg-surface-sunken px-2.5 py-1 text-xs text-ink">
                  <span className="truncate">{cvFile.name}</span>
                  <button
                    aria-label="Remove attached CV"
                    className="text-ink-muted hover:text-ink"
                    onClick={() => {
                      setCvFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <span className="text-xs text-ink-muted">Optional</span>
              )}
            </div>
          </Field>

          <Field label="Skills">
            <Textarea
              className="min-h-0"
              placeholder="Microsoft Excel, HR Records, Payroll Support"
              rows={2}
              {...register('skills')}
            />
          </Field>

          <Field label="Notes / Email summary">
            <Textarea
              className="min-h-0"
              placeholder="E.g. Applied via email with CV on 25 Nov."
              rows={3}
              {...register('notes')}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {hasSelectedVacancy ? 'Add to vacancy' : 'Add candidate'}
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
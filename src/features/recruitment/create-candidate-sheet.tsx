import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Paperclip, Sparkles, Upload, X } from 'lucide-react';
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
import { formatPhoneDisplay, normalizeUgandanPhone } from '@/lib/phone';
import { useQueryClient } from '@tanstack/react-query';
import {
  createApplication,
  evaluateApplicationWithAi,
  extractCvProfile,
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
  const [uploadedCvFileId, setUploadedCvFileId] = useState<string | null>(null);
  const [isParsingCv, setIsParsingCv] = useState(false);
  const [cvParseStatus, setCvParseStatus] = useState<{
    tone: 'success' | 'warning';
    message: string;
  } | null>(null);
  const [extractedMeta, setExtractedMeta] = useState<{
    location: string | null;
    yearsExperience: number | null;
  }>({ location: null, yearsExperience: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseRequestIdRef = useRef(0);

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
    getValues,
    setValue,
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
      parseRequestIdRef.current += 1;
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
      setUploadedCvFileId(null);
      setIsParsingCv(false);
      setCvParseStatus(null);
      setExtractedMeta({ location: null, yearsExperience: null });
      setServerError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, defaultVacancyId, reset]);

  const handleCvSelected = async (file: File | null) => {
    parseRequestIdRef.current += 1;
    const reqId = parseRequestIdRef.current;

    setCvFile(file);
    setUploadedCvFileId(null);
    setCvParseStatus(null);
    setExtractedMeta({ location: null, yearsExperience: null });
    setServerError(null);

    if (!file) {
      setIsParsingCv(false);
      return;
    }

    setIsParsingCv(true);
    try {
      const fileId = await uploadCandidateCvFile(file);
      if (parseRequestIdRef.current !== reqId) return;
      setUploadedCvFileId(fileId);

      try {
        const profile = await extractCvProfile(fileId);
        if (parseRequestIdRef.current !== reqId) return;

        if (profile.readability === 'unreadable') {
          setCvParseStatus({
            tone: 'warning',
            message:
              profile.readability_note ||
              'CV attached, but could not be read automatically. Please fill in the details below.',
          });
          return;
        }

        const current = getValues();
        let filledCount = 0;

        if (!current.fullName.trim() && profile.full_name) {
          setValue('fullName', profile.full_name, { shouldDirty: true, shouldValidate: true });
          filledCount += 1;
        }
        if (!current.email.trim() && profile.email) {
          setValue('email', profile.email, { shouldDirty: true, shouldValidate: true });
          filledCount += 1;
        }
        if (!current.phone.trim() && profile.phone) {
          const normalized = normalizeUgandanPhone(profile.phone);
          if (normalized) {
            setValue('phone', formatPhoneDisplay(normalized), {
              shouldDirty: true,
              shouldValidate: true,
            });
            filledCount += 1;
          }
        }
        if (!current.headline.trim() && profile.headline) {
          setValue('headline', profile.headline, { shouldDirty: true });
          filledCount += 1;
        }
        if (!current.skills.trim() && profile.skills.length > 0) {
          setValue('skills', profile.skills.join(', '), { shouldDirty: true });
          filledCount += 1;
        }

        setExtractedMeta({
          location: profile.location,
          yearsExperience: profile.years_experience,
        });

        setCvParseStatus(
          filledCount > 0
            ? {
                tone: 'success',
                message: `Auto-filled ${filledCount} field${filledCount === 1 ? '' : 's'} from CV — review before saving.`,
              }
            : {
                tone: 'success',
                message: 'CV attached and read. Your existing entries were kept.',
              },
        );
      } catch {
        if (parseRequestIdRef.current !== reqId) return;
        setCvParseStatus({
          tone: 'warning',
          message: 'CV attached, but auto-fill could not read it right now. You can fill in the fields below.',
        });
      }
    } catch (e) {
      if (parseRequestIdRef.current !== reqId) return;
      setCvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setServerError(e instanceof Error && e.message ? e.message : 'Could not upload the CV file.');
    } finally {
      if (parseRequestIdRef.current === reqId) {
        setIsParsingCv(false);
      }
    }
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const supabase = getSupabase();
      const email = values.email.trim().toLowerCase() || null;
      const phone = values.phone ? normalizeUgandanPhone(values.phone) : null;
      const targetVacancyId =
        values.vacancyId && values.vacancyId !== NO_VACANCY_VALUE ? values.vacancyId : null;

      let cvFileId = uploadedCvFileId;
      if (!cvFileId && cvFile) {
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
          .insert({
            full_name: values.fullName.trim(),
            email,
            phone_e164: phone,
            ...(extractedMeta.location ? { location: extractedMeta.location } : {}),
          })
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
            ...(extractedMeta.yearsExperience != null
              ? { years_experience: extractedMeta.yearsExperience }
              : {}),
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

          <Field label="CV attachment — attach first to auto-fill (PDF or Word, max 10 MB)">
            <div
              className="rounded-control border border-dashed border-border-strong bg-surface-sunken/40 p-3 transition-colors"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files?.[0] ?? null;
                if (dropped) void handleCvSelected(dropped);
              }}
            >
              <input
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                id="create-candidate-cv-input"
                onChange={(e) => void handleCvSelected(e.target.files?.[0] ?? null)}
                ref={fileInputRef}
                type="file"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={isParsingCv}
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {isParsingCv ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin text-primary" />
                  ) : cvFile ? (
                    <Paperclip className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Upload className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  )}
                  {isParsingCv ? 'Reading CV…' : cvFile ? 'Replace CV' : 'Attach CV & auto-fill'}
                </Button>
                {cvFile ? (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-border bg-surface px-2.5 py-1 text-xs text-ink">
                    <span className="truncate">{cvFile.name}</span>
                    <button
                      aria-label="Remove attached CV"
                      className="text-ink-muted hover:text-ink"
                      disabled={isParsingCv}
                      onClick={() => {
                        void handleCvSelected(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Drop a CV here to fill name, email, phone, headline &amp; skills automatically
                  </span>
                )}
              </div>
              {cvParseStatus && (
                <p
                  className={
                    cvParseStatus.tone === 'success'
                      ? 'mt-2 flex items-center gap-1.5 text-xs text-success'
                      : 'mt-2 text-xs text-warning'
                  }
                >
                  {cvParseStatus.tone === 'success' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  {cvParseStatus.message}
                </p>
              )}
            </div>
          </Field>

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
            <Button disabled={isSubmitting || isParsingCv} type="submit" variant="primary">
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
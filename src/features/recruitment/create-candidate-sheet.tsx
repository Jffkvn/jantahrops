import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { getSupabase } from '@/lib/supabase';
import { normalizeUgandanPhone } from '@/lib/phone';
import { useQueryClient } from '@tanstack/react-query';

const schema = z
  .object({
    fullName: z.string().min(1, 'A name is required.'),
    email: z.string().email('Enter a valid email.').or(z.literal('')),
    phone: z.string(),
    headline: z.string(),
    skills: z.string(),
    notes: z.string(),
  })
  .refine((v) => !v.phone || normalizeUgandanPhone(v.phone) !== null, {
    message: 'Enter a valid Ugandan phone number.',
    path: ['phone'],
  });

type FormValues = z.infer<typeof schema>;

/** Manually record a candidate (bypassing the public self-serve form). */
export function CreateCandidateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', phone: '', headline: '', skills: '', notes: '' },
  });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const supabase = getSupabase();
      const email = values.email.trim().toLowerCase() || null;
      const phone = values.phone ? normalizeUgandanPhone(values.phone) : null;

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

      const { error } = await supabase.from('candidates').insert({
        contact_id: contactId,
        headline: values.headline.trim() || null,
        skills,
        notes: values.notes.trim() || null,
        is_available: true,
      });
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ['recruitment', 'candidates'] });
      toast.success('Candidate added to the talent pool');
      onOpenChange(false);
    } catch (e) {
      setServerError(
        e && typeof e === 'object' && 'code' in e && e.code === '23505'
          ? 'A candidate with this contact already exists.'
          : 'Could not add the candidate. Please try again.',
      );
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Add candidate</SheetTitle>
          <SheetDescription>
            Record someone you already have in mind. A contact is created or matched automatically.
          </SheetDescription>
        </SheetHeader>

        <form className="mt-6 space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          {serverError && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          )}

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
            <Input placeholder="Senior React Engineer" {...register('headline')} />
          </Field>

          <Field label="Skills">
            <Textarea
              className="min-h-0"
              placeholder="React, TypeScript, Tailwind"
              rows={2}
              {...register('skills')}
            />
          </Field>

          <Field label="Notes">
            <Textarea
              className="min-h-0"
              placeholder="Anything to remember."
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
              Add candidate
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
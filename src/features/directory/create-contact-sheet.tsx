import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { normalizeUgandanPhone } from '@/lib/phone';
import { useCreateContact } from './use-directory';

const schema = z
  .object({
    full_name: z.string().min(1, 'A name is required.'),
    email: z.string().email('Enter a valid email.').or(z.literal('')),
    phone: z.string(),
    job_title: z.string(),
  })
  .refine((v) => !v.phone || normalizeUgandanPhone(v.phone) !== null, {
    message: 'Enter a valid Ugandan phone number.',
    path: ['phone'],
  })
  .refine((v) => v.email !== '' || v.phone !== '', {
    message: 'Give an email or a phone — one is needed to avoid duplicates.',
    path: ['email'],
  });

type FormValues = z.infer<typeof schema>;

export function CreateContactSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createContact = useCreateContact();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', phone: '', job_title: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await createContact.mutateAsync({
        full_name: values.full_name,
        email: values.email || null,
        phone: values.phone || null,
        job_title: values.job_title || null,
      });
      toast.success('Contact created');
      reset();
      onOpenChange(false);
    } catch (e) {
      // The unique indexes on email/phone are what keep the spine clean.
      const dup = e && typeof e === 'object' && 'code' in e && e.code === '23505';
      setServerError(
        dup
          ? 'Someone with that email or phone already exists — search for them instead.'
          : 'Could not create the contact. Please try again.',
      );
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>New contact</SheetTitle>
          <SheetDescription>
            One record per person. Roles (lead, candidate, client) attach as they happen.
          </SheetDescription>
        </SheetHeader>

        <form className="mt-6 space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          {serverError && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          )}

          <Field error={errors.full_name?.message} label="Full name" required>
            <Input placeholder="Sarah Nakato" {...register('full_name')} />
          </Field>

          <Field error={errors.email?.message} label="Email">
            <Input placeholder="sarah@example.ug" type="email" {...register('email')} />
          </Field>

          <Field error={errors.phone?.message} label="Phone">
            <Input placeholder="0772 123 456" {...register('phone')} />
          </Field>

          <Field label="Job title">
            <Input placeholder="HR Manager" {...register('job_title')} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create contact
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

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { normalizeUgandanPhone } from '@/lib/phone';
import { parseUGX } from '@/lib/format';
import { useAuth } from '@/features/auth/auth-provider';
import { useCreateLead, useTeam } from './use-leads';

const schema = z
  .object({
    contactName: z.string().min(1, 'A contact name is required.'),
    contactEmail: z.string().email('Enter a valid email.').or(z.literal('')),
    contactPhone: z.string(),
    organisationName: z.string(),
    serviceInterest: z.string(),
    value: z.string(),
    ownerId: z.string(),
    source: z.string(),
  })
  .refine((v) => !v.contactPhone || normalizeUgandanPhone(v.contactPhone) !== null, {
    message: 'Enter a valid Ugandan phone number.',
    path: ['contactPhone'],
  })
  .refine((v) => !v.value || parseUGX(v.value) !== null, {
    message: 'Enter a whole amount, e.g. 4,500,000.',
    path: ['value'],
  });

type FormValues = z.infer<typeof schema>;

export function CreateLeadSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: team } = useTeam();
  const createLead = useCreateLead();
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
    defaultValues: {
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      organisationName: '',
      serviceInterest: '',
      value: '',
      ownerId: user?.id ?? '',
      source: 'Manual entry',
    },
  });

  const ownerId = watch('ownerId');

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await createLead.mutateAsync({
        contactName: values.contactName,
        contactEmail: values.contactEmail || undefined,
        contactPhone: values.contactPhone || undefined,
        organisationName: values.organisationName || undefined,
        serviceInterest: values.serviceInterest || undefined,
        valueUgx: values.value ? Number(parseUGX(values.value)) : 0,
        ownerId: values.ownerId || null,
        source: values.source || undefined,
      });
      toast.success('Lead created');
      reset();
      onOpenChange(false);
    } catch (e) {
      // A duplicate email/phone surfaces here as a unique-violation.
      const message =
        e && typeof e === 'object' && 'code' in e && e.code === '23505'
          ? 'A contact with that email or phone already exists. Open them from Contacts instead.'
          : 'Could not create the lead. Please try again.';
      setServerError(message);
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>New lead</SheetTitle>
          <SheetDescription>
            Captures the person, their company, and the opportunity. The contact is created or
            matched automatically.
          </SheetDescription>
        </SheetHeader>

        <form className="mt-6 space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          {serverError && (
            <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {serverError}
            </div>
          )}

          <Field error={errors.contactName?.message} label="Contact name" required>
            <Input placeholder="Sarah Nakato" {...register('contactName')} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field error={errors.contactEmail?.message} label="Email">
              <Input placeholder="sarah@acme.ug" type="email" {...register('contactEmail')} />
            </Field>
            <Field error={errors.contactPhone?.message} label="Phone">
              <Input placeholder="0772 123 456" {...register('contactPhone')} />
            </Field>
          </div>

          <Field label="Organisation">
            <Input placeholder="Acme Uganda Ltd" {...register('organisationName')} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Service interest">
              <Input placeholder="AI training" {...register('serviceInterest')} />
            </Field>
            <Field error={errors.value?.message} label="Value (UGX)">
              <Input inputMode="numeric" placeholder="4,500,000" {...register('value')} />
            </Field>
          </div>

          <Field label="Owner">
            <Select onValueChange={(v) => setValue('ownerId', v)} value={ownerId}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {(team ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Source">
            <Textarea className="min-h-0" placeholder="Where did this lead come from?" rows={2} {...register('source')} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit" variant="primary">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create lead
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

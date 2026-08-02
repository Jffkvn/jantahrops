import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Upload } from 'lucide-react';
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
import { Money } from '@/components/money';
import { parseUGX } from '@/lib/format';
import { whtSuggestionUgx } from '@/lib/money';
import { useRecordPayment } from './use-finance';
import { uploadFinanceFile } from './finance-files';
import type { PaymentMethod } from '@/types/database';

const schema = z
  .object({
    received: z.string().min(1, 'Enter the amount received.'),
    withheld: z.string(),
    method: z.string().min(1, 'Pick a payment method.'),
    reference: z.string(),
    receivedAt: z.string(),
    notes: z.string(),
  })
  .refine((v) => parseUGX(v.received) !== null, {
    message: 'Enter a whole amount, e.g. 4,500,000.',
    path: ['received'],
  })
  .refine((v) => !v.withheld || parseUGX(v.withheld) !== null, {
    message: 'Enter a whole amount.',
    path: ['withheld'],
  });

type FormValues = z.infer<typeof schema>;

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
];

export function RecordPaymentSheet({
  open,
  onOpenChange,
  documentId,
  totalUgx,
  balanceUgx,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  /** The full document total, used to suggest the WHT figure. */
  totalUgx: bigint;
  /** Remaining balance on the invoice. */
  balanceUgx: bigint;
}) {
  const recordPayment = useRecordPayment();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
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
      received: '',
      withheld: '',
      method: '',
      reference: '',
      receivedAt: '',
      notes: '',
    },
  });

  // Prefill a suggested WHT value each time the sheet opens.
  useEffect(() => {
    if (open) {
      const suggestion = whtSuggestionUgx(totalUgx);
      if (suggestion > 0n) setValue('withheld', suggestion.toString());
    }
  }, [open, totalUgx, setValue]);

  const receivedStr = watch('received');
  const withheldStr = watch('withheld');
  const received = parseUGX(receivedStr) ?? 0n;
  const withheld = parseUGX(withheldStr) ?? 0n;
  const totalPayment = received + withheld;
  const settles = totalPayment >= balanceUgx;

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setUploading(true);
    try {
      let proofFileId: string | null = null;
      if (proofFile) {
        const { fileId } = await uploadFinanceFile(proofFile);
        proofFileId = fileId;
      }
      await recordPayment.mutateAsync({
        document_id: documentId,
        amount_received_ugx: parseUGX(values.received)!,
        wht_withheld_ugx: parseUGX(values.withheld) ?? 0n,
        method: values.method as PaymentMethod,
        reference: values.reference || null,
        received_at: values.receivedAt ? new Date(values.receivedAt).toISOString() : null,
        proof_file_id: proofFileId,
        notes: values.notes || null,
      });
      toast.success(settles ? 'Invoice settled — receipt generated' : 'Payment recorded');
      reset();
      setProofFile(null);
      onOpenChange(false);
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
          ? e.message
          : 'Could not record the payment. Please try again.';
      setServerError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>Record payment</SheetTitle>
          <SheetDescription>
            Money that actually arrived (plus any WHT the client withheld — it is remitted to URA,
            not banked).
          </SheetDescription>
        </SheetHeader>

        <div className="rounded-control border-border bg-surface-sunken mt-4 border px-3 py-2 text-sm">
          Remaining balance: <Money value={balanceUgx} />
        </div>

        {settles && (
          <div className="rounded-control border-success/30 bg-success-soft text-success-ink mt-3 border px-3 py-2 text-sm">
            This settles the invoice — a receipt will be generated.
          </div>
        )}

        <form
          className="mt-6 space-y-4"
          noValidate
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        >
          {serverError && (
            <div className="rounded-control border-danger/30 bg-danger-soft text-danger border px-3 py-2 text-sm">
              {serverError}
            </div>
          )}

          <Field error={errors.received?.message} label="Amount received (UGX)" required>
            <Input inputMode="numeric" placeholder="4,500,000" {...register('received')} />
          </Field>

          <Field
            error={errors.withheld?.message}
            hint={`Suggested 6% WHT: ${whtSuggestionUgx(totalUgx) > 0n ? whtSuggestionUgx(totalUgx).toString() : '0'}. Edit if the client withheld a different amount.`}
            label="Amount withheld (UGX)"
          >
            <Input inputMode="numeric" placeholder="0" {...register('withheld')} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field error={errors.method?.message} label="Method" required>
              <Select onValueChange={(v) => setValue('method', v)} value={watch('method')}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Received date">
              <Input type="date" {...register('receivedAt')} />
            </Field>
          </div>

          <Field label="Reference">
            <Input placeholder="Transaction ID / slip no." {...register('reference')} />
          </Field>

          <Field label="Proof">
            <label className="rounded-control border-border text-ink-secondary hover:bg-surface-sunken flex cursor-pointer items-center justify-center gap-2 border border-dashed px-3 py-4 text-sm">
              <Upload className="h-4 w-4" />
              {proofFile ? proofFile.name : 'Upload proof (PDF / image, max 10MB)'}
              <input
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
          </Field>

          <Field label="Notes">
            <Input placeholder="Optional note" {...register('notes')} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSubmitting || uploading} type="submit" variant="primary">
              {(isSubmitting || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record payment
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
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
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
      {hint && !error && <p className="text-ink-muted text-xs">{hint}</p>}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}

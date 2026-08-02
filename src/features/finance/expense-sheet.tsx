import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Trash2, Upload } from 'lucide-react';
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
import { parseUGX } from '@/lib/format';
import { useAuth } from '@/features/auth/auth-provider';
import {
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useExpense,
  useOrganisations,
} from './use-finance';
import { uploadFinanceFile } from './finance-files';
import { EXPENSE_CATEGORIES } from './document-meta';
import type { ExpenseCategory } from '@/types/database';

const schema = z
  .object({
    category: z.string().min(1, 'Pick a category.'),
    amount: z.string().min(1, 'Enter the amount.'),
    incurredOn: z.string().min(1, 'Enter the date.'),
    vendor: z.string(),
    description: z.string(),
    organisationId: z.string(),
  })
  .refine((v) => parseUGX(v.amount) !== null, {
    message: 'Enter a whole amount, e.g. 500,000.',
    path: ['amount'],
  });

type FormValues = z.infer<typeof schema>;

export function ExpenseSheet({
  open,
  onOpenChange,
  editingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the sheet edits this expense instead of creating one. */
  editingId?: string | null;
}) {
  const { isAdmin } = useAuth();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense(editingId ?? '');
  const deleteExpense = useDeleteExpense(editingId ?? '');
  const { data: existing } = useExpense(editingId ?? '');
  const { data: orgOptions } = useOrganisations('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
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
      category: '',
      amount: '',
      incurredOn: '',
      vendor: '',
      description: '',
      organisationId: '',
    },
  });

  const editing = Boolean(editingId);

  useEffect(() => {
    if (open && editing && existing) {
      setValue('category', existing.category);
      setValue('amount', String(existing.amount_ugx));
      setValue('incurredOn', existing.incurred_on);
      setValue('vendor', existing.vendor ?? '');
      setValue('description', existing.description ?? '');
      setValue('organisationId', existing.organisation_id ?? '');
    } else if (open && !editing) {
      reset();
      setValue('incurredOn', todayInputValue());
    }
  }, [open, editing, existing, setValue, reset]);

  const category = watch('category');

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    setUploading(true);
    try {
      let receiptFileId: string | null = null;
      if (receiptFile) {
        const { fileId } = await uploadFinanceFile(receiptFile);
        receiptFileId = fileId;
      }
      const base = {
        category: values.category as ExpenseCategory,
        amount_ugx: parseUGX(values.amount)!,
        incurred_on: values.incurredOn,
        vendor: values.vendor || null,
        description: values.description || null,
        organisation_id: values.organisationId || null,
        receipt_file_id: receiptFileId,
      };
      if (editing) {
        await updateExpense.mutateAsync(base);
        toast.success('Expense updated');
      } else {
        await createExpense.mutateAsync(base);
        toast.success('Expense recorded');
      }
      reset();
      setReceiptFile(null);
      onOpenChange(false);
    } catch (e) {
      setServerError(
        e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
          ? e.message
          : 'Could not save the expense. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || !isAdmin) return;
    try {
      await deleteExpense.mutateAsync();
      toast.success('Expense deleted');
      onOpenChange(false);
    } catch (e) {
      setServerError(
        e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
          ? e.message
          : 'Could not delete the expense.',
      );
    }
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{editing ? 'Edit expense' : 'Add expense'}</SheetTitle>
          <SheetDescription>
            Record money that went out, optionally linked to a client and with a receipt.
          </SheetDescription>
        </SheetHeader>

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

          <Field error={errors.category?.message} label="Category" required>
            <Select onValueChange={(v) => setValue('category', v)} value={category}>
              <SelectTrigger>
                <SelectValue placeholder="Pick category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field error={errors.amount?.message} label="Amount (UGX)" required>
              <Input inputMode="numeric" placeholder="500,000" {...register('amount')} />
            </Field>
            <Field error={errors.incurredOn?.message} label="Date" required>
              <Input type="date" {...register('incurredOn')} />
            </Field>
          </div>

          <Field label="Vendor">
            <Input placeholder="Who was paid" {...register('vendor')} />
          </Field>

          <Field label="Description">
            <Input placeholder="What it was for" {...register('description')} />
          </Field>

          <Field label="Organisation (optional)">
            <Select
              onValueChange={(v) => setValue('organisationId', v)}
              value={watch('organisationId')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link a client" />
              </SelectTrigger>
              <SelectContent>
                {(orgOptions ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Receipt">
            <label className="rounded-control border-border text-ink-secondary hover:bg-surface-sunken flex cursor-pointer items-center justify-center gap-2 border border-dashed px-3 py-4 text-sm">
              <Upload className="h-4 w-4" />
              {receiptFile ? receiptFile.name : 'Upload receipt (PDF / image, max 10MB)'}
              <input
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
          </Field>

          <div className="flex items-center justify-between gap-2 pt-2">
            {editing && isAdmin ? (
              <Button onClick={() => void handleDelete()} type="button" variant="ghost">
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={isSubmitting || uploading} type="submit" variant="primary">
                {(isSubmitting || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Add expense'}
              </Button>
            </div>
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
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}

function todayInputValue(): string {
  const offset = 3 * 60;
  const kampala = new Date(Date.now() + new Date().getTimezoneOffset() * 60_000 + offset * 60_000);
  return kampala.toISOString().slice(0, 10);
}

import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, Mail, UserPlus } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { UserRole } from '@/types/database';
import type { CreateTeamMemberResult } from './settings-api';
import { useCreateTeamMember } from './use-settings';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  staff: 'Staff',
  intern: 'Intern',
};

const ROLE_HINTS: Record<UserRole, string> = {
  staff: 'Full day-to-day access. Cannot change company settings.',
  intern: 'Same access as staff today — the label is for your own records.',
  admin: 'Can change company details, manage team users and delete records.',
};

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter their full name.').max(120, 'Name is too long.'),
  email: z.string().trim().email('Enter a valid email address.'),
  role: z.enum(['admin', 'staff', 'intern']),
  password: z
    .string()
    .trim()
    .refine((v) => v.length === 0 || v.length >= 8, {
      message: 'Password must be at least 8 characters (or leave blank to auto-generate).',
    }),
  sendWelcomeEmail: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function CreateTeamMemberSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createMember = useCreateTeamMember();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [createdResult, setCreatedResult] = useState<CreateTeamMemberResult | null>(null);

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
      role: 'staff',
      password: '',
      sendWelcomeEmail: true,
    },
  });

  const selectedRole = watch('role');

  useEffect(() => {
    if (open) {
      reset({
        fullName: '',
        email: '',
        role: 'staff',
        password: '',
        sendWelcomeEmail: true,
      });
      setServerError(null);
      setShowPassword(false);
      setCreatedResult(null);
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const result = await createMember.mutateAsync({
        fullName: values.fullName.trim(),
        email: values.email.trim().toLowerCase(),
        role: values.role,
        password: values.password.trim() || undefined,
        sendWelcomeEmail: values.sendWelcomeEmail,
      });
      setCreatedResult(result);
      toast.success(`Account created for ${result.user.full_name || result.user.email}`);
    } catch (e) {
      setServerError(
        e instanceof Error && e.message ? e.message : 'Could not create the user account.',
      );
    }
  };

  const copyCredentials = async () => {
    if (!createdResult) return;
    const text = [
      `JantaHR Ops Login Details`,
      `Sign-in URL: ${createdResult.loginUrl}`,
      `Email: ${createdResult.user.email}`,
      `Temporary password: ${createdResult.temporaryPassword}`,
      `Role: ${ROLE_LABELS[createdResult.user.role]}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Login details copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const resetForAnother = () => {
    reset({
      fullName: '',
      email: '',
      role: 'staff',
      password: '',
      sendWelcomeEmail: true,
    });
    setServerError(null);
    setShowPassword(false);
    setCreatedResult(null);
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" side="right">
        <SheetHeader>
          <SheetTitle>Add team user</SheetTitle>
          <SheetDescription>
            Create a JantaHR Ops account for a colleague or client reviewer so they can sign in right away.
          </SheetDescription>
        </SheetHeader>

        {createdResult ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-card border border-success/30 bg-success-soft p-4">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <p className="text-sm font-semibold text-ink">
                    Account created for {createdResult.user.full_name || createdResult.user.email}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-secondary">
                    {createdResult.emailSent
                      ? `Welcome email sent to ${createdResult.user.email}. You can also share the login details below directly.`
                      : 'Share the login details below with them so they can sign in.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-card border border-border bg-surface-sunken/40 p-4 text-sm">
              <div>
                <p className="text-xs font-medium text-ink-muted">Sign-in URL</p>
                <p className="mt-0.5 break-all font-mono text-xs text-ink">{createdResult.loginUrl}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink-muted">Email</p>
                <p className="mt-0.5 font-medium text-ink">{createdResult.user.email}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink-muted">Role</p>
                <p className="mt-0.5 text-ink">{ROLE_LABELS[createdResult.user.role]}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-ink-muted">Temporary password</p>
                <p className="mt-0.5 rounded-control border border-border bg-surface px-2.5 py-1.5 font-mono text-sm font-semibold text-ink">
                  {createdResult.temporaryPassword}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button onClick={() => void copyCredentials()} type="button" variant="secondary">
                <Copy className="mr-1.5 h-4 w-4" />
                Copy login details
              </Button>
              <div className="flex gap-2">
                <Button onClick={resetForAnother} type="button" variant="ghost">
                  Add another user
                </Button>
                <Button onClick={() => onOpenChange(false)} type="button" variant="primary">
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <form className="mt-6 space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
            {serverError && (
              <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                {serverError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="create-user-full-name">
                Full name <span className="text-danger">*</span>
              </Label>
              <Input
                id="create-user-full-name"
                placeholder="Dora Nakato"
                {...register('fullName')}
              />
              {errors.fullName?.message && (
                <p className="text-xs text-danger">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-user-email">
                Email <span className="text-danger">*</span>
              </Label>
              <Input
                id="create-user-email"
                placeholder="dora@company.com"
                type="email"
                {...register('email')}
              />
              {errors.email?.message && (
                <p className="text-xs text-danger">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger aria-label="Role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['staff', 'intern', 'admin'] as UserRole[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-ink-muted">{ROLE_HINTS[selectedRole]}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-user-password">Password (optional)</Label>
              <div className="relative">
                <Input
                  className="pr-10"
                  id="create-user-password"
                  placeholder="Leave blank to auto-generate"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password?.message ? (
                <p className="text-xs text-danger">{errors.password.message}</p>
              ) : (
                <p className="text-xs text-ink-muted">
                  Minimum 8 characters if set manually. Otherwise a secure temporary password is generated.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface-sunken/30 px-3.5 py-2.5">
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-ink">Send welcome email with login details</p>
                  <p className="text-xs text-ink-muted">
                    Emails their sign-in link and temporary password automatically.
                  </p>
                </div>
              </div>
              <Controller
                control={control}
                name="sendWelcomeEmail"
                render={({ field }) => (
                  <Switch
                    aria-label="Send welcome email with login details"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={isSubmitting || createMember.isPending} type="submit" variant="primary">
                {(isSubmitting || createMember.isPending) ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-1.5 h-4 w-4" />
                )}
                Create user
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

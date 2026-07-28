import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useAuth } from './auth-provider';
import { AuthShell, FormError, FormNotice } from './auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z
  .object({
    password: z.string().min(10, 'Use at least 10 characters.'),
    confirm: z.string().min(1, 'Re-enter the password.'),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'The two passwords do not match.',
    path: ['confirm'],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const { updatePassword, user, loading } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await updatePassword(values.password);
    if (result.ok) {
      void navigate('/', { replace: true });
      return;
    }
    setFormError(result.message);
  };

  // Arriving here without a recovery session means the link was stale or
  // already used. Say so plainly rather than showing a form that cannot work.
  if (!loading && !user) {
    return (
      <AuthShell subtitle="This link is no longer valid" title="Reset your password">
        <FormNotice message="Password reset links expire after a short time. Request a new one from the sign-in page." />
        <Button className="w-full" onClick={() => void navigate('/forgot-password')} variant="secondary">
          Request a new link
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Choose a new password" title="Set a new password">
      {formError && <FormError message={formError} />}

      <form className="space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            autoComplete="new-password"
            autoFocus
            id="password"
            type="password"
            {...register('password')}
            aria-invalid={errors.password ? true : undefined}
          />
          {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            autoComplete="new-password"
            id="confirm"
            type="password"
            {...register('confirm')}
            aria-invalid={errors.confirm ? true : undefined}
          />
          {errors.confirm && <p className="text-xs text-danger">{errors.confirm.message}</p>}
        </div>

        <Button className="w-full" disabled={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? (
            <>
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
              Saving
            </>
          ) : (
            'Save new password'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

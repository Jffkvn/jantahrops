import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useAuth } from './auth-provider';
import { AuthShell, FormNotice } from './auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address.').email('Enter a valid email address.'),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: FormValues) => {
    await requestPasswordReset(values.email);
    // Always the same outcome, whether or not the address has an account.
    setSent(true);
  };

  return (
    <AuthShell
      footer={
        <Link className="text-primary hover:underline" to="/login">
          Back to sign in
        </Link>
      }
      subtitle="We'll email you a link to set a new one"
      title="Reset your password"
    >
      {sent ? (
        <FormNotice message="If that email address has an account, a reset link is on its way." />
      ) : (
        <form className="space-y-4" noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              autoComplete="email"
              autoFocus
              id="email"
              placeholder="you@jantahr.com"
              type="email"
              {...register('email')}
              aria-invalid={errors.email ? true : undefined}
            />
            {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
          </div>

          <Button className="w-full" disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? (
              <>
                <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              'Send reset link'
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

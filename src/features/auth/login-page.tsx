import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useAuth } from './auth-provider';
import { AuthShell, FormError } from './auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type FormValues = z.infer<typeof schema>;

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const from = (location.state as LocationState | null)?.from ?? '/';

  // Already signed in — do not show the form at all.
  if (!loading && user) return <Navigate replace to={from} />;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await signIn(values.email, values.password);
    if (result.ok) {
      void navigate(from, { replace: true });
      return;
    }
    setFormError(result.message);
  };

  return (
    <AuthShell subtitle="Sign in to continue" title="JantaHR Ops">
      {formError && <FormError message={formError} />}

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

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="current-password"
            id="password"
            type="password"
            {...register('password')}
            aria-invalid={errors.password ? true : undefined}
          />
          {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
        </div>

        <div className="flex justify-end">
          <Link className="text-sm text-primary hover:underline" to="/forgot-password">
            Forgot password?
          </Link>
        </div>

        {/*
          Fixed height and unchanged width in the loading state: a button that
          resizes mid-submit makes the whole card jump.
        */}
        <Button className="w-full" disabled={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? (
            <>
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
              Signing in
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

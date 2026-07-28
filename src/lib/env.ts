import { z } from 'zod';

const appEnvEnum = z.enum(['development', 'staging', 'production']);

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_APP_URL: z.string().url(),
  VITE_APP_ENV: appEnvEnum,
});

export type Env = z.infer<typeof envSchema>;

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Environment is validated once, at module load, and FAILS HARD.
 *
 * Prompt 0.1 deliberately allowed the app to boot with Supabase unset so the
 * scaffold could be verified before a project existed. That allowance is gone:
 * booting without a database produces confusing runtime errors a long way from
 * their cause, which is strictly worse than refusing to start.
 */
function parseEnv(): Readonly<Env> {
  const raw = {
    VITE_SUPABASE_URL: readString(import.meta.env.VITE_SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: readString(import.meta.env.VITE_SUPABASE_ANON_KEY),
    VITE_APP_URL: readString(import.meta.env.VITE_APP_URL, 'http://localhost:5180'),
    VITE_APP_ENV: readString(import.meta.env.VITE_APP_ENV, 'development'),
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        'Copy .env.example to .env.local and fill in the values. The Supabase ' +
        'URL and anon key are on the project API settings page.',
    );
  }

  return Object.freeze(result.data);
}

export const env = parseEnv();

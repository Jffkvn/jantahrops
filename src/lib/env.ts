import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_APP_URL: z.string().url().default('http://localhost:5180'),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
});

function parseEnv() {
  const rawUrl =
    typeof import.meta.env.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL : '';
  const rawKey =
    typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string'
      ? import.meta.env.VITE_SUPABASE_ANON_KEY
      : '';
  const rawAppUrl =
    typeof import.meta.env.VITE_APP_URL === 'string'
      ? import.meta.env.VITE_APP_URL
      : 'http://localhost:5180';
  const rawAppEnv =
    typeof import.meta.env.VITE_APP_ENV === 'string' ? import.meta.env.VITE_APP_ENV : 'development';

  const rawEnv = {
    VITE_SUPABASE_URL: rawUrl,
    VITE_SUPABASE_ANON_KEY: rawKey,
    VITE_APP_URL: rawAppUrl,
    VITE_APP_ENV: rawAppEnv,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const missingKeys = result.error.issues.map((issue) => issue.path.join('.'));
    console.warn(
      `[env.ts] Missing or invalid environment variables: ${missingKeys.join(', ')}. Please set them in .env.local`,
    );

    return Object.freeze({
      VITE_SUPABASE_URL: rawEnv.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: rawEnv.VITE_SUPABASE_ANON_KEY,
      VITE_APP_URL: rawEnv.VITE_APP_URL,
      VITE_APP_ENV: rawEnv.VITE_APP_ENV,
    });
  }

  return Object.freeze(result.data);
}

export const env = parseEnv();
export type Env = typeof env;

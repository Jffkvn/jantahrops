import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from '@/types/database';

export type { Database };

/**
 * The ONLY place createClient is ever called. Import getSupabase() everywhere
 * else — a second client instance means a second session store, and sessions
 * then diverge between parts of the app.
 */
let clientInstance: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  clientInstance ??= createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'jantahr-ops-auth',
    },
  });
  return clientInstance;
}

/** Test seam only — never call this from application code. */
export function __resetSupabaseClientForTests(): void {
  clientInstance = null;
}

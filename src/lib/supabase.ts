import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Placeholder Database type until Prompt 0.5 generates real schema types
export type Database = Record<string, unknown>;

export const isSupabaseConfigured = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);

let clientInstance: SupabaseClient<Database> | null = null;

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local — see .env.example.',
      );
    }
    if (!clientInstance) {
      clientInstance = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    }
    return Reflect.get(clientInstance, prop, receiver) as unknown;
  },
});

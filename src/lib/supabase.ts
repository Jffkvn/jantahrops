import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Placeholder Database type until Prompt 0.5 generates real schema types
export type Database = Record<string, unknown>;

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

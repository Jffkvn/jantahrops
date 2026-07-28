/**
 * Database types for JantaHR Ops.
 *
 * HAND-WRITTEN to match supabase/migrations/20260727182340_profiles.sql,
 * because generating them requires an authenticated Supabase CLI session that
 * this machine does not have.
 *
 * REGENERATE as soon as you have CLI access, and prefer the generated output
 * over this file — hand-maintained schema types drift:
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id qjsgqskigjqrzjftunhg \
 *     > src/types/database.ts
 */

export type UserRole = 'admin' | 'staff' | 'intern';

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  avatar_file_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ProfileInsert = Omit<ProfileRow, 'created_at' | 'updated_at'> & {
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<Omit<ProfileRow, 'id'>>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: Record<never, never>;
  };
}

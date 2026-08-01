/**
 * Database types for JantaHR Ops.
 *
 * HAND-WRITTEN to match the migrations in supabase/migrations/, because
 * `supabase gen types` requires Docker (it runs pg-meta in a container) and
 * this setup uses the hosted database directly, no local stack.
 *
 * When editing: keep this in lockstep with the migration that changes a table.
 * The shape below mirrors what `gen types` would produce, so it can be swapped
 * for generated output later without touching call sites.
 */

// --- enums -----------------------------------------------------------------
export type UserRole = 'admin' | 'staff' | 'intern';
export type ContactRole = 'lead' | 'candidate' | 'student' | 'client_contact' | 'partner';
export type ActivityType =
  | 'note'
  | 'call'
  | 'email'
  | 'whatsapp'
  | 'meeting'
  | 'stage_change'
  | 'document'
  | 'payment'
  | 'system';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'open' | 'done';
export type LeadStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal_sent'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'dormant';

// --- rows ------------------------------------------------------------------
export type ProfileRow = {
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

export type OrganisationRow = {
  id: string;
  name: string;
  industry: string | null;
  tin: string | null;
  country: string;
  district: string | null;
  address: string | null;
  website: string | null;
  is_client: boolean;
  status: string;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone_e164: string | null;
  whatsapp: string | null;
  organisation_id: string | null;
  job_title: string | null;
  location: string | null;
  source: string | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactRoleRow = {
  contact_id: string;
  role: ContactRole;
  since: string;
  meta: Record<string, unknown>;
}

export type ActivityRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  type: ActivityType;
  body: string | null;
  meta: Record<string, unknown>;
  occurred_at: string;
  user_id: string | null;
  created_at: string;
}

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  assignee_id: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  related_type: string | null;
  related_id: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadRow = {
  id: string;
  contact_id: string;
  organisation_id: string | null;
  source: string | null;
  service_interest: string | null;
  stage: LeadStage;
  value_ugx: number; // whole UGX; PostgREST returns bigint as number here (values are well within Number.MAX_SAFE_INTEGER)
  owner_id: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  lost_reason: string | null;
  converted_organisation_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- insert shapes ---------------------------------------------------------
// Insert = the genuinely-required columns (NOT NULL, no default), with every
// other column optional (nullable or server-defaulted). This matches how the
// database actually accepts a row. Written as `Pick<Row, required> &
// Partial<Row>` — plain object shapes, because the Supabase client resolves a
// table to `never` if Row/Insert/Update aren't directly-shaped.
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Row>;

type ProfileInsert = Insertable<ProfileRow, 'id' | 'email'>;
type OrganisationInsert = Insertable<OrganisationRow, 'name'>;
type ContactInsert = Insertable<ContactRow, 'full_name'>;
type ContactRoleInsert = Insertable<ContactRoleRow, 'contact_id' | 'role'>;
type ActivityInsert = Insertable<ActivityRow, 'subject_type' | 'subject_id'>;
type TaskInsert = Insertable<TaskRow, 'title'>;
type LeadInsert = Insertable<LeadRow, 'contact_id'>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: Partial<Omit<ProfileRow, 'id'>>;
        Relationships: [];
      };
      organisations: {
        Row: OrganisationRow;
        Insert: OrganisationInsert;
        Update: Partial<Omit<OrganisationRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      contacts: {
        Row: ContactRow;
        Insert: ContactInsert;
        Update: Partial<Omit<ContactRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      contact_roles: {
        Row: ContactRoleRow;
        Insert: ContactRoleInsert;
        Update: Partial<Omit<ContactRoleRow, 'contact_id'>>;
        Relationships: [];
      };
      activities: {
        Row: ActivityRow;
        Insert: ActivityInsert;
        Update: Partial<Omit<ActivityRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: TaskInsert;
        Update: Partial<Omit<TaskRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      leads: {
        Row: LeadRow;
        Insert: LeadInsert;
        Update: Partial<Omit<LeadRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<never, never>; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      contact_role: ContactRole;
      activity_type: ActivityType;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      lead_stage: LeadStage;
    };
    CompositeTypes: Record<never, never>;
  };
}

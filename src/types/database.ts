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
  'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'negotiation' | 'won' | 'lost' | 'dormant';
export type SignalSeverity = 'info' | 'warn' | 'urgent';
export type SignalStatus = 'open' | 'dismissed' | 'actioned' | 'expired';

export type DocumentType = 'quote' | 'lpo' | 'invoice' | 'receipt';
export type DocumentStatus =
  'draft' | 'issued' | 'accepted' | 'rejected' | 'part_paid' | 'paid' | 'cancelled' | 'expired';
export type PaymentMethod = 'mtn_momo' | 'airtel_money' | 'bank_transfer' | 'cash' | 'cheque';
export type ExpenseCategory =
  | 'Software subscriptions'
  | 'Internet'
  | 'Travel'
  | 'Marketing'
  | 'Printing'
  | 'Training materials'
  | 'Contractor payments'
  | 'Office costs'
  | 'Miscellaneous';

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
};

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
};

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
};

export type ContactRoleRow = {
  contact_id: string;
  role: ContactRole;
  since: string;
  meta: Record<string, unknown>;
};

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
};

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
};

export type LeadRow = {
  id: string;
  contact_id: string;
  organisation_id: string | null;
  source: string | null;
  service_interest: string | null;
  stage: LeadStage;
  value_ugx: number; // whole UGX; PostgREST returns bigint as number here
  owner_id: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  lost_reason: string | null;
  converted_organisation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SignalRow = {
  id: string;
  kind: string;
  severity: SignalSeverity;
  subject_type: string;
  subject_id: string;
  title: string;
  detail: string | null;
  evidence: Record<string, unknown>;
  suggested_action: string | null;
  action_payload: Record<string, unknown>;
  status: SignalStatus;
  generated_at: string;
  dismissed_by: string | null;
  dismissed_at: string | null;
};

export type CompanyProfileRow = {
  id: boolean;
  legal_name: string;
  tin: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  bank_details: string | null;
  momo_details: string | null;
  vat_registered: boolean;
  vat_rate_bp: number;
  wht_rate_bp: number;
  currency: string;
};

export type DocumentRow = {
  id: string;
  type: DocumentType;
  number: string | null;
  organisation_id: string;
  contact_id: string | null;
  related_type: string | null;
  related_id: string | null;
  parent_document_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  valid_until: string | null;
  currency: string;
  subtotal_ugx: number; // whole UGX
  vat_applicable: boolean;
  vat_rate_bp: number;
  vat_amount_ugx: number;
  total_ugx: number;
  status: DocumentStatus;
  notes: string | null;
  terms: string | null;
  efris_fdn: string | null;
  efris_qr_url: string | null;
  efris_status: string;
  pdf_file_id: string | null;
  issued_by: string | null;
  issued_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentLineRow = {
  id: string;
  document_id: string;
  position: number;
  description: string;
  qty: number;
  unit: string | null;
  unit_price_ugx: number; // whole UGX
  line_total_ugx: number; // whole UGX
  tax_treatment: string;
};

export type DocumentSequenceRow = {
  doc_type: DocumentType;
  year: number;
  last_value: number;
};

export type PaymentRow = {
  id: string;
  document_id: string;
  amount_received_ugx: number; // whole UGX
  wht_withheld_ugx: number; // whole UGX
  method: PaymentMethod;
  reference: string | null;
  proof_file_id: string | null;
  received_at: string;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
};

export type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  description: string | null;
  amount_ugx: number;
  incurred_on: string;
  vendor: string | null;
  project_id: string | null;
  organisation_id: string | null;
  receipt_file_id: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceFileRow = {
  id: string;
  bucket: string;
  path: string;
  filename: string;
  mime: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

export type FinanceSummaryResult = {
  receivables_ugx: number;
  overdue_ugx: number;
  revenue_month_ugx: number;
  expenses_month_ugx: number;
  wht_credit_year_ugx: number;
};

export type InvoiceBalanceViewRow = {
  id: string;
  organisation_id: string;
  number: string | null;
  total_ugx: number; // whole UGX
  due_date: string | null;
  status: DocumentStatus;
  balance_ugx: number; // whole UGX
};

export type ExpenseCategorySummaryResult = {
  month_total_ugx: number;
  categories: { category: ExpenseCategory; total_ugx: number }[];
};

// --- insert shapes ---------------------------------------------------------
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Row>;

type ProfileInsert = Insertable<ProfileRow, 'id' | 'email'>;
type OrganisationInsert = Insertable<OrganisationRow, 'name'>;
type ContactInsert = Insertable<ContactRow, 'full_name'>;
type ContactRoleInsert = Insertable<ContactRoleRow, 'contact_id' | 'role'>;
type ActivityInsert = Insertable<ActivityRow, 'subject_type' | 'subject_id'>;
type TaskInsert = Insertable<TaskRow, 'title'>;
type LeadInsert = Insertable<LeadRow, 'contact_id'>;
type SignalInsert = Insertable<SignalRow, 'kind' | 'subject_type' | 'subject_id' | 'title'>;

type CompanyProfileInsert = Insertable<CompanyProfileRow, never>;
type DocumentInsert = Insertable<DocumentRow, 'type' | 'organisation_id'>;
type DocumentLineInsert = Insertable<DocumentLineRow, 'document_id' | 'description'>;
type DocumentSequenceInsert = Insertable<DocumentSequenceRow, 'doc_type' | 'year'>;
type PaymentInsert = Insertable<PaymentRow, 'document_id' | 'method'>;
type ExpenseInsert = Insertable<ExpenseRow, 'category' | 'amount_ugx' | 'incurred_on'>;
type FinanceFileInsert = Insertable<FinanceFileRow, 'path' | 'filename' | 'mime' | 'size_bytes'>;

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
      signals: {
        Row: SignalRow;
        Insert: SignalInsert;
        Update: Partial<Omit<SignalRow, 'id' | 'generated_at'>>;
        Relationships: [];
      };
      company_profile: {
        Row: CompanyProfileRow;
        Insert: CompanyProfileInsert;
        Update: Partial<CompanyProfileRow>;
        Relationships: [];
      };
      documents: {
        Row: DocumentRow;
        Insert: DocumentInsert;
        Update: Partial<Omit<DocumentRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      document_lines: {
        Row: DocumentLineRow;
        Insert: DocumentLineInsert;
        Update: Partial<Omit<DocumentLineRow, 'id'>>;
        Relationships: [];
      };
      document_sequences: {
        Row: DocumentSequenceRow;
        Insert: DocumentSequenceInsert;
        Update: Partial<DocumentSequenceRow>;
        Relationships: [];
      };
      payments: {
        Row: PaymentRow;
        Insert: PaymentInsert;
        Update: Partial<Omit<PaymentRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: ExpenseInsert;
        Update: Partial<Omit<ExpenseRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      finance_files: {
        Row: FinanceFileRow;
        Insert: FinanceFileInsert;
        Update: Partial<Omit<FinanceFileRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: {
      v_invoice_balances: { Row: InvoiceBalanceViewRow; Relationships: [] };
    };
    Functions: {
      is_admin: { Args: Record<never, never>; Returns: boolean };
      generate_signals: { Args: Record<never, never>; Returns: undefined };
      next_document_number: { Args: { p_type: DocumentType }; Returns: string };
      issue_document: { Args: { p_doc_id: string }; Returns: string };
      generate_receipt: { Args: { p_invoice_id: string }; Returns: string | null };
      convert_to_invoice: { Args: { p_source_id: string }; Returns: string };
      finance_summary: { Args: Record<never, never>; Returns: FinanceSummaryResult };
      expenses_category_summary: {
        Args: { p_month: string };
        Returns: ExpenseCategorySummaryResult;
      };
    };
    Enums: {
      user_role: UserRole;
      contact_role: ContactRole;
      activity_type: ActivityType;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      lead_stage: LeadStage;
      document_type: DocumentType;
      document_status: DocumentStatus;
      payment_method: PaymentMethod;
    };
    CompositeTypes: Record<never, never>;
  };
}

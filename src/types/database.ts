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
export type ProjectStage =
  | 'planned'
  | 'active'
  | 'waiting_on_client'
  | 'under_review'
  | 'completed'
  | 'archived';
export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'blocked';
export type DeliveryMode = 'live_online' | 'in_person' | 'self_paced' | 'hybrid';
export type CohortStatus = 'planned' | 'open' | 'running' | 'completed' | 'cancelled';
/** Entitlement is a state, not a checkbox — see the academy migration. */
export type EnrolmentStatus =
  | 'registered'
  | 'invoiced'
  | 'paid'
  | 'active'
  | 'completed'
  | 'dropped';

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
  /** What a day of our time costs us, whole UGX. Null = unset; profit is then unavailable. */
  internal_day_rate_ugx: number | null;
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

export type ProjectRow = {
  id: string;
  organisation_id: string;
  contact_id: string | null;
  name: string;
  project_type: string | null;
  owner_id: string | null;
  stage: ProjectStage;
  start_date: string | null;
  end_date: string | null;
  contracted_value_ugx: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMilestoneRow = {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: MilestoneStatus;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntryRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  work_date: string;
  /** Days, half-day granularity. Never hours — see the projects migration. */
  days: number;
  note: string | null;
  created_at: string;
};

/**
 * Per-project estimated P&L. `labour_cost_ugx` and `estimated_profit_ugx` are
 * null when the internal day rate is unset — that is the honest answer and the
 * UI must render it as "not available", never as zero.
 */
export type ProjectPnlViewRow = {
  project_id: string;
  contracted_value_ugx: number;
  expenses_ugx: number;
  days_logged: number;
  invoiced_ugx: number;
  received_ugx: number;
  labour_cost_ugx: number | null;
  estimated_profit_ugx: number | null;
};

export type CourseRow = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  outline: unknown;
  price_ugx: number;
  corporate_price_ugx: number | null;
  duration_label: string | null;
  /** Drives certificate expiry once slice 2 lands. Null = does not expire. */
  retake_interval_months: number | null;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CohortRow = {
  id: string;
  course_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  delivery_mode: DeliveryMode;
  capacity: number | null;
  location: string | null;
  meeting_url: string | null;
  facilitator_id: string | null;
  status: CohortStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EnrolmentRow = {
  id: string;
  cohort_id: string;
  contact_id: string;
  organisation_id: string | null;
  status: EnrolmentStatus;
  /** Set by a trigger when the linked invoice settles; cleared on reversal. */
  entitled_at: string | null;
  source: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CohortSessionRow = {
  id: string;
  cohort_id: string;
  title: string;
  session_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type AttendanceRow = {
  id: string;
  session_id: string;
  enrolment_id: string;
  is_present: boolean;
  noted_at: string;
  noted_by: string | null;
};

export type CohortSummaryViewRow = {
  cohort_id: string;
  enrolled: number;
  entitled: number;
  unbilled: number;
  /** Null when the cohort is uncapped. */
  seats_left: number | null;
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

/** Ids of contacts who are NOT candidate-only — backs the default Contacts list. */
export type BusinessContactViewRow = {
  id: string;
};

/**
 * Candidates joined to their contact, with everything searchable flattened into
 * one lowercased column. Backs Talent Pool filtering, ordering, counting and
 * paging — all of which must happen in Postgres, not the client.
 */
export type CandidateSearchViewRow = {
  id: string;
  contact_id: string | null;
  owner_id: string | null;
  headline: string | null;
  skills: string[] | null;
  years_experience: number | null;
  availability: AvailabilityStatus | null;
  salary_expectation_ugx: number | null;
  is_available: boolean;
  needs_review: boolean;
  created_at: string;
  full_name: string | null;
  search_text: string;
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

export type VacancyStatus = 'draft' | 'open' | 'paused' | 'closed';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship';
export type ApplicationStage =
  | 'new'
  | 'screened'
  | 'shortlisted'
  | 'interview_scheduled'
  | 'interviewed'
  | 'rejected'
  | 'offered'
  | 'hired'
  | 'talent_pool';
export type AvailabilityStatus = 'immediate' | 'one_month' | 'three_months' | 'not_looking';

export type ScreeningQuestionType = 'text' | 'number' | 'select' | 'boolean';

export interface ScreeningQuestionRow {
  id: string;
  question: string;
  type: ScreeningQuestionType;
  required: boolean;
  options?: string[];
}

export type VacancyRow = {
  id: string;
  organisation_id: string | null; // the client hiring
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  requirements: string | null;
  location: string | null;
  employment_type: EmploymentType | null;
  salary_min_ugx: number | null; // whole UGX
  salary_max_ugx: number | null; // whole UGX
  status: VacancyStatus;
  is_public: boolean;
  screening_questions: ScreeningQuestionRow[];
  published_at: string | null;
  closes_at: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CandidateRow = {
  id: string;
  contact_id: string;
  headline: string | null;
  years_experience: number | null;
  skills: string[];
  education: unknown[];
  work_history: unknown[];
  salary_expectation_ugx: number | null; // whole UGX
  availability: AvailabilityStatus | null;
  cv_file_id: string | null;
  cv_parsed: unknown;
  cv_parsed_at: string | null;
  rating: number | null; // 1..5, internal
  is_available: boolean;
  source: string | null;
  notes: string | null;
  owner_id: string | null;
  // Bulk-import provenance. Null for candidates created in-app or via the
  // public endpoint. needs_review flags an import the tooling was unsure about
  // (usually an unresolved name) — the CV is always attached regardless.
  import_batch: string | null;
  needs_review: boolean;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationRow = {
  id: string;
  vacancy_id: string;
  candidate_id: string;
  source: string | null;
  stage: ApplicationStage;
  screening_answers: Record<string, unknown>;
  applied_at: string;
  owner_id: string | null;
  notes: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type InterviewRow = {
  id: string;
  application_id: string;
  scheduled_at: string | null;
  mode: string | null;
  panel: string[];
  feedback: string | null;
  rating: number | null; // 1..5
  outcome: string | null; // 'pass'|'fail'|'hold'
  created_at: string;
};

export type CandidateFileRow = {
  id: string;
  bucket: string;
  path: string;
  filename: string;
  mime: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
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
type ProjectInsert = Insertable<ProjectRow, 'organisation_id' | 'name'>;
type ProjectMilestoneInsert = Insertable<ProjectMilestoneRow, 'project_id' | 'title'>;
type TimeEntryInsert = Insertable<TimeEntryRow, 'project_id' | 'work_date' | 'days'>;
type CourseInsert = Insertable<CourseRow, 'title' | 'slug'>;
type CohortInsert = Insertable<CohortRow, 'course_id' | 'name'>;
type EnrolmentInsert = Insertable<EnrolmentRow, 'cohort_id' | 'contact_id'>;
type CohortSessionInsert = Insertable<CohortSessionRow, 'cohort_id' | 'title'>;
type AttendanceInsert = Insertable<AttendanceRow, 'session_id' | 'enrolment_id'>;
type FinanceFileInsert = Insertable<FinanceFileRow, 'path' | 'filename' | 'mime' | 'size_bytes'>;
type VacancyInsert = Insertable<VacancyRow, 'title' | 'slug'>;
type CandidateInsert = Insertable<CandidateRow, 'contact_id'>;
type ApplicationInsert = Insertable<ApplicationRow, 'vacancy_id' | 'candidate_id'>;
type InterviewInsert = Insertable<InterviewRow, 'application_id'>;
type CandidateFileInsert = Insertable<CandidateFileRow, 'path' | 'filename' | 'mime' | 'size_bytes'>;

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
      projects: {
        Row: ProjectRow;
        Insert: ProjectInsert;
        Update: Partial<Omit<ProjectRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      project_milestones: {
        Row: ProjectMilestoneRow;
        Insert: ProjectMilestoneInsert;
        Update: Partial<Omit<ProjectMilestoneRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      time_entries: {
        Row: TimeEntryRow;
        Insert: TimeEntryInsert;
        Update: Partial<Omit<TimeEntryRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      courses: {
        Row: CourseRow;
        Insert: CourseInsert;
        Update: Partial<Omit<CourseRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      cohorts: {
        Row: CohortRow;
        Insert: CohortInsert;
        Update: Partial<Omit<CohortRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      enrolments: {
        Row: EnrolmentRow;
        Insert: EnrolmentInsert;
        Update: Partial<Omit<EnrolmentRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      cohort_sessions: {
        Row: CohortSessionRow;
        Insert: CohortSessionInsert;
        Update: Partial<Omit<CohortSessionRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      attendance: {
        Row: AttendanceRow;
        Insert: AttendanceInsert;
        Update: Partial<Omit<AttendanceRow, 'id'>>;
        Relationships: [];
      };
      finance_files: {
        Row: FinanceFileRow;
        Insert: FinanceFileInsert;
        Update: Partial<Omit<FinanceFileRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      vacancies: {
        Row: VacancyRow;
        Insert: VacancyInsert;
        Update: Partial<Omit<VacancyRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      candidates: {
        Row: CandidateRow;
        Insert: CandidateInsert;
        Update: Partial<Omit<CandidateRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      applications: {
        Row: ApplicationRow;
        Insert: ApplicationInsert;
        Update: Partial<Omit<ApplicationRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      interviews: {
        Row: InterviewRow;
        Insert: InterviewInsert;
        Update: Partial<Omit<InterviewRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      candidate_files: {
        Row: CandidateFileRow;
        Insert: CandidateFileInsert;
        Update: Partial<Omit<CandidateFileRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
    };
    Views: {
      v_invoice_balances: { Row: InvoiceBalanceViewRow; Relationships: [] };
      v_business_contacts: { Row: BusinessContactViewRow; Relationships: [] };
      v_candidate_search: { Row: CandidateSearchViewRow; Relationships: [] };
      v_project_pnl: { Row: ProjectPnlViewRow; Relationships: [] };
      v_cohort_summary: { Row: CohortSummaryViewRow; Relationships: [] };
    };
    Functions: {
      is_admin: { Args: Record<never, never>; Returns: boolean };
      delete_lead: { Args: { p_lead_id: string }; Returns: undefined };
      contact_erasure_preview: { Args: { p_contact_id: string }; Returns: unknown };
      erase_contact: { Args: { p_contact_id: string }; Returns: undefined };
      is_staff: { Args: Record<never, never>; Returns: boolean };
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
      vacancy_status: VacancyStatus;
      employment_type: EmploymentType;
      application_stage: ApplicationStage;
      availability_status: AvailabilityStatus;
      project_stage: ProjectStage;
      milestone_status: MilestoneStatus;
      delivery_mode: DeliveryMode;
      cohort_status: CohortStatus;
      enrolment_status: EnrolmentStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

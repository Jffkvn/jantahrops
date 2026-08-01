-- JantaHR Ops — leads.
--
-- A lead is an opportunity attached to a contact (always) and an organisation
-- (usually). It moves through a fixed pipeline. next_action_at is the single
-- most important column: it drives the Day View, the reminders, and the
-- "going cold" signal, so it is indexed.

create type public.lead_stage as enum (
  'new', 'contacted', 'qualified', 'proposal_sent',
  'negotiation', 'won', 'lost', 'dormant'
);

create table public.leads (
  id                       uuid primary key default gen_random_uuid(),
  contact_id               uuid not null references public.contacts (id) on delete cascade,
  organisation_id          uuid references public.organisations (id) on delete set null,
  source                   text,
  service_interest         text,
  stage                    public.lead_stage not null default 'new',
  value_ugx                bigint not null default 0,   -- whole shillings
  owner_id                 uuid references public.profiles (id) on delete set null,
  next_action_at           timestamptz,
  next_action_note         text,
  lost_reason              text,
  converted_organisation_id uuid references public.organisations (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index leads_stage_idx        on public.leads (stage);
create index leads_owner_idx        on public.leads (owner_id);
create index leads_next_action_idx  on public.leads (next_action_at);
create index leads_contact_idx      on public.leads (contact_id);
create index leads_organisation_idx on public.leads (organisation_id);
create index leads_created_idx      on public.leads (created_at desc);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Value is whole UGX. Guard against a negative slipping in from a bad client.
alter table public.leads add constraint leads_value_nonneg check (value_ugx >= 0);

-- ---------------------------------------------------------------------------
-- Stage-change logging.
-- Recording the move in the DB (not the app) means every path — UI, import,
-- a future API — produces the same timeline entry, and none can forget to.
-- ---------------------------------------------------------------------------
create or replace function public.log_lead_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.activities (subject_type, subject_id, type, body, meta, user_id)
    values (
      'lead', new.id, 'stage_change',
      format('Stage changed from %s to %s', old.stage, new.stage),
      jsonb_build_object('from', old.stage, 'to', new.stage),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger leads_log_stage_change
  after update on public.leads
  for each row execute function public.log_lead_stage_change();

-- ---------------------------------------------------------------------------
-- RLS — same shape as the spine: authenticated read/write, admin-only delete.
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;
create policy leads_select on public.leads for select to authenticated using (true);
create policy leads_insert on public.leads for insert to authenticated with check (true);
create policy leads_update on public.leads for update to authenticated using (true) with check (true);
create policy leads_delete on public.leads for delete to authenticated using (public.is_admin());

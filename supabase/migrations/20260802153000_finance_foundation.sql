-- JantaHR Ops — Finance Foundation
-- Documents (quote, LPO, invoice, receipt), gapless numbering, Uganda VAT + WHT settlement, and conversion.

-- ---------------------------------------------------------------------------
-- 1. Company Profile
-- ---------------------------------------------------------------------------
create table public.company_profile (
  id            boolean primary key default true,   -- single row: id is always true
  legal_name    text not null default 'JantaHR',
  tin           text,                                -- Dora fills in
  address       text,
  email         text,
  phone         text,
  bank_details  text,
  momo_details  text,
  vat_registered boolean not null default true,
  vat_rate_bp   integer not null default 1800,       -- basis points: 1800 = 18.00%
  wht_rate_bp   integer not null default 600,        -- 6.00%, informational
  currency      text not null default 'UGX',
  constraint company_profile_single_row check (id = true)
);

insert into public.company_profile (id) values (true) on conflict (id) do nothing;

alter table public.company_profile enable row level security;
create policy company_profile_select on public.company_profile for select to authenticated using (true);
create policy company_profile_update on public.company_profile for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Documents & Lines
-- ---------------------------------------------------------------------------
create type public.document_type   as enum ('quote', 'lpo', 'invoice', 'receipt');
create type public.document_status as enum (
  'draft', 'issued', 'accepted', 'rejected', 'part_paid', 'paid', 'cancelled', 'expired'
);

create table public.documents (
  id                 uuid primary key default gen_random_uuid(),
  type               public.document_type not null,
  number             text unique,                    -- null until issued; never reused
  organisation_id    uuid not null references public.organisations(id) on delete restrict,
  contact_id         uuid references public.contacts(id) on delete set null,
  related_type       text,                           -- 'lead' | 'project' | ...
  related_id         uuid,
  parent_document_id uuid references public.documents(id) on delete set null,
  issue_date         date,
  due_date           date,
  valid_until        date,                           -- quotes
  currency           text not null default 'UGX',
  subtotal_ugx       bigint not null default 0,
  vat_applicable     boolean not null default true,
  vat_rate_bp        integer not null default 1800,
  vat_amount_ugx     bigint not null default 0,
  total_ugx          bigint not null default 0,
  status             public.document_status not null default 'draft',
  notes              text,
  terms              text,
  efris_fdn          text,
  efris_qr_url       text,
  efris_status       text not null default 'not_required',  -- 'pending'|'issued'|'not_required'
  pdf_file_id        uuid,
  issued_by          uuid references public.profiles(id) on delete set null,
  issued_at          timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint documents_amounts_nonneg check (subtotal_ugx >= 0 and vat_amount_ugx >= 0 and total_ugx >= 0)
);

create index documents_type_idx          on public.documents (type);
create index documents_status_idx        on public.documents (status);
create index documents_organisation_idx  on public.documents (organisation_id);
create index documents_related_idx       on public.documents (related_type, related_id);
create index documents_parent_idx        on public.documents (parent_document_id);
create index documents_created_idx       on public.documents (created_at desc);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create table public.document_lines (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents(id) on delete cascade,
  position       integer not null default 0,
  description    text not null,
  qty            numeric(12,2) not null default 1,
  unit           text,
  unit_price_ugx bigint not null default 0,
  line_total_ugx bigint not null default 0,          -- round(qty * unit_price)
  tax_treatment  text not null default 'standard'     -- 'standard'|'exempt'|'zero'
);

create index document_lines_document_idx on public.document_lines (document_id);

alter table public.documents enable row level security;
create policy documents_select on public.documents for select to authenticated using (true);
create policy documents_insert on public.documents for insert to authenticated with check (true);
create policy documents_update on public.documents for update to authenticated using (true) with check (true);
create policy documents_delete on public.documents for delete to authenticated using (public.is_admin());

alter table public.document_lines enable row level security;
create policy document_lines_select on public.document_lines for select to authenticated using (true);
create policy document_lines_insert on public.document_lines for insert to authenticated with check (true);
create policy document_lines_update on public.document_lines for update to authenticated using (true) with check (true);
create policy document_lines_delete on public.document_lines for delete to authenticated using (public.is_admin());

-- Guard: Number column cannot be changed or cleared once set
create or replace function public.enforce_document_number_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.number is not null and (new.number is distinct from old.number) then
    raise exception 'issued document number is immutable and cannot be edited or cleared';
  end if;
  return new;
end;
$$;

create trigger documents_enforce_number_immutability
  before update on public.documents
  for each row execute function public.enforce_document_number_immutability();

-- ---------------------------------------------------------------------------
-- 3. Document Sequences & Atomic Numbering
-- ---------------------------------------------------------------------------
create table public.document_sequences (
  doc_type   public.document_type not null,
  year       integer not null,
  last_value integer not null default 0,
  primary key (doc_type, year)
);

alter table public.document_sequences enable row level security;
create policy document_sequences_select on public.document_sequences for select to authenticated using (true);

create or replace function public.next_document_number(p_type public.document_type)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
  v_next int;
  v_code text;
begin
  v_year := extract(year from (now() at time zone 'Africa/Kampala'))::int;
  insert into public.document_sequences(doc_type, year, last_value)
    values (p_type, v_year, 1)
    on conflict (doc_type, year)
    do update set last_value = public.document_sequences.last_value + 1
    returning last_value into v_next;
  v_code := case p_type
    when 'quote' then 'QT'
    when 'lpo' then 'LPO'
    when 'invoice' then 'INV'
    when 'receipt' then 'RCT'
  end;
  return format('JH-%s-%s-%s', v_code,
    to_char(now() at time zone 'Africa/Kampala', 'YYYYMMDD'),
    lpad(v_next::text, 4, '0'));
end;
$$;

create or replace function public.issue_document(p_doc_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.document_type;
  v_status public.document_status;
  v_number text;
begin
  select type, status into v_type, v_status
    from public.documents where id = p_doc_id for update;
  if v_status is distinct from 'draft' then
    raise exception 'only a draft document can be issued (was %)', v_status;
  end if;
  v_number := public.next_document_number(v_type);
  update public.documents
    set number = v_number,
        status = 'issued',
        issue_date = (now() at time zone 'Africa/Kampala')::date,
        issued_at = now(),
        issued_by = auth.uid()
    where id = p_doc_id;
  insert into public.activities(subject_type, subject_id, type, body, user_id)
    values ('document', p_doc_id, 'system',
            format('%s issued as %s', v_type, v_number), auth.uid());
  return v_number;
end;
$$;

grant execute on function public.issue_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Payments, WHT, and Invoice Settlement
-- ---------------------------------------------------------------------------
create type public.payment_method as enum (
  'mtn_momo', 'airtel_money', 'bank_transfer', 'cash', 'cheque'
);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  document_id         uuid not null references public.documents(id) on delete cascade,
  amount_received_ugx bigint not null default 0,
  wht_withheld_ugx     bigint not null default 0,
  method              public.payment_method not null,
  reference           text,                          -- txn id / slip no.
  proof_file_id       uuid,
  received_at         timestamptz not null default now(),
  confirmed_by        uuid references public.profiles(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  constraint payment_nonneg check (amount_received_ugx >= 0 and wht_withheld_ugx >= 0)
);

create index payments_document_idx on public.payments (document_id);

alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated using (true);
create policy payments_insert on public.payments for insert to authenticated with check (true);
create policy payments_update on public.payments for update to authenticated using (true) with check (true);
create policy payments_delete on public.payments for delete to authenticated using (public.is_admin());

-- Declare receipt generator forward declaration for trigger
create or replace function public.generate_receipt(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt uuid;
  v_number text;
  inv public.documents;
begin
  if exists (select 1 from public.documents
             where type = 'receipt' and parent_document_id = p_invoice_id) then
    return null;
  end if;
  select * into inv from public.documents where id = p_invoice_id;
  if inv.id is null then
    return null;
  end if;
  v_number := public.next_document_number('receipt');
  insert into public.documents
    (type, number, organisation_id, contact_id, parent_document_id,
     issue_date, currency, subtotal_ugx, vat_applicable, vat_rate_bp,
     vat_amount_ugx, total_ugx, status, issued_at)
  values
    ('receipt', v_number, inv.organisation_id, inv.contact_id, p_invoice_id,
     (now() at time zone 'Africa/Kampala')::date, inv.currency, inv.subtotal_ugx,
     inv.vat_applicable, inv.vat_rate_bp, inv.vat_amount_ugx, inv.total_ugx,
     'issued', now())
  returning id into v_receipt;
  insert into public.activities(subject_type, subject_id, type, body)
    values ('document', p_invoice_id, 'payment',
            format('Paid in full. Receipt %s generated.', v_number));
  return v_receipt;
end;
$$;

grant execute on function public.generate_receipt(uuid) to authenticated;

create or replace function public.settle_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid;
  v_total bigint;
  v_status public.document_status;
  v_settled bigint;
begin
  v_doc := coalesce(new.document_id, old.document_id);
  select total_ugx, status into v_total, v_status
    from public.documents where id = v_doc for update;
  if v_status in ('cancelled') then
    return coalesce(new, old);
  end if;
  select coalesce(sum(amount_received_ugx + wht_withheld_ugx), 0)
    into v_settled from public.payments where document_id = v_doc;
  if v_settled >= v_total and v_total > 0 then
    update public.documents set status = 'paid' where id = v_doc and status <> 'paid';
    perform public.generate_receipt(v_doc);
  elsif v_settled > 0 then
    update public.documents set status = 'part_paid' where id = v_doc;
  else
    update public.documents set status = 'issued' where id = v_doc and status in ('part_paid', 'paid');
  end if;
  return coalesce(new, old);
end;
$$;

create trigger payments_settle_invoice
  after insert or update or delete on public.payments
  for each row execute function public.settle_invoice();

-- ---------------------------------------------------------------------------
-- 5. Quote / LPO to Invoice Conversion
-- ---------------------------------------------------------------------------
create or replace function public.convert_to_invoice(p_source_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.documents;
  v_new_invoice_id uuid;
begin
  select * into v_source from public.documents where id = p_source_id for update;
  if v_source.id is null then
    raise exception 'source document not found';
  end if;
  if v_source.type not in ('quote', 'lpo') or v_source.status is distinct from 'accepted' then
    raise exception 'only an accepted quote or LPO can be converted to an invoice (type=%, status=%)', v_source.type, v_source.status;
  end if;

  insert into public.documents
    (type, number, organisation_id, contact_id, related_type, related_id,
     parent_document_id, currency, subtotal_ugx, vat_applicable, vat_rate_bp,
     vat_amount_ugx, total_ugx, status, notes, terms, created_by)
  values
    ('invoice', null, v_source.organisation_id, v_source.contact_id, v_source.related_type, v_source.related_id,
     p_source_id, v_source.currency, v_source.subtotal_ugx, v_source.vat_applicable, v_source.vat_rate_bp,
     v_source.vat_amount_ugx, v_source.total_ugx, 'draft', v_source.notes, v_source.terms, auth.uid())
  returning id into v_new_invoice_id;

  insert into public.document_lines
    (document_id, position, description, qty, unit, unit_price_ugx, line_total_ugx, tax_treatment)
  select
    v_new_invoice_id, position, description, qty, unit, unit_price_ugx, line_total_ugx, tax_treatment
  from public.document_lines
  where document_id = p_source_id
  order by position;

  insert into public.activities(subject_type, subject_id, type, body, user_id)
    values ('document', p_source_id, 'system',
            format('Converted to draft invoice %s', v_new_invoice_id), auth.uid());

  return v_new_invoice_id;
end;
$$;

grant execute on function public.convert_to_invoice(uuid) to authenticated;

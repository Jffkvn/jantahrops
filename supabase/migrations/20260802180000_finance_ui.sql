-- JantaHR Ops — Finance UI (Prompt 2.2)
-- Expenses, invoice balances view, finance summary, and storage bucket.

-- ---------------------------------------------------------------------------
-- 1. Expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,
  description     text,
  amount_ugx      bigint not null,
  incurred_on     date not null,
  vendor          text,
  project_id      uuid,
  organisation_id uuid references public.organisations(id) on delete set null,
  receipt_file_id uuid,
  entered_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint expenses_amount_nonneg check (amount_ugx >= 0)
);

create index expenses_incurred_idx on public.expenses (incurred_on desc);
create index expenses_category_idx on public.expenses (category);
create index expenses_organisation_idx on public.expenses (organisation_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;
create policy expenses_select on public.expenses for select to authenticated using (true);
create policy expenses_insert on public.expenses for insert to authenticated with check (true);
create policy expenses_update on public.expenses for update to authenticated using (true) with check (true);
create policy expenses_delete on public.expenses for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Invoice Balances View
-- ---------------------------------------------------------------------------
create view public.v_invoice_balances as
  select d.id, d.organisation_id, d.number, d.total_ugx, d.due_date, d.status,
    d.total_ugx - coalesce(
      (select sum(p.amount_received_ugx + p.wht_withheld_ugx)
       from public.payments p where p.document_id = d.id), 0) as balance_ugx
  from public.documents d
  where d.type = 'invoice' and d.status in ('issued', 'part_paid');

-- ---------------------------------------------------------------------------
-- 3. Finance Summary
-- ---------------------------------------------------------------------------
create function public.finance_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'receivables_ugx', (select coalesce(sum(balance_ugx), 0) from public.v_invoice_balances),
    'overdue_ugx', (select coalesce(sum(balance_ugx), 0) from public.v_invoice_balances
                    where due_date < (now() at time zone 'Africa/Kampala')::date),
    'revenue_month_ugx', (select coalesce(sum(amount_received_ugx), 0)
      from public.payments where date_trunc('month', received_at at time zone 'Africa/Kampala')
        = date_trunc('month', now() at time zone 'Africa/Kampala')),
    'expenses_month_ugx', (select coalesce(sum(amount_ugx), 0)
      from public.expenses where date_trunc('month', incurred_on)
        = date_trunc('month', (now() at time zone 'Africa/Kampala')::date)),
    'wht_credit_year_ugx', (select coalesce(sum(wht_withheld_ugx), 0)
      from public.payments where extract(year from received_at at time zone 'Africa/Kampala')
        = extract(year from now() at time zone 'Africa/Kampala'))
  );
$$;
grant execute on function public.finance_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Expense Category Summary (current month total + per-category breakdown)
-- ---------------------------------------------------------------------------
create function public.expenses_category_summary(p_month date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'month_total_ugx', coalesce(sum(total_ugx), 0),
    'categories', coalesce(jsonb_agg(jsonb_build_object('category', category, 'total_ugx', total_ugx) order by total_ugx desc), '[]'::jsonb)
  )
  from (
    select category, sum(amount_ugx) as total_ugx
    from public.expenses
    where date_trunc('month', incurred_on) = date_trunc('month', p_month)
    group by category
  ) s;
$$;
grant execute on function public.expenses_category_summary(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Finance files metadata table + private storage bucket
-- ---------------------------------------------------------------------------
-- The bucket is PRIVATE: no public read. Access is by signed URL only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance',
  'finance',
  false,
  10485760,  -- 10 MB cap
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.finance_files (
  id          uuid primary key default gen_random_uuid(),
  bucket      text not null default 'finance',
  path        text not null,
  filename    text not null,
  mime        text not null,
  size_bytes  integer not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index finance_files_bucket_idx on public.finance_files (bucket, path);

alter table public.finance_files enable row level security;
create policy finance_files_select on public.finance_files for select to authenticated using (true);
create policy finance_files_insert on public.finance_files for insert to authenticated with check (true);
create policy finance_files_delete on public.finance_files for delete to authenticated using (public.is_admin());

-- Storage object access for the private bucket. Bucket itself is public=false,
-- so nothing is ever world-readable; signed URLs are the only way in.
create policy finance_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'finance');
create policy finance_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance');
create policy finance_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'finance' and public.is_admin());
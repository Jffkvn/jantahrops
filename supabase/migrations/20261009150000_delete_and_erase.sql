-- Deleting leads, and erasing a person on request.
--
-- Why functions and not plain DELETEs from the app:
--   * activities, signals and tasks point at records polymorphically
--     (subject_type/subject_id, related_type/related_id), so no foreign key
--     cascades them. Deleting a lead with a plain DELETE would leave its
--     timeline, signals and tasks behind, still holding personal details.
--   * web_submissions keep the raw website payload (name, email, phone,
--     message). An erasure has to remove those too, and staff have no DELETE
--     policy on them, nor on cv_import_files (service-role only).
--   * Everything in one transaction: it all goes, or nothing does.
--
-- All three are admin-only. They run as security definer so they can clear the
-- rows RLS hides from staff, with the admin check done explicitly first.
--
-- Erasure is the Uganda Data Protection and Privacy Act 2019 right to deletion.
-- Files in the private `candidates` bucket can't be deleted from SQL: the app
-- removes them through the Storage API (admin-only policy) BEFORE calling
-- erase_contact, using the paths contact_erasure_preview returns. If the
-- database step then fails, rerunning the erasure finishes the job.
--
-- Erasure refuses while the person is linked to finance documents, projects or
-- academy enrolments: invoices and receipts are records the business must keep,
-- and enrolments block contact deletion by design (on delete restrict).

-- ---------------------------------------------------------------------------
-- Internal helpers. Not callable by app users (execute revoked below).
-- ---------------------------------------------------------------------------

create or replace function public._purge_lead(p_lead_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.activities where subject_type = 'lead' and subject_id = p_lead_id;
  delete from public.signals    where subject_type = 'lead' and subject_id = p_lead_id;
  delete from public.tasks      where related_type = 'lead' and related_id = p_lead_id;
  delete from public.web_submissions where lead_id = p_lead_id;
  delete from public.leads where id = p_lead_id;
$$;

create or replace function public._contact_erasure_blockers(p_contact_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    (select case when count(*) > 0 then count(*) || ' finance document(s)' end
       from public.documents d
      where d.contact_id = p_contact_id
         or (d.related_type = 'lead'
             and d.related_id in (select id from public.leads where contact_id = p_contact_id))),
    (select case when count(*) > 0 then count(*) || ' project(s)' end
       from public.projects where contact_id = p_contact_id),
    (select case when count(*) > 0 then count(*) || ' academy enrolment(s)' end
       from public.enrolments where contact_id = p_contact_id)
  ], null);
$$;

-- Storage paths of every file held for this person: the current CV and any
-- bulk-imported files (CVs, cover letters, certificates).
create or replace function public._contact_file_paths(p_contact_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p) filter (where p is not null), '{}')
  from (
    select f.path as p
      from public.candidate_files f
      join public.candidates k on k.cv_file_id = f.id
     where k.contact_id = p_contact_id
    union
    select i.storage_path
      from public.cv_import_files i
     where i.contact_id = p_contact_id
        or i.candidate_id in (select id from public.candidates where contact_id = p_contact_id)
  ) s;
$$;

revoke all on function public._purge_lead(uuid)                from public, anon, authenticated;
revoke all on function public._contact_erasure_blockers(uuid)  from public, anon, authenticated;
revoke all on function public._contact_file_paths(uuid)        from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- delete_lead: removes one lead with its timeline, signals, tasks and the
-- website submission that created it. The contact stays.
-- ---------------------------------------------------------------------------

create or replace function public.delete_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete leads.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'That lead no longer exists.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.documents where related_type = 'lead' and related_id = p_lead_id) then
    raise exception 'This lead has quotes or invoices, which must be kept. Mark it Lost instead.'
      using errcode = 'P0001';
  end if;
  perform public._purge_lead(p_lead_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- contact_erasure_preview: what an erasure would remove, for the confirm step.
-- ---------------------------------------------------------------------------

create or replace function public.contact_erasure_preview(p_contact_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contact      public.contacts%rowtype;
  v_candidate_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can erase a person''s data.' using errcode = '42501';
  end if;
  select * into v_contact from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'That person no longer exists.' using errcode = 'P0002';
  end if;
  select id into v_candidate_id from public.candidates where contact_id = p_contact_id;

  return jsonb_build_object(
    'full_name',    v_contact.full_name,
    'email',        v_contact.email,
    'leads',        (select count(*) from public.leads where contact_id = p_contact_id),
    'is_candidate', v_candidate_id is not null,
    'applications', (select count(*) from public.applications where candidate_id = v_candidate_id),
    'submissions',  (select count(*) from public.web_submissions w
                      where w.contact_id = p_contact_id
                         or (v_contact.email is not null
                             and lower(w.payload->>'email') = lower(v_contact.email))),
    'files',        to_jsonb(public._contact_file_paths(p_contact_id)),
    'blockers',     to_jsonb(public._contact_erasure_blockers(p_contact_id))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- erase_contact: removes the person and everything held about them.
-- Call only after the files from contact_erasure_preview are removed.
-- ---------------------------------------------------------------------------

create or replace function public.erase_contact(p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email        text;
  v_candidate_id uuid;
  v_cv_file_id   uuid;
  v_blockers     text[];
  v_lead_id      uuid;
  v_app_ids      uuid[];
  v_import_paths text[];
begin
  if not public.is_admin() then
    raise exception 'Only an admin can erase a person''s data.' using errcode = '42501';
  end if;
  select email into v_email from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'That person no longer exists.' using errcode = 'P0002';
  end if;
  v_blockers := public._contact_erasure_blockers(p_contact_id);
  if cardinality(v_blockers) > 0 then
    raise exception 'This person is linked to % that must be kept. Unlink or remove those first.',
      array_to_string(v_blockers, ', ') using errcode = 'P0001';
  end if;

  -- Leads, with their timelines, signals, tasks and submissions.
  for v_lead_id in select id from public.leads where contact_id = p_contact_id loop
    perform public._purge_lead(v_lead_id);
  end loop;

  -- Candidate profile, applications (interviews cascade) and files.
  select id, cv_file_id into v_candidate_id, v_cv_file_id
    from public.candidates where contact_id = p_contact_id;
  if v_candidate_id is not null then
    select coalesce(array_agg(id), '{}') into v_app_ids
      from public.applications where candidate_id = v_candidate_id;
    delete from public.activities where subject_type = 'application' and subject_id = any (v_app_ids);
    delete from public.signals    where subject_type = 'application' and subject_id = any (v_app_ids);
    delete from public.tasks      where related_type = 'application' and related_id = any (v_app_ids);

    delete from public.activities where subject_type = 'candidate' and subject_id = v_candidate_id;
    delete from public.signals    where subject_type = 'candidate' and subject_id = v_candidate_id;
    delete from public.tasks      where related_type = 'candidate' and related_id = v_candidate_id;
  end if;

  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}')
    into v_import_paths
    from public.cv_import_files
   where contact_id = p_contact_id or candidate_id = v_candidate_id;
  delete from public.candidate_files where id = v_cv_file_id or path = any (v_import_paths);
  delete from public.cv_import_files where contact_id = p_contact_id or candidate_id = v_candidate_id;
  delete from public.candidates where id = v_candidate_id;

  -- The person themselves, and every raw website submission they made.
  delete from public.activities where subject_type = 'contact' and subject_id = p_contact_id;
  delete from public.signals    where subject_type = 'contact' and subject_id = p_contact_id;
  delete from public.tasks      where related_type = 'contact' and related_id = p_contact_id;
  delete from public.web_submissions w
   where w.contact_id = p_contact_id
      or (v_email is not null and lower(w.payload->>'email') = lower(v_email));
  delete from public.contacts where id = p_contact_id;  -- contact_roles cascade

  -- Accountability without personal data: who erased a record, and when.
  insert into public.activities (subject_type, subject_id, type, body, user_id)
  values ('erasure', p_contact_id, 'system', 'A person''s record was erased on request.', auth.uid());
end;
$$;

revoke all on function public.delete_lead(uuid)             from public, anon;
revoke all on function public.contact_erasure_preview(uuid) from public, anon;
revoke all on function public.erase_contact(uuid)           from public, anon;
grant execute on function public.delete_lead(uuid)             to authenticated;
grant execute on function public.contact_erasure_preview(uuid) to authenticated;
grant execute on function public.erase_contact(uuid)           to authenticated;

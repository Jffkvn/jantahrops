-- Close anonymous access to database functions.
--
-- Supabase grants EXECUTE on every new public function to `anon` by default.
-- A security audit on 9 Oct 2026 found these callable with only the public
-- anon key (no login):
--   finance_summary, expenses_category_summary  -> leaked money totals
--   next_document_number                         -> could burn invoice numbers
--   generate_receipt, generate_signals           -> wrote data
--   convert_to_invoice, issue_document           -> checked the caller, but
--                                                   had no reason to be open
-- Nothing in Ops calls them without a login: the website forms go through
-- edge functions using the service role. Staff (authenticated) keep access.

revoke execute on function public.finance_summary()                          from anon, public;
revoke execute on function public.expenses_category_summary(date)            from anon, public;
revoke execute on function public.next_document_number(public.document_type) from anon, public;
revoke execute on function public.generate_receipt(uuid)                     from anon, public;
revoke execute on function public.generate_signals()                         from anon, public;
revoke execute on function public.convert_to_invoice(uuid)                   from anon, public;
revoke execute on function public.issue_document(uuid)                       from anon, public;

grant execute on function public.finance_summary()                          to authenticated;
grant execute on function public.expenses_category_summary(date)            to authenticated;
grant execute on function public.next_document_number(public.document_type) to authenticated;
grant execute on function public.generate_receipt(uuid)                     to authenticated;
grant execute on function public.generate_signals()                         to authenticated;
grant execute on function public.convert_to_invoice(uuid)                   to authenticated;
grant execute on function public.issue_document(uuid)                       to authenticated;

-- Future functions: not callable anonymously unless a migration grants it.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, public;

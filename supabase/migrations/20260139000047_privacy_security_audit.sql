-- 0047: a database self-check for the privacy and access-control work.
-- ---------------------------------------------------------------------------
-- privacy_security_audit() answers three questions an operator (and the test suite) should be able to ask at any time:
--   1. Does every table in the public schema have row level security switched on?
--   2. Which SECURITY DEFINER functions can a signed-out visitor (anon) call? They run with the owner's rights, so each
--      one must be there on purpose.
--   3. Which tables can the `authenticated` role write to directly? Each should be a table whose row level security
--      policies are meant to allow it.
-- It reads only the catalogue (no personal data) and is callable by the server's service role only.
-- ---------------------------------------------------------------------------

create or replace function public.privacy_security_audit()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_no_rls jsonb;
  v_anon_fns jsonb;
  v_writable jsonb;
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) into v_no_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  select coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb) into v_anon_fns
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');

  select coalesce(jsonb_agg(distinct g.table_name order by g.table_name), '[]'::jsonb) into v_writable
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  return jsonb_build_object('tables_without_rls', v_no_rls, 'definer_functions_callable_by_anon', v_anon_fns, 'tables_authenticated_can_write', v_writable);
end;
$$;
revoke execute on function public.privacy_security_audit() from public, anon, authenticated;
grant execute on function public.privacy_security_audit() to service_role;

-- ── Closing what the audit found ────────────────────────────────────────────
-- These SECURITY DEFINER functions all check the caller's session or permission inside, so a signed-out visitor got
-- nothing from them, but a visitor should not be able to call them at all (defence in depth). Postgres grants EXECUTE to
-- PUBLIC on every new function, and the earlier blue tick migrations never revoked it; 0045 re-created
-- admin_list_deletions, which reset its grants the same way. Signed-in members and the server keep access.
revoke execute on function
  public.admin_list_blue_tick_applications(text, integer, integer),
  public.admin_list_deletions(text),
  public.admin_set_blue_tick(uuid, boolean, text),
  public.review_blue_tick_application(uuid, text, text),
  public.set_blue_tick_pricing(boolean, integer),
  public.submit_blue_tick_document(uuid, uuid)
from public, anon;
grant execute on function
  public.admin_list_blue_tick_applications(text, integer, integer),
  public.admin_list_deletions(text),
  public.admin_set_blue_tick(uuid, boolean, text),
  public.review_blue_tick_application(uuid, text, text),
  public.set_blue_tick_pricing(boolean, integer),
  public.submit_blue_tick_document(uuid, uuid)
to authenticated, service_role;

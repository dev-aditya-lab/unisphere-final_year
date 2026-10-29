-- Academy functions: a signed-out visitor may call only the few that exist for visitors.
--
-- Postgres (and Supabase's default privileges) give EXECUTE on every new function to PUBLIC and to the anon role. The Academy functions
-- all check the caller's session or permission inside, so a visitor got nothing from them, but a visitor should not be able to call
-- them at all (defence in depth; the database self-audit privacy_security_audit() lists exactly such functions). Signed-in members and
-- the server keep the access they were given; trigger functions are checked when the trigger is created, not when it fires.
--
-- Kept for visitors on purpose:
--   academy_public_settings, academy_public_showcase   what the public pages show
--   academy_quote, academy_catalog_prices              the price of a course, for anyone looking
--   academy_verify_certificate                         public certificate verification
--   academy_is_staff, academy_has_access, academy_can_open_lesson
--                                                      used inside the Row Level Security policies that let visitors read the catalogue and free previews
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'academy\_%' or p.proname like '\_academy\_%')
       and p.proname not in ('academy_public_settings', 'academy_public_showcase', 'academy_quote', 'academy_catalog_prices',
                             'academy_verify_certificate', 'academy_is_staff', 'academy_has_access', 'academy_can_open_lesson')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end;
$$;

-- A CHECK constraint runs with the rights of whoever writes the row, so the timetable check must stay callable by signed-in staff.
grant execute on function public._academy_timetable_valid(jsonb) to authenticated, service_role;

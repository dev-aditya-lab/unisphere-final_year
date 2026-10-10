-- 0001: extensions, privilege defaults and generic helpers
-- ---------------------------------------------------------------------------
-- Security posture: nothing in `public` is reachable by API roles unless a
-- migration explicitly GRANTs it (and RLS then filters rows). We also strip the
-- TRUNCATE/REFERENCES/TRIGGER privileges Supabase adds by default, because
-- TRUNCATE bypasses row level security entirely.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- The service role is server-only and trusted: plain DML, never TRUNCATE.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Generic trigger helper -----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Role of the caller as seen by PostgREST ('anon' | 'authenticated' | 'service_role' | null for direct SQL).
create or replace function public.jwt_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
$$;

grant execute on function public.jwt_role() to anon, authenticated, service_role;

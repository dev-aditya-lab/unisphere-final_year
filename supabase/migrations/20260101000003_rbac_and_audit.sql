-- 0003: role based access control + immutable audit log
-- ---------------------------------------------------------------------------
-- A role assignment has a scope:
--   college_id IS NULL      -> platform-wide
--   college_id = <college>  -> only resources belonging to that college
-- Permission checks always pass the resource's college, so a college
-- administrator can never act outside their own college.
-- ---------------------------------------------------------------------------

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('global_admin', 'college_admin', 'moderator', 'verification_staff', 'support_agent')),
  college_id uuid references public.colleges(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (role = 'global_admin' and college_id is null) or
    (role = 'college_admin' and college_id is not null) or
    (role in ('moderator', 'verification_staff', 'support_agent'))
  )
);
create unique index user_roles_unique_idx
  on public.user_roles (user_id, role, coalesce(college_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_roles_user_idx on public.user_roles(user_id);

create table public.role_permissions (
  role text not null check (role in ('global_admin', 'college_admin', 'moderator', 'verification_staff', 'support_agent')),
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions(role, permission)
select 'global_admin', p from unnest(array[
  'users.view','users.restrict','users.suspend','users.reinstate','users.delete',
  'roles.manage','roles.manage_limited',
  'verification.review',
  'reports.view','reports.resolve','content.remove','content.restore','moderation.warn','appeals.review',
  'announcements.manage','events.manage','communities.manage',
  'analytics.view','audit.view',
  'settings.view','settings.manage','flags.manage','ai.view',
  'support.lookup','contact.manage',
  'college.manage','colleges.manage'
]) as p;

insert into public.role_permissions(role, permission)
select 'college_admin', p from unnest(array[
  'users.view','users.restrict','users.suspend','users.reinstate','users.delete',
  'roles.manage_limited',
  'verification.review',
  'reports.view','reports.resolve','content.remove','content.restore','moderation.warn','appeals.review',
  'announcements.manage','events.manage','communities.manage',
  'analytics.view','audit.view',
  'college.manage'
]) as p;

insert into public.role_permissions(role, permission)
select 'moderator', p from unnest(array[
  'reports.view','reports.resolve','content.remove','content.restore','moderation.warn','users.restrict','appeals.review'
]) as p;

insert into public.role_permissions(role, permission) values
  ('verification_staff', 'verification.review'),
  ('support_agent', 'support.lookup'),
  ('support_agent', 'contact.manage');

-- ── Identity helpers ────────────────────────────────────────────────────────
create or replace function public.my_college_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.college_id from public.profiles p where p.id = (select auth.uid());
$$;

-- Fully active account (not restricted / suspended / deactivated).
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

-- Can read member-only content (active or temporarily restricted).
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status in ('active', 'restricted')
  );
$$;

-- Strict, scope-aware permission check for a resource in `p_college_id`.
-- NULL college only matches platform-wide assignments.
create or replace function public.has_permission(p_permission text, p_college_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles me on me.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and me.status = 'active'
      and rp.permission = p_permission
      and (ur.college_id is null or ur.college_id = p_college_id)
  );
$$;

-- "Does the caller hold this permission anywhere?" — for navigation / UI gating only.
create or replace function public.has_any_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles me on me.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and me.status = 'active'
      and rp.permission = p_permission
  );
$$;

-- All permissions the caller holds, with scope, for the admin UI.
create or replace function public.my_permissions()
returns table (role text, college_id uuid, permission text)
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role, ur.college_id, rp.permission
  from public.user_roles ur
  join public.role_permissions rp on rp.role = ur.role
  join public.profiles me on me.id = ur.user_id
  where ur.user_id = (select auth.uid()) and me.status = 'active';
$$;

grant execute on function
  public.my_college_id(), public.is_active_user(), public.is_member(),
  public.has_permission(text, uuid), public.has_any_permission(text), public.my_permissions()
  to anon, authenticated, service_role;

-- ── Audit log (append-only) ─────────────────────────────────────────────────
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  college_id uuid references public.colleges(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs(target_type, target_id);
create index audit_logs_college_idx on public.audit_logs(college_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs(action);

create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger trg_audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger trg_audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- Remove obviously sensitive keys before anything is persisted.
create or replace function public.scrub_metadata(p_meta jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_object_agg(k, v)
     from jsonb_each(coalesce(p_meta, '{}'::jsonb)) as t(k, v)
     where k !~* '(password|token|secret|api_?key|authorization|cookie|message_body|body)'),
    '{}'::jsonb
  );
$$;

create or replace function public.write_audit_log(
  p_actor uuid, p_action text, p_target_type text default null, p_target_id text default null,
  p_college uuid default null, p_metadata jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs(actor_id, action, target_type, target_id, college_id, metadata)
  values (p_actor, p_action, p_target_type, p_target_id, p_college, public.scrub_metadata(p_metadata));
$$;
-- Not callable by API roles directly: only other SECURITY DEFINER functions and the service role.
grant execute on function public.write_audit_log(uuid, text, text, text, uuid, jsonb) to service_role;

-- ── Role management RPCs ────────────────────────────────────────────────────
create or replace function public.grant_role(p_user uuid, p_role text, p_college uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target public.profiles%rowtype;
  v_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_user = v_actor then raise exception 'cannot_grant_to_self' using errcode = '42501'; end if;

  select * into v_target from public.profiles where id = p_user;
  if not found or v_target.status <> 'active' then raise exception 'target_unavailable' using errcode = '22023'; end if;

  if p_role = 'global_admin' then
    if p_college is not null then raise exception 'invalid_scope' using errcode = '22023'; end if;
    if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif p_role = 'college_admin' then
    if p_college is null then raise exception 'invalid_scope' using errcode = '22023'; end if;
    if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif p_role in ('moderator', 'verification_staff', 'support_agent') then
    if p_college is null then
      if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
    else
      if not (public.has_permission('roles.manage', p_college) or public.has_permission('roles.manage_limited', p_college)) then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    end if;
  else
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  -- College-scoped staff must belong to that college.
  if p_college is not null and v_target.college_id is distinct from p_college then
    raise exception 'target_not_in_college' using errcode = '22023';
  end if;

  insert into public.user_roles(user_id, role, college_id, granted_by)
  values (p_user, p_role, p_college, v_actor)
  returning id into v_id;

  perform public.write_audit_log(v_actor, 'role.granted', 'user', p_user::text, p_college,
    jsonb_build_object('role', p_role));
  return v_id;
end;
$$;

create or replace function public.revoke_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row public.user_roles%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_row from public.user_roles where id = p_role_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if v_row.role in ('global_admin', 'college_admin') or v_row.college_id is null then
    if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    if not (public.has_permission('roles.manage', v_row.college_id) or public.has_permission('roles.manage_limited', v_row.college_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if v_row.role = 'global_admin' and (select count(*) from public.user_roles where role = 'global_admin') <= 1 then
    raise exception 'last_global_admin' using errcode = '23514';
  end if;

  delete from public.user_roles where id = p_role_id;
  perform public.write_audit_log(v_actor, 'role.revoked', 'user', v_row.user_id::text, v_row.college_id,
    jsonb_build_object('role', v_row.role));
end;
$$;

grant execute on function public.grant_role(uuid, text, uuid), public.revoke_role(uuid) to authenticated, service_role;

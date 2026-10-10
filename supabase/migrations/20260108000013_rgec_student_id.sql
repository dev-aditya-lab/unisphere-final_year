-- 0013: Ramgarh Engineering College + student-ID verification
-- ---------------------------------------------------------------------------
-- UniSphere is built for Ramgarh Engineering College (RGEC). Students prove they belong by entering their
-- student ID, which is not public. The college supplies the list of valid IDs; we store only a keyed hash
-- (HMAC-SHA256 with the server secret) and the last three characters as a hint for staff. A raw ID is
-- never stored, logged or shown. Each ID can be claimed by exactly one account.
-- ---------------------------------------------------------------------------

alter table public.colleges drop constraint if exists colleges_verification_mode_check;
alter table public.colleges add constraint colleges_verification_mode_check
  check (verification_mode in ('email_domain', 'manual', 'invite', 'student_id'));
alter table public.college_verifications drop constraint if exists college_verifications_method_check;
alter table public.college_verifications add constraint college_verifications_method_check
  check (method in ('email_domain', 'manual', 'invite', 'student_id'));

-- ── The college ─────────────────────────────────────────────────────────────
insert into public.colleges (id, slug, name, short_name, city, state, country, verification_mode)
values ('00000000-0000-4000-8000-0000000000a1', 'ramgarh-engineering-college', 'Ramgarh Engineering College', 'RGEC', 'Ramgarh', 'Jharkhand', 'IN', 'student_id')
on conflict (id) do nothing;

insert into public.campuses (college_id, name, city)
values ('00000000-0000-4000-8000-0000000000a1', 'Main Campus', 'Ramgarh')
on conflict do nothing;

insert into public.departments (college_id, slug, name, code) values
  ('00000000-0000-4000-8000-0000000000a1', 'computer-science', 'Computer Science & Engineering', 'CSE'),
  ('00000000-0000-4000-8000-0000000000a1', 'electrical', 'Electrical Engineering', 'EE'),
  ('00000000-0000-4000-8000-0000000000a1', 'mechanical', 'Mechanical Engineering', 'ME'),
  ('00000000-0000-4000-8000-0000000000a1', 'civil', 'Civil Engineering', 'CE')
on conflict do nothing;

insert into public.academic_programs (college_id, department_id, name, degree_level, duration_years)
select d.college_id, d.id, 'B.Tech ' || d.name, 'undergraduate', 4
from public.departments d
where d.college_id = '00000000-0000-4000-8000-0000000000a1'
on conflict do nothing;

-- This product is for RGEC members: publishing requires a verified student ID (staff can switch it off).
update public.system_settings set value = 'true' where key = 'college_verification_required';

-- ── Permission ──────────────────────────────────────────────────────────────
insert into public.role_permissions(role, permission) values
  ('global_admin', 'roster.manage'), ('college_admin', 'roster.manage'), ('verification_staff', 'roster.manage')
on conflict do nothing;

-- ── Student ID roster ───────────────────────────────────────────────────────
create table public.student_id_roster (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  id_hash text not null check (id_hash ~ '^[0-9a-f]{64}$'),
  id_hint text check (id_hint is null or char_length(id_hint) <= 8),
  batch_year smallint check (batch_year is null or batch_year between 1990 and 2100),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz,
  imported_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (college_id, id_hash)
);
create index student_id_roster_claimed_idx on public.student_id_roster (claimed_by) where claimed_by is not null;
create index student_id_roster_college_idx on public.student_id_roster (college_id, created_at desc);
-- No policies and no API grants: reachable only through the SECURITY DEFINER functions below.
alter table public.student_id_roster enable row level security;

-- Failed and successful claim attempts, for lockout. Service role only.
create table public.student_id_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index student_id_attempts_user_idx on public.student_id_attempts (user_id, created_at desc);
alter table public.student_id_attempts enable row level security;

-- ── Claiming (called by the server with the service role after rate limiting) ──
create or replace function public.claim_student_id(p_user uuid, p_college uuid, p_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.student_id_roster%rowtype;
  p public.profiles%rowtype;
  v_id uuid;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.status <> 'active' then raise exception 'account_restricted' using errcode = '42501'; end if;
  if p.college_id is distinct from p_college then raise exception 'wrong_college' using errcode = '22023'; end if;
  if p.account_type not in ('student', 'alumni') then raise exception 'account_type_not_supported' using errcode = '22023'; end if;

  select * into r from public.student_id_roster where college_id = p_college and id_hash = p_hash for update;
  if not found or r.revoked_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.claimed_by is not null and r.claimed_by <> p_user then raise exception 'already_claimed' using errcode = '23505'; end if;
  if exists (select 1 from public.student_id_roster x where x.claimed_by = p_user and x.id <> r.id and x.revoked_at is null) then
    raise exception 'already_verified' using errcode = '23505';
  end if;

  update public.student_id_roster set claimed_by = p_user, claimed_at = coalesce(claimed_at, now()) where id = r.id;
  update public.college_verifications set status = 'cancelled' where user_id = p_user and status in ('pending', 'needs_info');
  insert into public.college_verifications(user_id, college_id, account_type, method)
    values (p_user, p_college, p.account_type, 'student_id') returning id into v_id;
  perform public.finalize_college_verification(v_id, 'approved', null, null, 'auto: student ID matched the college list');
  perform public.notify(p_user, 'moderation_verification', null, 'verification', v_id, jsonb_build_object('approved', true));
  return 'verified';
end; $$;
revoke execute on function public.claim_student_id(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_student_id(uuid, uuid, text) to service_role;

-- ── Staff: import, browse and manage the list ───────────────────────────────
-- The server hashes IDs before they get here; the database never sees a raw ID.
create or replace function public.import_student_roster(p_college uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_added integer; v_total integer;
begin
  if not public.has_permission('roster.manage', p_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_rows' using errcode = '22023'; end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 or v_total > 5000 then raise exception 'invalid_rows' using errcode = '22023'; end if;

  with ins as (
    insert into public.student_id_roster(college_id, id_hash, id_hint, batch_year, imported_by)
    select p_college, x.hash, nullif(left(x.hint, 8), ''), x.year, v_actor
    from jsonb_to_recordset(p_rows) as x(hash text, hint text, year smallint)
    where x.hash ~ '^[0-9a-f]{64}$'
    on conflict (college_id, id_hash) do nothing
    returning 1)
  select count(*) into v_added from ins;

  perform public.write_audit_log(v_actor, 'roster.imported', 'college', p_college::text, p_college,
    jsonb_build_object('submitted', v_total, 'added', v_added));
  return jsonb_build_object('submitted', v_total, 'added', v_added, 'duplicates', v_total - v_added);
end; $$;

create or replace function public.roster_stats(p_college uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('roster.manage', p_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.student_id_roster where college_id = p_college and revoked_at is null),
    'claimed', (select count(*) from public.student_id_roster where college_id = p_college and revoked_at is null and claimed_by is not null),
    'revoked', (select count(*) from public.student_id_roster where college_id = p_college and revoked_at is not null),
    'verified_members', (select count(*) from public.profiles where college_id = p_college and verification_status = 'verified'));
end; $$;

create or replace function public.list_student_roster(p_college uuid, p_status text default 'all', p_q text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, id_hint text, batch_year smallint, status text, claimed_by uuid, full_name text, username text,
  claimed_at timestamptz, revoked_at timestamptz, created_at timestamptz, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('roster.manage', p_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.id, r.id_hint, r.batch_year,
           case when r.revoked_at is not null then 'revoked' when r.claimed_by is not null then 'claimed' else 'unclaimed' end,
           r.claimed_by, p.full_name, p.username, r.claimed_at, r.revoked_at, r.created_at, count(*) over ()
    from public.student_id_roster r left join public.profiles p on p.id = r.claimed_by
    where r.college_id = p_college
      and (p_status = 'all'
           or (p_status = 'revoked' and r.revoked_at is not null)
           or (p_status = 'claimed' and r.revoked_at is null and r.claimed_by is not null)
           or (p_status = 'unclaimed' and r.revoked_at is null and r.claimed_by is null))
      and (nullif(trim(p_q), '') is null or r.id_hint ilike '%' || public.escape_like(trim(p_q)) || '%'
           or p.username ilike '%' || public.escape_like(trim(p_q)) || '%' or p.full_name ilike '%' || public.escape_like(trim(p_q)) || '%')
    order by r.created_at desc, r.id
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end; $$;

-- release: take the ID back from whoever claimed it (the entry stays valid so the rightful owner can claim it)
-- revoke:  the ID is no longer valid at all (e.g. left the college)
-- restore: undo a revoke
create or replace function public.manage_roster_entry(p_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  r public.student_id_roster%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  select * into r from public.student_id_roster where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('roster.manage', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('release', 'revoke', 'restore') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;

  if p_action = 'restore' then
    update public.student_id_roster set revoked_at = null where id = p_id;
  else
    if r.claimed_by is not null then
      update public.profiles set verification_status = 'unverified', verified_at = null
        where id = r.claimed_by and verification_status = 'verified';
      perform public.notify(r.claimed_by, 'moderation_verification', null, 'verification', p_id,
        jsonb_build_object('approved', false, 'reason', 'Your student ID is no longer linked to your account. ' || v_reason));
    end if;
    update public.student_id_roster
      set claimed_by = null, claimed_at = null, revoked_at = case when p_action = 'revoke' then now() else revoked_at end
      where id = p_id;
  end if;
  perform public.write_audit_log(v_actor, 'roster.' || p_action, 'roster_entry', p_id::text, r.college_id,
    jsonb_build_object('reason', v_reason, 'had_member', r.claimed_by is not null));
end; $$;

grant execute on function public.import_student_roster(uuid, jsonb), public.roster_stats(uuid),
  public.list_student_roster(uuid, text, text, integer, integer), public.manage_roster_entry(uuid, text, text)
  to authenticated, service_role;

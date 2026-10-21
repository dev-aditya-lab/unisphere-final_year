-- 0039: Several colleges per member, each with a role, and departments and courses that members add themselves.
--
-- profile_education holds every school or college a member lists (where they study now, studied before, teach or work), with
-- a role at each: student, alumni, faculty or staff. It is self-described, never proof. One entry is the primary one, and the
-- member's profile row keeps mirroring it (college_id, department_id, program_id, graduation_year, account_type), so
-- everything that is scoped by "my college" keeps working unchanged.

create table public.profile_education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  college_id uuid not null references public.colleges(id) on delete cascade,
  role text not null check (role in ('student', 'alumni', 'faculty', 'staff')),
  department_id uuid references public.departments(id) on delete set null,
  program_id uuid references public.academic_programs(id) on delete set null,
  start_year smallint check (start_year is null or start_year between 1960 and 2100),
  end_year smallint check (end_year is null or end_year between 1960 and 2100),
  is_primary boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, college_id, role),
  check (start_year is null or end_year is null or end_year >= start_year)
);
create unique index profile_education_one_primary_idx on public.profile_education (user_id) where is_primary;
create index profile_education_college_idx on public.profile_education (college_id, role);

alter table public.profile_education enable row level security;
grant select on public.profile_education to authenticated;
-- Whoever can see a profile can see its colleges (the profiles policy decides); nobody writes directly.
create policy profile_education_select on public.profile_education for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_education.user_id));

-- Members already connected to a college keep it: it becomes their primary entry.
insert into public.profile_education (user_id, college_id, role, department_id, program_id, end_year, is_primary)
select p.id, p.college_id, coalesce(p.account_type, 'student'), p.department_id, p.program_id, p.graduation_year, true
from public.profiles p where p.college_id is not null
on conflict do nothing;

-- ── Departments and courses members add ─────────────────────────────────────
alter table public.departments
  add column if not exists is_community boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.academic_programs
  add column if not exists is_community boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
create unique index if not exists departments_college_name_key_idx on public.departments (college_id, lower(btrim(name)));
create unique index if not exists academic_programs_college_name_key_idx on public.academic_programs (college_id, lower(btrim(name)));

create or replace function public._clean_academic_name(p text) returns text language plpgsql immutable set search_path = '' as $$
declare v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) < 2 or char_length(v) > 120 then raise exception 'invalid_item_name' using errcode = '22023'; end if;
  if v ~* '(https?://|www\.|<|>|@)' or v ~ '^[0-9[:space:][:punct:]]+$' then raise exception 'invalid_item_name' using errcode = '22023'; end if;
  return v;
end $$;

create or replace function public._academic_slug(p text) returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(p), '[^a-z0-9]+', '-', 'g')), ''), 'item')
$$;

-- A member adds a department their college lacks. The same name (any capitals or spacing) returns the existing one.
create or replace function public.create_community_department(p_college uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid()); v_name text; v_row public.departments%rowtype; v_slug text; v_base text; i int := 1; v_recent int;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.status = 'active') then raise exception 'account_restricted' using errcode = '42501'; end if;
  if not exists (select 1 from public.colleges c where c.id = p_college and c.is_active and c.merged_into is null) then raise exception 'college_not_found' using errcode = 'P0002'; end if;
  v_name := public._clean_academic_name(p_name);
  perform pg_advisory_xact_lock(hashtextextended('department:' || p_college::text || ':' || lower(v_name), 0));
  select * into v_row from public.departments where college_id = p_college and lower(btrim(name)) = lower(v_name);
  if found then
    if not v_row.is_active then raise exception 'item_unavailable' using errcode = '22023'; end if;
    return jsonb_build_object('status', 'existing', 'id', v_row.id, 'name', v_row.name);
  end if;
  select (select count(*) from public.departments where created_by = v_user and created_at > now() - interval '1 day')
       + (select count(*) from public.academic_programs where created_by = v_user and created_at > now() - interval '1 day') into v_recent;
  if v_recent >= 20 then raise exception 'rate_limited' using errcode = '53400'; end if;
  v_base := public._academic_slug(v_name); v_slug := v_base;
  while exists (select 1 from public.departments where college_id = p_college and slug = v_slug) loop i := i + 1; v_slug := v_base || '-' || i; end loop;
  insert into public.departments (college_id, slug, name, is_community, created_by) values (p_college, v_slug, v_name, true, v_user) returning * into v_row;
  return jsonb_build_object('status', 'created', 'id', v_row.id, 'name', v_row.name);
end $$;

create or replace function public.create_community_program(p_college uuid, p_name text, p_department uuid default null, p_level text default 'undergraduate')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid()); v_name text; v_row public.academic_programs%rowtype; v_recent int;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.status = 'active') then raise exception 'account_restricted' using errcode = '42501'; end if;
  if not exists (select 1 from public.colleges c where c.id = p_college and c.is_active and c.merged_into is null) then raise exception 'college_not_found' using errcode = 'P0002'; end if;
  if p_level not in ('diploma', 'undergraduate', 'postgraduate', 'doctoral') then raise exception 'invalid_item_name' using errcode = '22023'; end if;
  if p_department is not null and not exists (select 1 from public.departments d where d.id = p_department and d.college_id = p_college and d.is_active) then
    raise exception 'department_college_mismatch' using errcode = '23514';
  end if;
  v_name := public._clean_academic_name(p_name);
  perform pg_advisory_xact_lock(hashtextextended('program:' || p_college::text || ':' || lower(v_name), 0));
  select * into v_row from public.academic_programs where college_id = p_college and lower(btrim(name)) = lower(v_name);
  if found then
    if not v_row.is_active then raise exception 'item_unavailable' using errcode = '22023'; end if;
    return jsonb_build_object('status', 'existing', 'id', v_row.id, 'name', v_row.name, 'department_id', v_row.department_id);
  end if;
  select (select count(*) from public.departments where created_by = v_user and created_at > now() - interval '1 day')
       + (select count(*) from public.academic_programs where created_by = v_user and created_at > now() - interval '1 day') into v_recent;
  if v_recent >= 20 then raise exception 'rate_limited' using errcode = '53400'; end if;
  insert into public.academic_programs (college_id, department_id, name, degree_level, is_community, created_by)
    values (p_college, p_department, v_name, p_level, true, v_user) returning * into v_row;
  return jsonb_build_object('status', 'created', 'id', v_row.id, 'name', v_row.name, 'department_id', v_row.department_id);
end $$;

-- ── Saving a member's colleges ───────────────────────────────────────────────
-- Replaces the whole list in one step. p_entries is an array of
--   { college_id, role, department_id?, program_id?, start_year?, end_year?, primary? }
-- The primary entry (the one flagged, else the first) is mirrored onto the profile.
create or replace function public.set_my_education(p_entries jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_n int; v_primary int; r record;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'invalid_entries' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_entries);
  if v_n > 8 then raise exception 'too_many_entries' using errcode = '22023'; end if;

  for r in
    select (t.ord - 1)::int as pos, (t.e ->> 'college_id')::uuid as college_id, t.e ->> 'role' as role,
           nullif(t.e ->> 'department_id', '')::uuid as department_id, nullif(t.e ->> 'program_id', '')::uuid as program_id,
           nullif(t.e ->> 'start_year', '')::int as start_year, nullif(t.e ->> 'end_year', '')::int as end_year
    from jsonb_array_elements(p_entries) with ordinality as t(e, ord)
    order by t.ord
  loop
    if r.college_id is null or r.role is null or r.role not in ('student', 'alumni', 'faculty', 'staff') then raise exception 'invalid_entries' using errcode = '22023'; end if;
    -- a college that has since been hidden or merged away may stay on a member's list, but cannot be newly added
    if not exists (select 1 from public.colleges c where c.id = r.college_id and c.is_active and c.merged_into is null)
       and not exists (select 1 from public.profile_education e where e.user_id = v_user and e.college_id = r.college_id) then
      raise exception 'college_not_found' using errcode = 'P0002';
    end if;
    if r.department_id is not null and not exists (select 1 from public.departments d where d.id = r.department_id and d.college_id = r.college_id) then raise exception 'department_college_mismatch' using errcode = '23514'; end if;
    if r.program_id is not null and not exists (select 1 from public.academic_programs a where a.id = r.program_id and a.college_id = r.college_id) then raise exception 'program_college_mismatch' using errcode = '23514'; end if;
    if (r.start_year is not null and r.start_year not between 1960 and 2100) or (r.end_year is not null and r.end_year not between 1960 and 2100) then raise exception 'invalid_years' using errcode = '22023'; end if;
    if r.start_year is not null and r.end_year is not null and r.end_year < r.start_year then raise exception 'invalid_years' using errcode = '22023'; end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_entries) t(e) group by (t.e ->> 'college_id'), (t.e ->> 'role') having count(*) > 1
  ) then raise exception 'duplicate_entry' using errcode = '23505'; end if;

  -- the entry flagged primary, else the first
  select (t.ord - 1)::int into v_primary
    from jsonb_array_elements(p_entries) with ordinality as t(e, ord) where coalesce((t.e ->> 'is_primary')::boolean, false) order by t.ord limit 1;
  v_primary := coalesce(v_primary, 0);

  delete from public.profile_education where user_id = v_user;
  insert into public.profile_education (user_id, college_id, role, department_id, program_id, start_year, end_year, is_primary, position)
    select v_user, (t.e ->> 'college_id')::uuid, t.e ->> 'role', nullif(t.e ->> 'department_id', '')::uuid, nullif(t.e ->> 'program_id', '')::uuid,
           nullif(t.e ->> 'start_year', '')::int, nullif(t.e ->> 'end_year', '')::int, (t.ord - 1)::int = v_primary, (t.ord - 1)::int
    from jsonb_array_elements(p_entries) with ordinality as t(e, ord);

  perform public._sync_profile_from_education(v_user);
end $$;

-- The profile row mirrors the member's primary entry (or nothing, when no college is listed).
create or replace function public._sync_profile_from_education(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare p public.profile_education%rowtype; v_campus uuid;
begin
  select e.* into p from public.profile_education e where e.user_id = p_user and e.is_primary;
  if not found then
    select e.* into p from public.profile_education e where e.user_id = p_user order by e.position, e.created_at limit 1;
    if found then update public.profile_education set is_primary = true where id = p.id; end if;
  end if;
  if found then
    select pr.campus_id into v_campus from public.profiles pr where pr.id = p_user and pr.college_id is not distinct from p.college_id;
    update public.profiles set college_id = p.college_id, department_id = p.department_id, program_id = p.program_id, campus_id = v_campus,
      graduation_year = p.end_year, account_type = p.role where id = p_user;
  else
    update public.profiles set college_id = null, department_id = null, program_id = null, campus_id = null, graduation_year = null, account_type = null where id = p_user;
  end if;
end $$;

-- "This is my college" on a college page: list it (if it is not listed) and make it the main one; null removes the main one.
-- Kept for the college page button; the profile form saves the whole list with set_my_education.
create or replace function public.set_my_college(p_college uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_role text; v_old public.profile_education%rowtype;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_college is null then
    delete from public.profile_education where user_id = v_user and is_primary;
    perform public._sync_profile_from_education(v_user);
    return;
  end if;
  if not exists (select 1 from public.colleges c where c.id = p_college and c.is_active and c.merged_into is null) then
    raise exception 'college_not_found' using errcode = 'P0002';
  end if;
  select * into v_old from public.profile_education where user_id = v_user and college_id = p_college order by is_primary desc, position limit 1;
  update public.profile_education set is_primary = false where user_id = v_user and is_primary and id is distinct from v_old.id;
  if v_old.id is not null then
    update public.profile_education set is_primary = true where id = v_old.id;
  else
    if (select count(*) from public.profile_education where user_id = v_user) >= 8 then raise exception 'too_many_entries' using errcode = '22023'; end if;
    select coalesce(account_type, 'student') into v_role from public.profiles where id = v_user;
    insert into public.profile_education (user_id, college_id, role, is_primary, position)
      values (v_user, p_college, v_role, true, coalesce((select max(position) + 1 from public.profile_education where user_id = v_user), 0));
  end if;
  perform public._sync_profile_from_education(v_user);
end $$;

-- "Remove from my profile" on a college page: every entry for that college goes; another one becomes the main one.
create or replace function public.remove_my_college(p_college uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from public.profile_education where user_id = v_user and college_id = p_college;
  perform public._sync_profile_from_education(v_user);
end $$;

-- Anything else that sets profiles.college_id (an invite code, a staff edit, an older function) still ends up in the member's
-- list: the college becomes their primary entry unless it is already listed.
create or replace function public._mirror_profile_college() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.college_id is null or exists (select 1 from public.profile_education e where e.user_id = new.id and e.college_id = new.college_id) then
    return null;
  end if;
  if (select count(*) from public.profile_education where user_id = new.id) >= 8 then return null; end if;
  update public.profile_education set is_primary = false where user_id = new.id and is_primary;
  insert into public.profile_education (user_id, college_id, role, department_id, program_id, end_year, is_primary, position)
    values (new.id, new.college_id, coalesce(new.account_type, 'student'), new.department_id, new.program_id, new.graduation_year, true,
            coalesce((select max(position) + 1 from public.profile_education where user_id = new.id), 0))
    on conflict do nothing;
  return null;
end $$;
drop trigger if exists trg_profiles_mirror_college on public.profiles;
create trigger trg_profiles_mirror_college after update of college_id on public.profiles
  for each row when (new.college_id is distinct from old.college_id) execute function public._mirror_profile_college();

-- ── Member counts and listing include everyone who lists a college ──────────
create or replace function public.college_member_count(p_college uuid) returns bigint language sql stable security definer set search_path = '' as $$
  select count(distinct u.id) from (
    select p.id from public.profiles p where p.college_id = p_college and p.status in ('active', 'restricted')
    union
    select e.user_id from public.profile_education e join public.profiles p on p.id = e.user_id where e.college_id = p_college and p.status in ('active', 'restricted')
  ) u
$$;

CREATE OR REPLACE FUNCTION public.get_college_by_slug(p_slug text)
 RETURNS TABLE(id uuid, slug text, name text, short_name text, city text, state text, country text, website text, description text, listing_status text, created_at timestamp with time zone, member_count bigint, is_added_by_viewer boolean, merged_into_slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id, c.slug, c.name, c.short_name, c.city, c.state, c.country, c.website, c.description, c.listing_status,
         c.created_at,
         public.college_member_count(c.id),
         (c.created_by is not null and c.created_by = (select auth.uid())),
         (select m.slug from public.colleges m where m.id = c.merged_into)
  from public.colleges c
  where (select auth.uid()) is not null and c.slug = p_slug and (c.is_active or c.merged_into is not null);
$function$;

CREATE OR REPLACE FUNCTION public.list_colleges_directory(p_q text DEFAULT NULL::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, name text, short_name text, city text, state text, country text, listing_status text, member_count bigint, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with base as (
    select c.*,
           public.college_member_count(c.id) as members
    from public.colleges c
    where (select auth.uid()) is not null and c.is_active and c.merged_into is null
      and (nullif(btrim(coalesce(p_q, '')), '') is null
           or c.normalized_name like '%' || public.college_normalize(p_q) || '%'
           or exists (select 1 from public.college_aliases a where a.college_id = c.id and a.alias_key like '%' || public.college_normalize(p_q) || '%')
           or lower(coalesce(c.city, '')) like '%' || public.college_normalize(p_q) || '%')
  )
  select b.id, b.slug, b.name, b.short_name, b.city, b.state, b.country, b.listing_status, b.members,
         count(*) over ()
  from base b
  order by b.members desc, b.name
  limit greatest(1, least(coalesce(p_limit, 30), 60)) offset greatest(coalesce(p_offset, 0), 0);
$function$;

CREATE OR REPLACE FUNCTION public.search_mentors(p_query text DEFAULT NULL::text, p_college uuid DEFAULT NULL::uuid, p_department uuid DEFAULT NULL::uuid, p_grad_from integer DEFAULT NULL::integer, p_grad_to integer DEFAULT NULL::integer, p_skills text[] DEFAULT NULL::text[], p_industry text DEFAULT NULL::text, p_only_mentors boolean DEFAULT false, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, username text, full_name text, avatar_key text, headline text, account_type text, verified boolean, college_id uuid, department_name text, graduation_year smallint, industry text, company text, job_title text, skills text[], mentoring_topics text[], open_to_mentoring boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.id, p.username, p.full_name, p.avatar_key, p.headline, p.account_type, (p.verification_status = 'verified'),
         p.college_id, d.name, p.graduation_year, p.industry, p.company, p.job_title, p.skills, p.mentoring_topics, p.open_to_mentoring
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where p.status = 'active' and p.onboarded_at is not null
    and p.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
    and (p_college is not null or p.account_type = 'alumni' or p.open_to_mentoring or exists (select 1 from public.profile_education e where e.user_id = p.id and e.role = 'alumni'))
    and (not p_only_mentors or p.open_to_mentoring)
    and (p_college is null or (p.college_id = p_college and (p.account_type = 'alumni' or p.open_to_mentoring)) or exists (select 1 from public.profile_education e where e.user_id = p.id and e.college_id = p_college and (e.role = 'alumni' or p.open_to_mentoring)))
    and (p_department is null or p.department_id = p_department)
    and (p_grad_from is null or p.graduation_year >= p_grad_from)
    and (p_grad_to is null or p.graduation_year <= p_grad_to)
    and (p_industry is null or p.industry ilike '%' || public.escape_like(p_industry) || '%')
    and (p_skills is null or exists (select 1 from unnest(p.skills) s where lower(s) = any (select lower(x) from unnest(p_skills) x)))
    and (nullif(trim(coalesce(p_query, '')), '') is null
         or p.search_vector @@ websearch_to_tsquery('simple', p_query)
         or p.full_name ilike '%' || public.escape_like(p_query) || '%'
         or exists (select 1 from public.experience_text_match(p.id, p_query)))
  order by p.open_to_mentoring desc, p.graduation_year desc nulls last, p.full_name
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$function$;

CREATE OR REPLACE FUNCTION public.admin_merge_colleges(p_source uuid, p_target uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_profiles integer;
  v_moved integer := 0;
  n integer;
begin
  if not public.has_permission('colleges.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_source = p_target then raise exception 'invalid_merge' using errcode = '22023'; end if;
  perform 1 from public.colleges where id = p_target and is_active and merged_into is null for update;
  if not found then raise exception 'invalid_merge' using errcode = '22023'; end if;
  perform 1 from public.colleges where id = p_source and merged_into is null for update;
  if not found then raise exception 'invalid_merge' using errcode = '22023'; end if;

  -- Departments and programmes: keep one per name; members of a source department follow it to the same-named
  -- department in the target (or lose the department if there is none).
  update public.profiles p set department_id = t.id
    from public.departments s join public.departments t on t.college_id = p_target and lower(t.name) = lower(s.name)
   where s.college_id = p_source and p.department_id = s.id;
  update public.profiles p set program_id = t.id
    from public.academic_programs s join public.academic_programs t on t.college_id = p_target and lower(t.name) = lower(s.name)
   where s.college_id = p_source and p.program_id = s.id;
  update public.profiles p set department_id = null where department_id in (select id from public.departments where college_id = p_source);
  update public.profiles p set program_id = null where program_id in (select id from public.academic_programs where college_id = p_source);
  update public.profiles p set campus_id = null where campus_id in (select id from public.campuses where college_id = p_source);

  update public.profiles set college_id = p_target where college_id = p_source;
  get diagnostics v_profiles = row_count;
  update public.posts set college_id = p_target where college_id = p_source;
  update public.projects set college_id = p_target where college_id = p_source;
  update public.communities set college_id = p_target where college_id = p_source;
  update public.events set college_id = p_target where college_id = p_source;
  update public.opportunities set college_id = p_target where college_id = p_source;
  update public.reports set college_id = p_target where college_id = p_source;
  update public.feedback_items set college_id = p_target where college_id = p_source;
  update public.moderation_actions set college_id = p_target where college_id = p_source;
  update public.appeals set college_id = p_target where college_id = p_source;
  update public.college_announcements set college_id = p_target where college_id = p_source;
  update public.college_reports set college_id = p_target where college_id = p_source and status = 'open';
  update public.college_reports set duplicate_of = p_target where duplicate_of = p_source;

  update public.college_aliases a set college_id = p_target
   where a.college_id = p_source and not exists (select 1 from public.college_aliases x where x.college_id = p_target and x.alias_key = a.alias_key);
  insert into public.college_aliases (college_id, alias, created_by)
    select p_target, c.name, v_actor from public.colleges c where c.id = p_source
    on conflict (college_id, alias_key) do nothing;

  -- Education entries follow the merge: departments and courses map to the same-named ones in the target, and a member who had
  -- both colleges with the same role keeps one entry (the primary flag is kept if the dropped one had it).
  update public.profile_education e set department_id = t.id
    from public.departments s join public.departments t on t.college_id = p_target and lower(t.name) = lower(s.name)
   where s.college_id = p_source and e.department_id = s.id;
  update public.profile_education e set program_id = t.id
    from public.academic_programs s join public.academic_programs t on t.college_id = p_target and lower(t.name) = lower(s.name)
   where s.college_id = p_source and e.program_id = s.id;
  update public.profile_education set department_id = null where department_id in (select id from public.departments where college_id = p_source);
  update public.profile_education set program_id = null where program_id in (select id from public.academic_programs where college_id = p_source);
  with dropped as (
    delete from public.profile_education e using public.profile_education x
     where e.college_id = p_source and x.college_id = p_target and x.user_id = e.user_id and x.role = e.role
    returning e.user_id, e.is_primary)
  update public.profile_education x set is_primary = true
    from dropped d where d.is_primary and x.user_id = d.user_id and x.college_id = p_target;
  update public.profile_education set college_id = p_target where college_id = p_source;

  update public.colleges set merged_into = p_target, merged_at = now(), is_active = false where id = p_source;

  perform public.write_audit_log(v_actor, 'college.merged', 'college', p_source::text, p_target,
    jsonb_build_object('into', p_target, 'profiles_moved', v_profiles, 'reason', left(p_reason, 300)));
  return jsonb_build_object('profiles_moved', v_profiles);
end;
$function$;

revoke execute on function public._clean_academic_name(text), public._academic_slug(text), public.college_member_count(uuid), public._sync_profile_from_education(uuid), public._mirror_profile_college() from public, anon, authenticated;
revoke execute on function public.create_community_department(uuid, text), public.create_community_program(uuid, text, uuid, text), public.set_my_education(jsonb), public.remove_my_college(uuid) from public, anon;
grant execute on function public.create_community_department(uuid, text), public.create_community_program(uuid, text, uuid, text), public.set_my_education(jsonb), public.remove_my_college(uuid) to authenticated, service_role;

-- 0018: open registration and a community-grown college directory.
--
-- Product change: anyone may join. Nobody has to say what they are, prove who they are, or pick a college.
-- Choosing a college only means "I associate my profile with it": it proves nothing and earns no badge.
--
--   1. Role (student, alumnus, ...) becomes optional, self-declared and separate from authentication.
--   2. The members-only verification gate is removed: every active account may use the network.
--   3. Colleges become a directory members grow: search, add by name with duplicate protection, aliases,
--      correction / duplicate / abuse reports, and an admin merge workflow.
--
-- Existing accounts, colleges, verification records and the optional student-ID roster are all preserved.

-- ── 1. Optional, self-declared role ────────────────────────────────────────
alter table public.profiles alter column account_type drop not null;
alter table public.profiles alter column account_type drop default;
alter table public.college_verifications alter column account_type drop not null;
comment on column public.profiles.account_type is
  'Optional and self-declared ("how I describe myself"). Never proof of anything; verification is separate.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full text;
  v_type text;
  v_base text;
  v_username text;
  i integer := 0;
begin
  v_full := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New member'), 80);
  -- A role is optional. Anything that is not one of the known values is simply "not stated".
  v_type := nullif(new.raw_user_meta_data ->> 'account_type', '');
  if v_type is not null and v_type not in ('student', 'alumni', 'faculty', 'staff') then
    v_type := null;
  end if;

  v_base := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1)));
  v_base := regexp_replace(v_base, '[^a-z0-9_-]+', '-', 'g');
  v_base := regexp_replace(v_base, '[-_]{2,}', '-', 'g');
  v_base := regexp_replace(v_base, '^[-_]+|[-_]+$', '', 'g');
  v_base := left(v_base, 22);
  v_base := regexp_replace(v_base, '[-_]+$', '', 'g');
  if char_length(v_base) < 3 then
    v_base := 'member';
  end if;

  v_username := v_base;
  loop
    exit when public.is_valid_username(v_username)
      and not exists (select 1 from public.reserved_usernames r where r.name = v_username)
      and not exists (select 1 from public.profiles p where p.username = v_username)
      and not exists (select 1 from public.slug_redirects s where s.entity_type = 'user' and s.old_slug = v_username);
    i := i + 1;
    exit when i > 25;
    v_username := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
  end loop;

  insert into public.profiles (id, username, full_name, account_type)
  values (new.id, v_username, v_full, v_type);
  return new;
end;
$$;

-- ── 2. The network is open ─────────────────────────────────────────────────
-- Any active or temporarily restricted account may use it. (Suspended and deactivated accounts may not.)
create or replace function public.can_use_network()
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
grant execute on function public.can_use_network() to authenticated, service_role;

delete from public.system_settings where key = 'college_verification_required';

-- ── 3. College directory ───────────────────────────────────────────────────
-- Name normalisation. `college_normalize` keeps every word (for prefix and fuzzy search); `college_name_key` is the
-- duplicate-detection key: abbreviations expanded, stop words dropped, words de-duplicated and sorted, so
-- "College of Engineering, Ramgarh", "Ramgarh Engg. College" and "ramgarh engineering college" all collide.
create or replace function public.college_normalize(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(lower(replace(coalesce(p, ''), '&', ' and ')), '[^[:alnum:][:space:]]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function public.college_name_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select string_agg(distinct w, ' ' order by w)
    from (
      select case t
               when 'inst' then 'institute' when 'instt' then 'institute' when 'univ' then 'university'
               when 'tech' then 'technology' when 'technological' then 'technology'
               when 'engg' then 'engineering' when 'eng' then 'engineering'
               when 'govt' then 'government' when 'gov' then 'government'
               when 'coll' then 'college' when 'sci' then 'science' when 'mgmt' then 'management'
               when 'st' then 'saint'
               else t end as w
      from unnest(regexp_split_to_array(public.college_normalize(p), ' ')) as t
      where t <> '' and t not in ('the', 'of', 'and', 'in', 'at', 'for', 'a', 'an')
    ) s
  ), '');
$$;

alter table public.colleges
  add column if not exists normalized_name text,
  add column if not exists name_key text,
  add column if not exists listing_status text not null default 'community'
    check (listing_status in ('community', 'verified')),
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists description text check (description is null or char_length(description) <= 500),
  add column if not exists logo_key text,
  add column if not exists merged_into uuid references public.colleges(id) on delete set null,
  add column if not exists merged_at timestamptz;

alter table public.colleges alter column country drop not null;
alter table public.colleges alter column country drop default;

create or replace function public.colleges_set_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_name := public.college_normalize(new.name);
  new.name_key := public.college_name_key(new.name);
  if new.name_key = '' then
    raise exception 'invalid_college_name' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_colleges_keys on public.colleges;
create trigger trg_colleges_keys before insert or update of name on public.colleges
  for each row execute function public.colleges_set_keys();

update public.colleges set name = name;  -- fills normalized_name / name_key for existing rows

-- A college that already had a student-ID roster was set up by staff with the college's own list: that is a real
-- verification process. Everything else is a community listing until staff say otherwise.
update public.colleges c set listing_status = 'verified'
  where exists (select 1 from public.student_id_roster r where r.college_id = c.id);

alter table public.colleges alter column normalized_name set not null;
alter table public.colleges alter column name_key set not null;

create index if not exists colleges_normalized_trgm_idx on public.colleges using gin (normalized_name extensions.gin_trgm_ops) where is_active and merged_into is null;
create index if not exists colleges_name_key_idx on public.colleges (name_key) where merged_into is null;
create index if not exists colleges_status_idx on public.colleges (listing_status, is_active);
-- The same name in the same place is one record (the RPC resolves near matches before this is ever hit).
create unique index if not exists colleges_identity_uidx on public.colleges
  (name_key, coalesce(lower(city), ''), coalesce(lower(state), ''), coalesce(upper(country), ''))
  where merged_into is null;

-- Searchable aliases ("RGEC", "Old name", "Hindi name").
create table if not exists public.college_aliases (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  alias text not null check (char_length(alias) between 2 and 120),
  alias_key text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (college_id, alias_key)
);
create index if not exists college_aliases_key_idx on public.college_aliases (alias_key);
create index if not exists college_aliases_trgm_idx on public.college_aliases using gin (alias_key extensions.gin_trgm_ops);
create or replace function public.college_aliases_set_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.alias_key := public.college_normalize(new.alias);
  if new.alias_key = '' then raise exception 'invalid_alias' using errcode = '22023'; end if;
  return new;
end; $$;
drop trigger if exists trg_college_aliases_key on public.college_aliases;
create trigger trg_college_aliases_key before insert or update of alias on public.college_aliases
  for each row execute function public.college_aliases_set_key();

alter table public.college_aliases enable row level security;
revoke all on public.college_aliases from anon;
grant select on public.college_aliases to authenticated;
grant insert, update, delete on public.college_aliases to authenticated;
create policy college_aliases_select on public.college_aliases for select to authenticated using (true);
create policy college_aliases_manage_ins on public.college_aliases for insert to authenticated
  with check (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null));
create policy college_aliases_manage_upd on public.college_aliases for update to authenticated
  using (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null));
create policy college_aliases_manage_del on public.college_aliases for delete to authenticated
  using (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null));

-- Corrections, duplicates and abuse reports. Anyone signed in may file one; staff review them.
create table if not exists public.college_reports (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('correction', 'duplicate', 'inaccurate', 'abuse')),
  field text check (field is null or field in ('name', 'city', 'state', 'country', 'website', 'description', 'other')),
  proposed_value text check (proposed_value is null or char_length(proposed_value) <= 300),
  duplicate_of uuid references public.colleges(id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  created_at timestamptz not null default now(),
  check (kind <> 'duplicate' or duplicate_of is not null),
  check (duplicate_of is null or duplicate_of <> college_id)
);
create index if not exists college_reports_open_idx on public.college_reports (status, created_at desc);
create index if not exists college_reports_college_idx on public.college_reports (college_id, status);
-- One open report of a kind per person per college, so a report cannot be repeated to spam the queue.
create unique index if not exists college_reports_one_open_uidx on public.college_reports (reporter_id, college_id, kind) where status = 'open';

alter table public.college_reports enable row level security;
revoke all on public.college_reports from anon;
grant select on public.college_reports to authenticated;
create policy college_reports_select on public.college_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null));

-- Moderators and admins can correct directory records without needing full college administration.
insert into public.role_permissions(role, permission) values
  ('global_admin', 'colleges.moderate'),
  ('moderator', 'colleges.moderate')
on conflict do nothing;

-- ── 4. Search ──────────────────────────────────────────────────────────────
create or replace function public.search_colleges(p_q text, p_limit integer default 8)
returns table (
  id uuid, slug text, name text, short_name text, city text, state text, country text,
  listing_status text, member_count bigint, matched_alias text
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select public.college_normalize(p_q) as nq, public.college_name_key(p_q) as kq
  ),
  hits as (
    select c.*,
           (select a.alias from public.college_aliases a
             where a.college_id = c.id and (a.alias_key = q.nq or a.alias_key like q.nq || '%' or extensions.similarity(a.alias_key, q.nq) > 0.5)
             order by (a.alias_key = q.nq) desc, extensions.similarity(a.alias_key, q.nq) desc limit 1) as alias_hit,
           extensions.similarity(c.normalized_name, q.nq) as sim,
           (c.name_key = q.kq) as key_match,
           (c.normalized_name like q.nq || '%') as prefix_match,
           (c.normalized_name like '% ' || q.nq || '%') as word_match
    from public.colleges c, q
    where (select auth.uid()) is not null
      and char_length(q.nq) >= 2
      and c.is_active and c.merged_into is null
  )
  select h.id, h.slug, h.name, h.short_name, h.city, h.state, h.country, h.listing_status,
         (select count(*) from public.profiles p where p.college_id = h.id and p.status in ('active', 'restricted')) as member_count,
         h.alias_hit
  from hits h
  where h.key_match or h.prefix_match or h.word_match or h.sim > 0.3 or h.alias_hit is not null
     or lower(coalesce(h.short_name, '')) = (select nq from q)
  order by h.key_match desc, h.prefix_match desc, (h.alias_hit is not null) desc, h.sim desc,
           (select count(*) from public.profiles p where p.college_id = h.id and p.status in ('active', 'restricted')) desc,
           h.name
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;
revoke execute on function public.search_colleges(text, integer) from public, anon;
grant execute on function public.search_colleges(text, integer) to authenticated, service_role;

-- ── 5. Add a college by name ───────────────────────────────────────────────
-- Returns { status: 'created' | 'existing' | 'similar', college: {...}, candidates: [...] }.
--   existing: the same college is already listed (same normalised name, compatible location): use it.
--   similar : looks close to something listed. The caller may confirm with p_force = true that it is different.
-- Concurrent requests for the same name serialise on an advisory lock, and the unique index is the backstop.
create or replace function public.create_community_college(
  p_name text,
  p_city text default null,
  p_state text default null,
  p_country text default null,
  p_website text default null,
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_state text := nullif(btrim(coalesce(p_state, '')), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_site text := nullif(btrim(coalesce(p_website, '')), '');
  v_key text;
  v_norm text;
  v_slug_base text;
  v_slug text;
  v_existing public.colleges%rowtype;
  v_new public.colleges%rowtype;
  v_candidates jsonb;
  v_recent integer;
  i integer := 0;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.status = 'active') then
    raise exception 'account_restricted' using errcode = '42501';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 160 then
    raise exception 'invalid_college_name' using errcode = '22023';
  end if;
  if v_name ~* '(https?://|www\.|<|>|@)' or v_name ~ '^[0-9[:space:][:punct:]]+$' then
    raise exception 'invalid_college_name' using errcode = '22023';
  end if;
  if v_city is not null and (char_length(v_city) > 80 or v_city ~* '(https?://|<|>)') then raise exception 'invalid_location' using errcode = '22023'; end if;
  if v_state is not null and (char_length(v_state) > 80 or v_state ~* '(https?://|<|>)') then raise exception 'invalid_location' using errcode = '22023'; end if;
  if v_country is not null and (char_length(v_country) > 80 or v_country ~* '(https?://|<|>)') then raise exception 'invalid_location' using errcode = '22023'; end if;
  if v_site is not null and (char_length(v_site) > 300 or v_site !~* '^https?://[^\s]+$') then raise exception 'invalid_website' using errcode = '22023'; end if;

  v_key := public.college_name_key(v_name);
  v_norm := public.college_normalize(v_name);
  if v_key = '' then raise exception 'invalid_college_name' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('college:' || v_key, 0));

  -- 1. The same college, possibly with a different spelling or word order.
  select c.* into v_existing from public.colleges c
   where c.name_key = v_key and c.is_active and c.merged_into is null
     and (v_city is null or c.city is null or lower(c.city) = lower(v_city))
   order by (lower(coalesce(c.city, '')) = lower(coalesce(v_city, ''))) desc, c.created_at
   limit 1;
  if found then
    return jsonb_build_object('status', 'existing', 'college', to_jsonb(v_existing) - 'verification_mode' - 'created_by' - 'merged_into' - 'merged_at');
  end if;

  -- 2. An alias that is exactly this name.
  select c.* into v_existing from public.college_aliases a
    join public.colleges c on c.id = a.college_id and c.is_active and c.merged_into is null
   where a.alias_key = v_norm limit 1;
  if found then
    return jsonb_build_object('status', 'existing', 'college', to_jsonb(v_existing) - 'verification_mode' - 'created_by' - 'merged_into' - 'merged_at');
  end if;

  -- 3. Near matches: ask the member to confirm unless they already have.
  if not p_force then
    select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) into v_candidates from (
      select c.id, c.slug, c.name, c.city, c.state, c.country, c.listing_status
      from public.colleges c
      where c.is_active and c.merged_into is null and extensions.similarity(c.normalized_name, v_norm) >= 0.55
        -- the same name in a clearly different city is a different college, not something to confirm
        and not (c.name_key = v_key and v_city is not null and c.city is not null and lower(c.city) <> lower(v_city))
      order by extensions.similarity(c.normalized_name, v_norm) desc limit 5
    ) m;
    if jsonb_array_length(v_candidates) > 0 then
      return jsonb_build_object('status', 'similar', 'candidates', v_candidates);
    end if;
  end if;

  -- 4. A reasonable ceiling per member, so the directory cannot be flooded from one account.
  select count(*) into v_recent from public.colleges where created_by = v_user and created_at > now() - interval '24 hours';
  if v_recent >= 5 then raise exception 'rate_limited' using errcode = '53400'; end if;

  v_slug_base := left(trim(both '-' from regexp_replace(lower(v_norm), '[^a-z0-9]+', '-', 'g')), 60);
  if v_slug_base = '' then v_slug_base := 'college'; end if;
  v_slug := v_slug_base;
  while exists (select 1 from public.colleges where slug = v_slug) loop
    i := i + 1;
    v_slug := left(v_slug_base, 52) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    exit when i > 20;
  end loop;

  begin
    insert into public.colleges (slug, name, city, state, country, website, listing_status, created_by, is_active)
    values (v_slug, v_name, v_city, v_state, v_country, v_site, 'community', v_user, true)
    returning * into v_new;
  exception when unique_violation then
    -- Lost a race with an identical record: hand back the winner.
    select c.* into v_existing from public.colleges c
     where c.name_key = v_key and c.merged_into is null
       and coalesce(lower(c.city), '') = coalesce(lower(v_city), '') order by c.created_at limit 1;
    if found then
      return jsonb_build_object('status', 'existing', 'college', to_jsonb(v_existing) - 'verification_mode' - 'created_by' - 'merged_into' - 'merged_at');
    end if;
    raise;
  end;

  return jsonb_build_object('status', 'created', 'college', to_jsonb(v_new) - 'verification_mode' - 'created_by' - 'merged_into' - 'merged_at');
end;
$$;
revoke execute on function public.create_community_college(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_community_college(text, text, text, text, text, boolean) to authenticated, service_role;

-- ── 6. Directory pages ─────────────────────────────────────────────────────
create or replace function public.get_college_by_slug(p_slug text)
returns table (
  id uuid, slug text, name text, short_name text, city text, state text, country text, website text,
  description text, listing_status text, created_at timestamptz, member_count bigint, is_added_by_viewer boolean,
  merged_into_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.slug, c.name, c.short_name, c.city, c.state, c.country, c.website, c.description, c.listing_status,
         c.created_at,
         (select count(*) from public.profiles p where p.college_id = c.id and p.status in ('active', 'restricted')),
         (c.created_by is not null and c.created_by = (select auth.uid())),
         (select m.slug from public.colleges m where m.id = c.merged_into)
  from public.colleges c
  where (select auth.uid()) is not null and c.slug = p_slug and (c.is_active or c.merged_into is not null);
$$;
revoke execute on function public.get_college_by_slug(text) from public, anon;
grant execute on function public.get_college_by_slug(text) to authenticated, service_role;

create or replace function public.list_colleges_directory(p_q text default null, p_limit integer default 30, p_offset integer default 0)
returns table (
  id uuid, slug text, name text, short_name text, city text, state text, country text,
  listing_status text, member_count bigint, total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select c.*,
           (select count(*) from public.profiles p where p.college_id = c.id and p.status in ('active', 'restricted')) as members
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
$$;
revoke execute on function public.list_colleges_directory(text, integer, integer) from public, anon;
grant execute on function public.list_colleges_directory(text, integer, integer) to authenticated, service_role;

-- ── 7. Reporting ───────────────────────────────────────────────────────────
create or replace function public.report_college(
  p_college uuid, p_kind text, p_field text default null, p_proposed text default null,
  p_duplicate_of uuid default null, p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_recent integer;
begin
  if v_user is null or not public.can_use_network() then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_kind not in ('correction', 'duplicate', 'inaccurate', 'abuse') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if not exists (select 1 from public.colleges c where c.id = p_college and (c.is_active or c.merged_into is not null)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_kind = 'duplicate' and (p_duplicate_of is null or p_duplicate_of = p_college
      or not exists (select 1 from public.colleges d where d.id = p_duplicate_of and d.is_active)) then
    raise exception 'invalid_duplicate' using errcode = '22023';
  end if;
  if p_kind = 'correction' and (nullif(btrim(coalesce(p_proposed, '')), '') is null or p_field is null) then
    raise exception 'invalid_correction' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.college_reports where reporter_id = v_user and created_at > now() - interval '24 hours';
  if v_recent >= 20 then raise exception 'rate_limited' using errcode = '53400'; end if;

  insert into public.college_reports (college_id, reporter_id, kind, field, proposed_value, duplicate_of, note)
  values (p_college, v_user, p_kind, p_field, left(nullif(btrim(coalesce(p_proposed, '')), ''), 300), p_duplicate_of, left(nullif(btrim(coalesce(p_note, '')), ''), 1000))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'already_reported' using errcode = '23505';
end;
$$;
revoke execute on function public.report_college(uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.report_college(uuid, text, text, text, uuid, text) to authenticated, service_role;

-- ── 8. Administration ──────────────────────────────────────────────────────
create or replace function public.admin_list_college_directory(
  p_status text default 'all', p_q text default null, p_only_reported boolean default false,
  p_limit integer default 30, p_offset integer default 0
) returns table (
  id uuid, slug text, name text, short_name text, city text, state text, country text, website text,
  listing_status text, is_active boolean, merged_into uuid, created_at timestamptz,
  created_by_username text, member_count bigint, open_reports bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with base as (
    select c.*,
      (select count(*) from public.profiles p where p.college_id = c.id and p.status in ('active', 'restricted')) as members,
      (select count(*) from public.college_reports r where r.college_id = c.id and r.status = 'open') as reports,
      (select pr.username from public.profiles pr where pr.id = c.created_by) as author
    from public.colleges c
    where (p_status = 'all'
           or (p_status = 'community' and c.listing_status = 'community' and c.is_active and c.merged_into is null)
           or (p_status = 'verified' and c.listing_status = 'verified')
           or (p_status = 'hidden' and not c.is_active and c.merged_into is null)
           or (p_status = 'merged' and c.merged_into is not null))
      and (nullif(btrim(coalesce(p_q, '')), '') is null
           or c.normalized_name like '%' || public.college_normalize(p_q) || '%'
           or lower(c.slug) like '%' || lower(btrim(p_q)) || '%')
  )
  select b.id, b.slug, b.name, b.short_name, b.city, b.state, b.country, b.website, b.listing_status, b.is_active,
         b.merged_into, b.created_at, b.author, b.members, b.reports, count(*) over ()
  from base b
  where not p_only_reported or b.reports > 0
  order by b.reports desc, b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100)) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke execute on function public.admin_list_college_directory(text, text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_list_college_directory(text, text, boolean, integer, integer) to authenticated, service_role;

create or replace function public.admin_list_college_reports(p_status text default 'open', p_limit integer default 50)
returns table (
  id uuid, college_id uuid, college_name text, college_slug text, kind text, field text, proposed_value text,
  duplicate_of uuid, duplicate_name text, note text, status text, reporter_username text, created_at timestamptz,
  resolution_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select r.id, r.college_id, c.name, c.slug, r.kind, r.field, r.proposed_value, r.duplicate_of, d.name, r.note, r.status,
         p.username, r.created_at, r.resolution_note
  from public.college_reports r
    join public.colleges c on c.id = r.college_id
    left join public.colleges d on d.id = r.duplicate_of
    left join public.profiles p on p.id = r.reporter_id
  where (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke execute on function public.admin_list_college_reports(text, integer) from public, anon;
grant execute on function public.admin_list_college_reports(text, integer) to authenticated, service_role;

create or replace function public.admin_resolve_college_report(p_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  r public.college_reports%rowtype;
begin
  if not (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('accepted', 'rejected') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into r from public.college_reports where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'open' then raise exception 'already_decided' using errcode = '23514'; end if;

  -- Accepting a field correction applies it.
  if p_decision = 'accepted' and r.kind = 'correction' then
    update public.colleges set
      name = case when r.field = 'name' then r.proposed_value else name end,
      city = case when r.field = 'city' then r.proposed_value else city end,
      state = case when r.field = 'state' then r.proposed_value else state end,
      country = case when r.field = 'country' then r.proposed_value else country end,
      website = case when r.field = 'website' and r.proposed_value ~* '^https?://[^\s]+$' then r.proposed_value else website end,
      description = case when r.field = 'description' then left(r.proposed_value, 500) else description end
    where id = r.college_id;
  end if;

  update public.college_reports
     set status = p_decision, resolved_by = v_actor, resolved_at = now(), resolution_note = left(p_note, 500)
   where id = p_id;
  perform public.write_audit_log(v_actor, 'college_report.' || p_decision, 'college', r.college_id::text, null,
    jsonb_build_object('report_id', p_id, 'kind', r.kind, 'field', r.field));
end;
$$;
revoke execute on function public.admin_resolve_college_report(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_college_report(uuid, text, text) to authenticated, service_role;

-- Edit a directory record (moderators and admins): fields, listing status, visibility. Hiding keeps the record and
-- its members' links; it only removes it from search.
create or replace function public.admin_update_college_listing(
  p_id uuid, p_name text, p_short_name text, p_city text, p_state text, p_country text, p_website text,
  p_description text, p_listing_status text, p_is_active boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- "Verified" is a claim about the record, so only full college administrators may make it.
  if p_listing_status = 'verified' and not public.has_permission('colleges.manage', null) then
    if not exists (select 1 from public.colleges where id = p_id and listing_status = 'verified') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  if p_listing_status not in ('community', 'verified') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 3 then raise exception 'invalid_college_name' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_website, '')), '') is not null and p_website !~* '^https?://[^\s]+$' then raise exception 'invalid_website' using errcode = '22023'; end if;

  update public.colleges set
    name = btrim(p_name),
    short_name = nullif(btrim(coalesce(p_short_name, '')), ''),
    city = nullif(btrim(coalesce(p_city, '')), ''),
    state = nullif(btrim(coalesce(p_state, '')), ''),
    country = nullif(btrim(coalesce(p_country, '')), ''),
    website = nullif(btrim(coalesce(p_website, '')), ''),
    description = left(nullif(btrim(coalesce(p_description, '')), ''), 500),
    listing_status = p_listing_status,
    is_active = p_is_active
  where id = p_id and merged_into is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  perform public.write_audit_log(v_actor, 'college.listing_updated', 'college', p_id::text, null,
    jsonb_build_object('listing_status', p_listing_status, 'is_active', p_is_active));
end;
$$;
revoke execute on function public.admin_update_college_listing(uuid, text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_update_college_listing(uuid, text, text, text, text, text, text, text, text, boolean) to authenticated, service_role;

create or replace function public.admin_add_college_alias(p_college uuid, p_alias text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.college_aliases (college_id, alias, created_by) values (p_college, btrim(p_alias), (select auth.uid()))
  on conflict (college_id, alias_key) do nothing;
end; $$;
revoke execute on function public.admin_add_college_alias(uuid, text) from public, anon;
grant execute on function public.admin_add_college_alias(uuid, text) to authenticated, service_role;

-- Merge a duplicate into the record that should stay. Everything that pointed at the duplicate follows the member
-- to the survivor; nothing is deleted, the duplicate is kept as a redirect (merged_into) so old links still work.
create or replace function public.admin_merge_colleges(p_source uuid, p_target uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  update public.colleges set merged_into = p_target, merged_at = now(), is_active = false where id = p_source;

  perform public.write_audit_log(v_actor, 'college.merged', 'college', p_source::text, p_target,
    jsonb_build_object('into', p_target, 'profiles_moved', v_profiles, 'reason', left(p_reason, 300)));
  return jsonb_build_object('profiles_moved', v_profiles);
end;
$$;
revoke execute on function public.admin_merge_colleges(uuid, uuid, text) from public, anon;
grant execute on function public.admin_merge_colleges(uuid, uuid, text) to authenticated, service_role;

-- A member's own college association: change or clear it, nothing else. (profiles.college_id is already a column
-- members may write; this RPC adds the check that the target is a real, listed college and records the choice.)
create or replace function public.set_my_college(p_college uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_college is not null and not exists (
    select 1 from public.colleges c where c.id = p_college and c.is_active and c.merged_into is null
  ) then
    raise exception 'college_not_found' using errcode = 'P0002';
  end if;
  update public.profiles set college_id = p_college, department_id = null, program_id = null, campus_id = null
   where id = v_user and college_id is distinct from p_college;
end;
$$;
revoke execute on function public.set_my_college(uuid) from public, anon;
grant execute on function public.set_my_college(uuid) to authenticated, service_role;

-- The directory is for members: signed-out visitors never need it (registration no longer asks for a college),
-- and community-added names should not be scrapeable anonymously.
revoke select on public.colleges, public.campuses, public.departments, public.academic_programs from anon;

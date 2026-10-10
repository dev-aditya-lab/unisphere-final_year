-- 0002: multi-college structure, profiles, social graph primitives
-- Policies and grants for these tables live in 0004 (they need the RBAC helpers).

-- ── Colleges ────────────────────────────────────────────────────────────────
create table public.colleges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 160),
  short_name text check (short_name is null or char_length(short_name) <= 24),
  city text,
  state text,
  country text not null default 'IN',
  website text,
  -- How members of this college can be verified. A matching email domain only
  -- ever proves membership; it never grants any administrative privilege.
  verification_mode text not null default 'manual'
    check (verification_mode in ('email_domain', 'manual', 'invite')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_colleges_updated before update on public.colleges
  for each row execute function public.set_updated_at();

create table public.college_domains (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  domain text not null unique check (domain = lower(domain) and domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'),
  -- Account types this domain can prove (e.g. students.college.edu -> student).
  audiences text[] not null default '{student}'
    check (audiences <@ array['student','alumni','faculty','staff']::text[] and cardinality(audiences) > 0),
  created_at timestamptz not null default now()
);
create index college_domains_college_idx on public.college_domains(college_id);

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  city text,
  created_at timestamptz not null default now(),
  unique (college_id, name)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  code text,
  created_at timestamptz not null default now(),
  unique (college_id, slug)
);

create table public.academic_programs (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  degree_level text not null default 'undergraduate'
    check (degree_level in ('diploma', 'undergraduate', 'postgraduate', 'doctoral')),
  duration_years smallint check (duration_years between 1 and 8),
  created_at timestamptz not null default now(),
  unique (college_id, name)
);
create index academic_programs_department_idx on public.academic_programs(department_id);

-- ── Reserved names and slug history ─────────────────────────────────────────
create table public.reserved_usernames (
  name text primary key check (name = lower(name))
);

insert into public.reserved_usernames(name) values
  ('admin'),('administrator'),('root'),('system'),('support'),('help'),('staff'),('moderator'),('mod'),
  ('unisphere'),('official'),('security'),('abuse'),('postmaster'),('webmaster'),('noreply'),('no-reply'),
  ('api'),('app'),('auth'),('login'),('logout'),('register'),('signup'),('signin'),('settings'),('feed'),
  ('explore'),('search'),('ideas'),('projects'),('posts'),('events'),('clubs'),('communities'),('opportunities'),
  ('connections'),('messages'),('notifications'),('bookmarks'),('about'),('features'),('guidelines'),
  ('privacy'),('terms'),('contact'),('verify-email'),('forgot-password'),('reset-password'),('onboarding'),
  ('alumni'),('mentors'),('mentorship'),('me'),('null'),('undefined'),('new'),('edit'),('delete'),('static'),
  ('assets'),('public'),('sitemap'),('robots'),('llms'),('favicon'),('www'),('mail'),('ftp'),('status'),('blog');

-- Old usernames / slugs keep resolving (and are held for a while so they cannot be hijacked).
create table public.slug_redirects (
  entity_type text not null check (entity_type in ('user', 'project', 'community', 'event', 'post')),
  old_slug text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (entity_type, old_slug)
);
create index slug_redirects_entity_idx on public.slug_redirects(entity_type, entity_id);

-- ── Profiles ────────────────────────────────────────────────────────────────
create or replace function public.is_valid_username(u text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select u is not null
     and u ~ '^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$'
     and u !~ '[_-]{2}';
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null check (char_length(full_name) between 1 and 80),
  headline text check (headline is null or char_length(headline) <= 120),
  bio text check (bio is null or char_length(bio) <= 600),
  account_type text not null default 'student'
    check (account_type in ('student', 'alumni', 'faculty', 'staff')),

  college_id uuid references public.colleges(id) on delete set null,
  campus_id uuid references public.campuses(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  program_id uuid references public.academic_programs(id) on delete set null,
  graduation_year smallint check (graduation_year is null or graduation_year between 1960 and 2100),

  skills text[] not null default '{}' check (cardinality(skills) <= 30),
  interests text[] not null default '{}' check (cardinality(interests) <= 30),
  avatar_key text,
  cover_key text,
  github_url text,
  portfolio_url text,
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),

  -- collaboration
  open_to_collaboration boolean not null default false,
  preferred_roles text[] not null default '{}' check (cardinality(preferred_roles) <= 10),
  availability text check (availability is null or availability in ('few_hours', 'part_time', 'full_time', 'weekends')),

  -- mentoring (strictly opt-in)
  open_to_mentoring boolean not null default false,
  mentoring_topics text[] not null default '{}' check (cardinality(mentoring_topics) <= 10),
  industry text check (industry is null or char_length(industry) <= 80),
  company text check (company is null or char_length(company) <= 80),
  job_title text check (job_title is null or char_length(job_title) <= 80),

  -- privacy
  visibility text not null default 'college'
    check (visibility in ('public', 'college', 'connections', 'private')),
  allow_messages_from text not null default 'connections'
    check (allow_messages_from in ('everyone', 'college', 'connections', 'nobody')),
  show_class boolean not null default false,

  -- trust & moderation state: never writable by the user (see column grants in 0004)
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verified_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'restricted', 'suspended', 'deactivated', 'deleted')),
  restricted_until timestamptz,

  -- denormalised counters, maintained by triggers
  connection_count integer not null default 0 check (connection_count >= 0),
  follower_count integer not null default 0 check (follower_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),

  onboarded_at timestamptz,
  username_changed_at timestamptz,
  last_seen_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_college_idx on public.profiles(college_id) where status in ('active', 'restricted');
create index profiles_search_idx on public.profiles using gin (search_vector);
create index profiles_username_trgm_idx on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_fullname_trgm_idx on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index profiles_skills_idx on public.profiles using gin (skills);
create index profiles_interests_idx on public.profiles using gin (interests);
create index profiles_collab_idx on public.profiles(college_id) where open_to_collaboration;
create index profiles_mentor_idx on public.profiles(college_id) where open_to_mentoring;

-- Class / semester is optional and can be hidden, so it lives in its own table with its own policy.
create table public.profile_class_info (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_year smallint check (current_year between 1 and 8),
  current_semester smallint check (current_semester between 1 and 16),
  updated_at timestamptz not null default now()
);

create table public.profile_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 500),
  achieved_on date,
  url text,
  created_at timestamptz not null default now()
);
create index profile_achievements_user_idx on public.profile_achievements(user_id);

create table public.profile_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'work' check (kind in ('work', 'internship', 'research', 'volunteer')),
  title text not null check (char_length(title) between 2 and 120),
  organization text not null check (char_length(organization) between 1 and 120),
  start_date date,
  end_date date,
  description text check (description is null or char_length(description) <= 800),
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index profile_experiences_user_idx on public.profile_experiences(user_id);

-- ── Social graph primitives ─────────────────────────────────────────────────
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows(following_id);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 300),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);
-- At most one pending request per pair, regardless of direction.
create unique index connection_requests_pending_pair_idx
  on public.connection_requests (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status = 'pending';
create index connection_requests_recipient_idx on public.connection_requests(recipient_id, status);
create index connection_requests_requester_idx on public.connection_requests(requester_id, status);

create table public.connections (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index connections_user_b_idx on public.connections(user_b);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks(blocked_id);

-- ── Relationship helpers (SECURITY DEFINER so RLS policies can call them) ───
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.user_a = least(a, b) and c.user_b = greatest(a, b)
  );
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;

grant execute on function public.are_connected(uuid, uuid), public.is_blocked_between(uuid, uuid)
  to authenticated, service_role;

-- ── Profile triggers ────────────────────────────────────────────────────────
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_user boolean := public.jwt_role() = 'authenticated';
begin
  -- Username rules -----------------------------------------------------------
  if tg_op = 'INSERT' or new.username is distinct from old.username then
    if not public.is_valid_username(new.username) then
      raise exception 'invalid_username' using errcode = '22023';
    end if;
    if exists (select 1 from public.reserved_usernames r where r.name = new.username) then
      raise exception 'reserved_username' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.slug_redirects s
      where s.entity_type = 'user' and s.old_slug = new.username and s.entity_id <> new.id
        and s.created_at > now() - interval '90 days'
    ) then
      raise exception 'username_recently_released' using errcode = '23505';
    end if;

    if tg_op = 'UPDATE' then
      if v_is_user and old.username_changed_at is not null
         and old.username_changed_at > now() - interval '14 days' then
        raise exception 'username_cooldown' using errcode = '22023';
      end if;
      insert into public.slug_redirects(entity_type, old_slug, entity_id)
        values ('user', old.username, old.id)
        on conflict (entity_type, old_slug) do update set entity_id = excluded.entity_id, created_at = now();
      delete from public.slug_redirects where entity_type = 'user' and old_slug = new.username;
      new.username_changed_at := now();
    end if;
  end if;

  -- Verification is tied to the college and account type it was granted for.
  if tg_op = 'UPDATE' and v_is_user
     and (new.college_id is distinct from old.college_id or new.account_type is distinct from old.account_type)
     and old.verification_status in ('verified', 'pending') then
    new.verification_status := 'unverified';
    new.verified_at := null;
  end if;

  -- Department / program / campus must belong to the selected college.
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.college_id is not distinct from new.college_id
  ) then
    raise exception 'department_college_mismatch' using errcode = '23514';
  end if;
  if new.program_id is not null and not exists (
    select 1 from public.academic_programs p where p.id = new.program_id and p.college_id is not distinct from new.college_id
  ) then
    raise exception 'program_college_mismatch' using errcode = '23514';
  end if;
  if new.campus_id is not null and not exists (
    select 1 from public.campuses c where c.id = new.campus_id and c.college_id is not distinct from new.college_id
  ) then
    raise exception 'campus_college_mismatch' using errcode = '23514';
  end if;

  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.full_name, '') || ' ' || coalesce(new.username, '')), 'A') ||
    setweight(to_tsvector('simple',
      coalesce(new.headline, '') || ' ' ||
      coalesce(array_to_string(new.skills, ' '), '') || ' ' ||
      coalesce(array_to_string(new.interests, ' '), '') || ' ' ||
      coalesce(new.industry, '') || ' ' || coalesce(new.company, '') || ' ' || coalesce(new.job_title, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.bio, '')), 'C');

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- Create a profile row automatically for every new auth user. Only whitelisted,
-- non-privileged metadata is honoured (roles/privileges can never come from here).
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
  v_full := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New user'), 80);
  v_type := coalesce(new.raw_user_meta_data ->> 'account_type', 'student');
  if v_type not in ('student', 'alumni', 'faculty', 'staff') then
    v_type := 'student';
  end if;

  v_base := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1)));
  v_base := regexp_replace(v_base, '[^a-z0-9_-]+', '-', 'g');
  v_base := regexp_replace(v_base, '[-_]{2,}', '-', 'g');
  v_base := regexp_replace(v_base, '^[-_]+|[-_]+$', '', 'g');
  v_base := left(v_base, 22);
  v_base := regexp_replace(v_base, '[-_]+$', '', 'g');
  if char_length(v_base) < 3 then
    v_base := 'student';
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Public helper used by the sign-up form for live availability feedback.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_valid_username(lower(p_username))
    and not exists (select 1 from public.reserved_usernames r where r.name = lower(p_username))
    and not exists (select 1 from public.profiles p where p.username = lower(p_username))
    and not exists (
      select 1 from public.slug_redirects s
      where s.entity_type = 'user' and s.old_slug = lower(p_username)
        and s.created_at > now() - interval '90 days'
    );
$$;
grant execute on function public.username_available(text) to anon, authenticated, service_role;

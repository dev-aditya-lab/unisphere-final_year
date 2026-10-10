-- 0009: projects, teams, join requests, invitations, teammate matching, mentorship

-- ── Tables ──────────────────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  college_id uuid references public.colleges(id) on delete set null, -- copied from the owner
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 3 and 100),
  tagline text check (tagline is null or char_length(tagline) <= 160),
  problem text check (problem is null or char_length(problem) <= 3000),
  goals text[] not null default '{}' check (cardinality(goals) <= 8),
  solution text check (solution is null or char_length(solution) <= 3000),
  tech_stack text[] not null default '{}' check (cardinality(tech_stack) <= 15),
  required_skills text[] not null default '{}' check (cardinality(required_skills) <= 15),
  team_size smallint not null default 4 check (team_size between 1 and 30),
  status text not null default 'idea' check (status in ('idea', 'planning', 'in_progress', 'completed', 'paused')),
  repo_url text,
  demo_url text,
  visibility text not null default 'college' check (visibility in ('public', 'college', 'private')),
  looking_for_members boolean not null default false,
  member_count integer not null default 1 check (member_count >= 0),
  search_vector tsvector,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects(owner_id) where deleted_at is null;
create index projects_college_idx on public.projects(college_id, created_at desc) where deleted_at is null;
create index projects_search_idx on public.projects using gin (search_vector);
create index projects_skills_idx on public.projects using gin (required_skills);
create index projects_open_idx on public.projects(created_at desc) where deleted_at is null and looking_for_members;

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  title text check (title is null or char_length(title) <= 60),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members(user_id);
-- exactly one owner per project
create unique index project_one_owner_idx on public.project_members(project_id) where role = 'owner';

create table public.project_open_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 60),
  description text check (description is null or char_length(description) <= 400),
  skills text[] not null default '{}' check (cardinality(skills) <= 10),
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);
create index project_open_roles_project_idx on public.project_open_roles(project_id);

create table public.project_join_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid references public.project_open_roles(id) on delete set null,
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index project_join_one_pending_idx on public.project_join_requests(project_id, user_id) where status = 'pending';
create index project_join_project_idx on public.project_join_requests(project_id, status);
create index project_join_user_idx on public.project_join_requests(user_id, status);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  role_label text check (role_label is null or char_length(role_label) <= 60),
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index project_invite_one_pending_idx on public.project_invitations(project_id, invitee_id) where status = 'pending';
create index project_invite_invitee_idx on public.project_invitations(invitee_id, status);

create table public.mentorship_requests (
  id uuid primary key default gen_random_uuid(),
  mentee_id uuid not null references public.profiles(id) on delete cascade,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  topic text check (topic is null or char_length(topic) <= 100),
  message text not null check (char_length(message) between 10 and 600),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  response_message text check (response_message is null or char_length(response_message) <= 500),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (mentee_id <> mentor_id)
);
create unique index mentorship_one_pending_idx on public.mentorship_requests(mentee_id, mentor_id) where status = 'pending';
create index mentorship_mentor_idx on public.mentorship_requests(mentor_id, status);
create index mentorship_mentee_idx on public.mentorship_requests(mentee_id, status);

alter table public.posts add constraint posts_project_fk foreign key (project_id) references public.projects(id) on delete set null;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.is_project_member(p_project uuid, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = coalesce(p_user, (select auth.uid())));
$$;

create or replace function public.is_project_manager(p_project uuid, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = coalesce(p_user, (select auth.uid())) and m.role in ('owner', 'manager')
  );
$$;

-- Single source of truth for project visibility.
create or replace function public.can_view_project(p_id uuid, p_owner uuid, p_college uuid, p_visibility text, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    public.is_project_member(p_id)
    or (
      exists (select 1 from public.profiles o where o.id = p_owner and o.status in ('active', 'restricted'))
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_owner and b.blocked_id = (select auth.uid())) or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_owner))
      and (
        p_visibility = 'public'
        or ((select auth.uid()) is not null and p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
      )
    )
  ) or (p_deleted is null and public.has_permission('reports.view', p_college));
$$;
grant execute on function public.is_project_member(uuid, uuid), public.is_project_manager(uuid, uuid),
  public.can_view_project(uuid, uuid, uuid, text, timestamptz) to anon, authenticated, service_role;

-- ── Triggers ────────────────────────────────────────────────────────────────
create or replace function public.projects_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select college_id into new.college_id from public.profiles where id = new.owner_id;
    new.member_count := 1;
  end if;
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.name, '') || ' ' || coalesce(new.tagline, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.problem, '') || ' ' || coalesce(new.solution, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(new.tech_stack, ' '), '') || ' ' || coalesce(array_to_string(new.required_skills, ' '), '')), 'B');
  new.updated_at := now();
  return new;
end; $$;
create trigger trg_projects_before_write before insert or update on public.projects
  for each row execute function public.projects_before_write();

create or replace function public.projects_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members(project_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return null;
end; $$;
create trigger trg_projects_owner_member after insert on public.projects
  for each row execute function public.projects_after_insert();

create or replace function public.project_members_counter()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project uuid := coalesce(new.project_id, old.project_id);
begin
  update public.projects set member_count = (select count(*) from public.project_members where project_id = v_project) where id = v_project;
  return null;
end; $$;
create trigger trg_project_members_counter after insert or delete on public.project_members
  for each row execute function public.project_members_counter();

-- ── RPCs: every membership change goes through here ─────────────────────────
create or replace function public._assert_active_member()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.can_contribute() then raise exception 'account_restricted' using errcode = '42501'; end if;
  return v;
end; $$;

create or replace function public.request_to_join_project(p_project uuid, p_role uuid default null, p_message text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); v_proj public.projects%rowtype; v_id uuid;
begin
  select * into v_proj from public.projects where id = p_project;
  if not found or not public.can_view_project(v_proj.id, v_proj.owner_id, v_proj.college_id, v_proj.visibility, v_proj.deleted_at) then
    raise exception 'project_unavailable' using errcode = 'P0002';
  end if;
  if not v_proj.looking_for_members then raise exception 'not_recruiting' using errcode = '22023'; end if;
  if public.is_project_member(p_project, v_me) then raise exception 'already_member' using errcode = '23505'; end if;
  if v_proj.member_count >= v_proj.team_size then raise exception 'team_full' using errcode = '22023'; end if;
  if p_role is not null and not exists (select 1 from public.project_open_roles r where r.id = p_role and r.project_id = p_project and r.is_open) then
    raise exception 'role_unavailable' using errcode = '22023';
  end if;
  begin
    insert into public.project_join_requests(project_id, user_id, role_id, message)
    values (p_project, v_me, p_role, nullif(left(trim(coalesce(p_message, '')), 500), '')) returning id into v_id;
  exception when unique_violation then raise exception 'already_requested' using errcode = '23505'; end;
  return v_id;
end; $$;

create or replace function public.respond_join_request(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); r public.project_join_requests%rowtype; v_proj public.projects%rowtype;
begin
  select * into r from public.project_join_requests where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'request_unavailable' using errcode = 'P0002'; end if;
  if not public.is_project_manager(r.project_id, v_me) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_proj from public.projects where id = r.project_id for update;
  if p_accept then
    if v_proj.member_count >= v_proj.team_size then raise exception 'team_full' using errcode = '22023'; end if;
    if public.is_blocked_between(v_me, r.user_id) then raise exception 'target_unavailable' using errcode = 'P0002'; end if;
    insert into public.project_members(project_id, user_id, role, title)
      values (r.project_id, r.user_id, 'member', (select title from public.project_open_roles where id = r.role_id))
      on conflict do nothing;
    if r.role_id is not null then
      update public.project_open_roles set is_open = false where id = r.role_id;
    end if;
  end if;
  update public.project_join_requests set status = case when p_accept then 'accepted' else 'rejected' end, decided_by = v_me, decided_at = now() where id = p_id;
end; $$;

create or replace function public.withdraw_join_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.project_join_requests set status = 'withdrawn', decided_at = now()
    where id = p_id and user_id = (select auth.uid()) and status = 'pending';
  if not found then raise exception 'request_unavailable' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.invite_to_project(p_project uuid, p_invitee uuid, p_role_label text default null, p_message text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); v_proj public.projects%rowtype; v_id uuid;
begin
  if not public.is_project_manager(p_project, v_me) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_proj from public.projects where id = p_project and deleted_at is null;
  if not found then raise exception 'project_unavailable' using errcode = 'P0002'; end if;
  if p_invitee = v_me or not exists (select 1 from public.profiles where id = p_invitee and status = 'active')
     or public.is_blocked_between(v_me, p_invitee) then
    raise exception 'target_unavailable' using errcode = 'P0002';
  end if;
  if public.is_project_member(p_project, p_invitee) then raise exception 'already_member' using errcode = '23505'; end if;
  if v_proj.member_count >= v_proj.team_size then raise exception 'team_full' using errcode = '22023'; end if;
  begin
    insert into public.project_invitations(project_id, invitee_id, invited_by, role_label, message)
    values (p_project, p_invitee, v_me, nullif(left(trim(coalesce(p_role_label, '')), 60), ''), nullif(left(trim(coalesce(p_message, '')), 500), ''))
    returning id into v_id;
  exception when unique_violation then raise exception 'already_invited' using errcode = '23505'; end;
  return v_id;
end; $$;

create or replace function public.respond_project_invitation(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); i public.project_invitations%rowtype; v_proj public.projects%rowtype;
begin
  select * into i from public.project_invitations where id = p_id for update;
  if not found or i.invitee_id <> v_me or i.status <> 'pending' then raise exception 'invitation_unavailable' using errcode = 'P0002'; end if;
  if p_accept then
    select * into v_proj from public.projects where id = i.project_id and deleted_at is null for update;
    if not found then raise exception 'project_unavailable' using errcode = 'P0002'; end if;
    if v_proj.member_count >= v_proj.team_size then raise exception 'team_full' using errcode = '22023'; end if;
    insert into public.project_members(project_id, user_id, role, title) values (i.project_id, v_me, 'member', i.role_label) on conflict do nothing;
    update public.project_join_requests set status = 'withdrawn', decided_at = now() where project_id = i.project_id and user_id = v_me and status = 'pending';
  end if;
  update public.project_invitations set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now() where id = p_id;
end; $$;

create or replace function public.revoke_project_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.project_invitations%rowtype;
begin
  select * into i from public.project_invitations where id = p_id for update;
  if not found or i.status <> 'pending' then raise exception 'invitation_unavailable' using errcode = 'P0002'; end if;
  if not public.is_project_manager(i.project_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.project_invitations set status = 'revoked', responded_at = now() where id = p_id;
end; $$;

create or replace function public.remove_project_member(p_project uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_target public.project_members%rowtype;
begin
  select * into v_target from public.project_members where project_id = p_project and user_id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_target.role = 'owner' then raise exception 'cannot_remove_owner' using errcode = '42501'; end if;
  if p_user <> v_me then
    -- managers can remove members; only the owner can remove another manager
    if not public.is_project_manager(p_project, v_me) then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_target.role = 'manager' and not exists (select 1 from public.project_members where project_id = p_project and user_id = v_me and role = 'owner') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;
  delete from public.project_members where project_id = p_project and user_id = p_user;
end; $$;

create or replace function public.set_project_member_role(p_project uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('manager', 'member') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if not exists (select 1 from public.project_members where project_id = p_project and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.project_members set role = p_role where project_id = p_project and user_id = p_user and role <> 'owner';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.delete_project(p_project uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set deleted_at = now() where id = p_project and owner_id = (select auth.uid()) and deleted_at is null;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
end; $$;

-- Mentorship (opt-in; contact details are never revealed by these functions)
create or replace function public.request_mentorship(p_mentor uuid, p_message text, p_topic text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); v_mentor public.profiles%rowtype; v_id uuid;
begin
  select * into v_mentor from public.profiles where id = p_mentor;
  if not found or v_mentor.status <> 'active' or not v_mentor.open_to_mentoring or p_mentor = v_me
     or public.is_blocked_between(v_me, p_mentor)
     or not public.can_view_profile(v_mentor.id, v_mentor.visibility, v_mentor.college_id, v_mentor.status) then
    raise exception 'mentor_unavailable' using errcode = 'P0002';
  end if;
  if (select count(*) from public.mentorship_requests where mentee_id = v_me and status = 'pending') >= 3 then
    raise exception 'too_many_pending' using errcode = '22023';
  end if;
  begin
    insert into public.mentorship_requests(mentee_id, mentor_id, topic, message)
    values (v_me, p_mentor, nullif(left(trim(coalesce(p_topic, '')), 100), ''), left(trim(p_message), 600)) returning id into v_id;
  exception when unique_violation then raise exception 'already_requested' using errcode = '23505'; end;
  return v_id;
end; $$;

create or replace function public.respond_mentorship(p_id uuid, p_accept boolean, p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mentorship_requests
    set status = case when p_accept then 'accepted' else 'declined' end,
        response_message = nullif(left(trim(coalesce(p_message, '')), 500), ''), responded_at = now()
    where id = p_id and mentor_id = (select auth.uid()) and status = 'pending';
  if not found then raise exception 'request_unavailable' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.cancel_mentorship(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mentorship_requests set status = 'cancelled', responded_at = now()
    where id = p_id and mentee_id = (select auth.uid()) and status = 'pending';
  if not found then raise exception 'request_unavailable' using errcode = 'P0002'; end if;
end; $$;

grant execute on function
  public.request_to_join_project(uuid, uuid, text), public.respond_join_request(uuid, boolean),
  public.withdraw_join_request(uuid), public.invite_to_project(uuid, uuid, text, text),
  public.respond_project_invitation(uuid, boolean), public.revoke_project_invitation(uuid),
  public.remove_project_member(uuid, uuid), public.set_project_member_role(uuid, uuid, text),
  public.delete_project(uuid), public.request_mentorship(uuid, text, text),
  public.respond_mentorship(uuid, boolean, text), public.cancel_mentorship(uuid)
  to authenticated;

-- ── Views & search ──────────────────────────────────────────────────────────
create view public.project_cards with (security_barrier = true) as
select
  p.id, p.slug, p.owner_id, p.college_id, p.name, p.tagline, p.problem, p.goals, p.solution, p.tech_stack, p.required_skills,
  p.team_size, p.status, p.repo_url, p.demo_url, p.visibility, p.looking_for_members, p.member_count, p.created_at, p.updated_at,
  o.full_name as owner_name, o.username as owner_username, o.avatar_key as owner_avatar_key,
  (o.verification_status = 'verified') as owner_verified,
  (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'description', r.description, 'skills', r.skills) order by r.created_at), '[]'::jsonb)
     from public.project_open_roles r where r.project_id = p.id and r.is_open) as open_roles,
  public.is_project_member(p.id) as is_member
from public.projects p
join public.profiles o on o.id = p.owner_id
where public.can_view_project(p.id, p.owner_id, p.college_id, p.visibility, p.deleted_at);
grant select on public.project_cards to anon, authenticated;

create or replace function public.search_projects(
  p_query text default null, p_status text default null, p_skills text[] default null,
  p_looking boolean default null, p_limit integer default 18, p_offset integer default 0
) returns setof public.project_cards
language sql stable set search_path = public as $$
  select pc.*
  from public.project_cards pc
  join public.projects p on p.id = pc.id
  where (nullif(trim(coalesce(p_query, '')), '') is null or p.search_vector @@ websearch_to_tsquery('english', p_query)
         or pc.name ilike '%' || public.escape_like(p_query) || '%')
    and (p_status is null or pc.status = p_status)
    and (p_looking is null or pc.looking_for_members = p_looking)
    and (p_skills is null or exists (
      select 1 from unnest(pc.required_skills || pc.tech_stack) s where lower(s) = any (select lower(x) from unnest(p_skills) x)))
  order by
    case when nullif(trim(coalesce(p_query, '')), '') is null then 0 else ts_rank_cd(p.search_vector, websearch_to_tsquery('english', p_query)) end desc,
    pc.looking_for_members desc, pc.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;
grant execute on function public.search_projects(text, text, text[], boolean, integer, integer) to anon, authenticated;

-- ── Teammate recommendations ────────────────────────────────────────────────
-- Score (documented, shown to project managers with the reasons):
--   3 × required skills the person LISTS + 2 × preferred roles matching an open role title
--   + 1 × interests matching the project's tech/skill terms.
-- Only people who marked themselves open to collaboration, are active, visible to the caller
-- and not already involved are considered. Nothing is inferred beyond what profiles state.
create or replace function public.recommend_teammates(p_project uuid, p_limit integer default 8)
returns table (
  id uuid, username text, full_name text, avatar_key text, headline text, account_type text, verified boolean,
  matched_skills text[], matched_roles text[], matched_interests text[], availability text, score integer
)
language plpgsql stable set search_path = public as $$
declare v_terms text[]; v_roles text[]; v_req text[];
begin
  if not public.is_project_manager(p_project) then raise exception 'forbidden' using errcode = '42501'; end if;
  select array(select lower(x) from unnest(p.required_skills) x),
         array(select lower(x) from unnest(p.required_skills || p.tech_stack) x)
    into v_req, v_terms from public.projects p where p.id = p_project and p.deleted_at is null;
  select array(select lower(title) from public.project_open_roles where project_id = p_project and is_open) into v_roles;

  return query
  with c as (
    select p.*,
      array(select s from unnest(p.skills) s where lower(s) = any (v_req)) as ms,
      array(select r from unnest(p.preferred_roles) r where lower(r) = any (v_roles)) as mr,
      array(select i from unnest(p.interests) i where lower(i) = any (v_terms)) as mi
    from public.profiles p
    where p.status = 'active' and p.onboarded_at is not null and p.open_to_collaboration
      and not exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = p.id)
      and not exists (select 1 from public.project_invitations i where i.project_id = p_project and i.invitee_id = p.id and i.status = 'pending')
      and not public.is_blocked_between((select auth.uid()), p.id)
  )
  select c.id, c.username, c.full_name, c.avatar_key, c.headline, c.account_type, (c.verification_status = 'verified'),
         c.ms, c.mr, c.mi, c.availability,
         (cardinality(c.ms) * 3 + cardinality(c.mr) * 2 + cardinality(c.mi))::integer as score
  from c
  where cardinality(c.ms) + cardinality(c.mr) + cardinality(c.mi) > 0
  order by score desc, c.full_name
  limit least(greatest(p_limit, 1), 20);
end; $$;
grant execute on function public.recommend_teammates(uuid, integer) to authenticated;

-- Searchable career experiences: does any listed experience mention the term?
create or replace function public.experience_text_match(p_user uuid, p_query text)
returns table (hit boolean) language sql stable set search_path = public as $$
  select true from public.profile_experiences e
  where e.user_id = p_user
    and (e.title ilike '%' || public.escape_like(p_query) || '%'
      or e.organization ilike '%' || public.escape_like(p_query) || '%'
      or coalesce(e.description, '') ilike '%' || public.escape_like(p_query) || '%')
  limit 1;
$$;
-- ── Alumni / mentor discovery ───────────────────────────────────────────────
create or replace function public.search_mentors(
  p_query text default null, p_college uuid default null, p_department uuid default null,
  p_grad_from integer default null, p_grad_to integer default null, p_skills text[] default null,
  p_industry text default null, p_only_mentors boolean default false, p_limit integer default 24, p_offset integer default 0
) returns table (
  id uuid, username text, full_name text, avatar_key text, headline text, account_type text, verified boolean,
  college_id uuid, department_name text, graduation_year smallint, industry text, company text, job_title text,
  skills text[], mentoring_topics text[], open_to_mentoring boolean
)
language sql stable set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_key, p.headline, p.account_type, (p.verification_status = 'verified'),
         p.college_id, d.name, p.graduation_year, p.industry, p.company, p.job_title, p.skills, p.mentoring_topics, p.open_to_mentoring
  from public.profiles p
  left join public.departments d on d.id = p.department_id
  where p.status = 'active' and p.onboarded_at is not null
    and p.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
    and (p.account_type = 'alumni' or p.open_to_mentoring)
    and (not p_only_mentors or p.open_to_mentoring)
    and (p_college is null or p.college_id = p_college)
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
$$;

grant execute on function public.search_mentors(text, uuid, uuid, integer, integer, text[], text, boolean, integer, integer),
  public.experience_text_match(uuid, text) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_open_roles enable row level security;
alter table public.project_join_requests enable row level security;
alter table public.project_invitations enable row level security;
alter table public.mentorship_requests enable row level security;

grant select on public.projects, public.project_members, public.project_open_roles to anon, authenticated;
grant insert (owner_id, slug, name, tagline, problem, goals, solution, tech_stack, required_skills, team_size, status, repo_url, demo_url, visibility, looking_for_members)
  on public.projects to authenticated;
grant update (name, tagline, problem, goals, solution, tech_stack, required_skills, team_size, status, repo_url, demo_url, visibility, looking_for_members)
  on public.projects to authenticated;

create policy projects_select on public.projects for select to anon, authenticated
  using (public.can_view_project(id, owner_id, college_id, visibility, deleted_at));
create policy projects_select_own on public.projects for select to authenticated using (owner_id = (select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_contribute());
create policy projects_update on public.projects for update to authenticated
  using (public.is_project_manager(id) and deleted_at is null)
  with check (public.is_project_manager(id) and deleted_at is null);

create policy project_members_select on public.project_members for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_members.project_id));

create policy open_roles_select on public.project_open_roles for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_open_roles.project_id));
grant insert (project_id, title, description, skills, is_open), update (title, description, skills, is_open), delete on public.project_open_roles to authenticated;
create policy open_roles_insert on public.project_open_roles for insert to authenticated
  with check (public.is_project_manager(project_id));
create policy open_roles_update on public.project_open_roles for update to authenticated
  using (public.is_project_manager(project_id)) with check (public.is_project_manager(project_id));
create policy open_roles_delete on public.project_open_roles for delete to authenticated
  using (public.is_project_manager(project_id));

grant select on public.project_join_requests, public.project_invitations, public.mentorship_requests to authenticated;
create policy join_requests_select on public.project_join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_project_manager(project_id));
create policy invitations_select on public.project_invitations for select to authenticated
  using (invitee_id = (select auth.uid()) or public.is_project_manager(project_id));
create policy mentorship_select on public.mentorship_requests for select to authenticated
  using (mentee_id = (select auth.uid()) or mentor_id = (select auth.uid()));

-- Embeddings of projects are readable wherever the project is.
drop policy embeddings_select on public.embeddings;
create policy embeddings_select on public.embeddings for select to authenticated
  using (
    (entity_type = 'post' and exists (select 1 from public.posts p where p.id = embeddings.entity_id))
    or (entity_type = 'profile' and exists (select 1 from public.profiles p where p.id = embeddings.entity_id))
    or (entity_type = 'project' and exists (select 1 from public.projects p where p.id = embeddings.entity_id))
  );

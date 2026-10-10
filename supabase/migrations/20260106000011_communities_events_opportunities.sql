-- 0011: communities, events, announcements, opportunities

insert into public.role_permissions(role, permission) values
  ('global_admin', 'opportunities.manage'), ('college_admin', 'opportunities.manage')
on conflict do nothing;

-- ── Communities ─────────────────────────────────────────────────────────────
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  college_id uuid references public.colleges(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 3 and 80),
  kind text not null default 'community' check (kind in ('club', 'student_chapter', 'community', 'department', 'interest')),
  description text check (description is null or char_length(description) <= 1500),
  visibility text not null default 'college' check (visibility in ('public', 'college', 'private')),
  join_policy text not null default 'open' check (join_policy in ('open', 'request', 'invite')),
  avatar_key text,
  cover_key text,
  created_by uuid references public.profiles(id) on delete set null,
  is_official boolean not null default false,
  member_count integer not null default 0 check (member_count >= 0),
  search_vector tsvector,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index communities_college_idx on public.communities(college_id, name) where deleted_at is null;
create index communities_search_idx on public.communities using gin (search_vector);

create table public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  status text not null default 'active' check (status in ('active', 'pending', 'banned')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index community_members_user_idx on public.community_members(user_id, status);
create unique index community_one_owner_idx on public.community_members(community_id) where role = 'owner';

create or replace function public.is_community_member(p_community uuid, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_members m where m.community_id = p_community
    and m.user_id = coalesce(p_user, (select auth.uid())) and m.status = 'active');
$$;
create or replace function public.is_community_admin(p_community uuid, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_members m where m.community_id = p_community
    and m.user_id = coalesce(p_user, (select auth.uid())) and m.status = 'active' and m.role in ('owner', 'admin'));
$$;
create or replace function public.can_view_community(p_id uuid, p_college uuid, p_visibility text, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    p_visibility = 'public'
    or ((select auth.uid()) is not null and p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
    or public.is_community_member(p_id)
    or public.has_permission('communities.manage', p_college)
  );
$$;

create or replace function public.communities_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select college_id into new.college_id from public.profiles where id = new.created_by;
    new.is_official := false;
    new.member_count := 0;
  end if;
  new.search_vector := setweight(to_tsvector('english', coalesce(new.name, '')), 'A') || setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
  new.updated_at := now();
  return new;
end; $$;
create trigger trg_communities_before_write before insert or update on public.communities for each row execute function public.communities_before_write();

create or replace function public.communities_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_members(community_id, user_id, role, status) values (new.id, new.created_by, 'owner', 'active');
  return null;
end; $$;
create trigger trg_communities_owner after insert on public.communities for each row execute function public.communities_after_insert();

create or replace function public.community_members_counter()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(new.community_id, old.community_id);
begin
  update public.communities set member_count = (select count(*) from public.community_members where community_id = v and status = 'active') where id = v;
  return null;
end; $$;
create trigger trg_community_members_counter after insert or update of status or delete on public.community_members for each row execute function public.community_members_counter();

-- Posts can now belong to a community. Replace the visibility function to honour it.
create or replace function public.can_view_post(p_author uuid, p_college uuid, p_visibility text, p_community uuid, p_status text)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    case
      when (select auth.uid()) = p_author then p_status <> 'deleted'
      else (
        (
          p_status = 'published'
          and exists (select 1 from public.profiles a where a.id = p_author and a.status in ('active', 'restricted'))
          and not exists (
            select 1 from public.user_blocks b
            where (b.blocker_id = p_author and b.blocked_id = (select auth.uid()))
               or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_author)
          )
          and (
            p_visibility = 'public'
            or (
              (select auth.uid()) is not null
              and (
                (p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
                or (p_visibility = 'connections' and public.are_connected((select auth.uid()), p_author))
                or (p_visibility = 'community' and p_community is not null and public.is_community_member(p_community))
              )
            )
          )
        )
        or (p_status <> 'deleted' and public.has_permission('reports.view', p_college))
      )
    end;
$$;

alter table public.posts add constraint posts_community_fk foreign key (community_id) references public.communities(id) on delete set null;

-- Only active members may post into a community; community posts default to members-only visibility.
create or replace function public.posts_community_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.communities%rowtype;
begin
  if new.community_id is null then return new; end if;
  select * into c from public.communities where id = new.community_id and deleted_at is null;
  if not found or not public.is_community_member(new.community_id, new.author_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if not (new.visibility = 'community' or (new.visibility = 'public' and c.visibility = 'public')) then
    new.visibility := 'community';
  end if;
  return new;
end; $$;
create trigger trg_posts_community_guard before insert on public.posts for each row execute function public.posts_community_guard();

create or replace function public.join_community(p_community uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); c public.communities%rowtype; existing public.community_members%rowtype;
begin
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found or not public.can_view_community(c.id, c.college_id, c.visibility, c.deleted_at) then raise exception 'community_unavailable' using errcode = 'P0002'; end if;
  select * into existing from public.community_members where community_id = p_community and user_id = v_me;
  if found then
    if existing.status = 'banned' then raise exception 'banned' using errcode = '42501'; end if;
    return existing.status;
  end if;
  if c.join_policy = 'invite' then raise exception 'invite_only' using errcode = '42501'; end if;
  insert into public.community_members(community_id, user_id, status) values (p_community, v_me, case when c.join_policy = 'open' then 'active' else 'pending' end);
  return case when c.join_policy = 'open' then 'active' else 'pending' end;
end; $$;

create or replace function public.leave_community(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.community_members where community_id = p_community and user_id = (select auth.uid()) and role = 'owner') then
    raise exception 'owner_cannot_leave' using errcode = '42501';
  end if;
  delete from public.community_members where community_id = p_community and user_id = (select auth.uid()) and status <> 'banned';
end; $$;

create or replace function public.respond_community_membership(p_community uuid, p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_community_admin(p_community) or exists (select 1 from public.community_members where community_id = p_community and user_id = (select auth.uid()) and role = 'moderator' and status = 'active')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_accept then
    update public.community_members set status = 'active' where community_id = p_community and user_id = p_user and status = 'pending';
  else
    delete from public.community_members where community_id = p_community and user_id = p_user and status = 'pending';
  end if;
end; $$;

create or replace function public.manage_community_member(p_community uuid, p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.community_members%rowtype; v_me uuid := (select auth.uid());
begin
  select * into target from public.community_members where community_id = p_community and user_id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if target.role = 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action in ('make_admin', 'make_moderator', 'make_member') then
    if not exists (select 1 from public.community_members where community_id = p_community and user_id = v_me and role = 'owner') then
      raise exception 'forbidden' using errcode = '42501'; end if;
    update public.community_members set role = case p_action when 'make_admin' then 'admin' when 'make_moderator' then 'moderator' else 'member' end
      where community_id = p_community and user_id = p_user;
  elsif p_action in ('remove', 'ban') then
    if not public.is_community_admin(p_community, v_me) then raise exception 'forbidden' using errcode = '42501'; end if;
    if target.role = 'admin' and not exists (select 1 from public.community_members where community_id = p_community and user_id = v_me and role = 'owner') then
      raise exception 'forbidden' using errcode = '42501'; end if;
    if p_action = 'remove' then delete from public.community_members where community_id = p_community and user_id = p_user;
    else update public.community_members set status = 'banned', role = 'member' where community_id = p_community and user_id = p_user; end if;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
end; $$;

create or replace function public.set_community_official(p_community uuid, p_official boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_college uuid;
begin
  select college_id into v_college from public.communities where id = p_community;
  if not public.has_permission('communities.manage', v_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.communities set is_official = p_official where id = p_community;
  perform public.write_audit_log((select auth.uid()), 'community.official', 'community', p_community::text, v_college, jsonb_build_object('official', p_official));
end; $$;

create or replace function public.delete_community(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_college uuid;
begin
  select college_id into v_college from public.communities where id = p_community and deleted_at is null;
  if not (exists (select 1 from public.community_members where community_id = p_community and user_id = (select auth.uid()) and role = 'owner')
          or public.has_permission('communities.manage', v_college)) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.communities set deleted_at = now() where id = p_community;
end; $$;

create view public.community_cards with (security_barrier = true) as
select c.id, c.slug, c.college_id, c.name, c.kind, c.description, c.visibility, c.join_policy, c.avatar_key, c.cover_key,
       c.is_official, c.member_count, c.created_at,
       (select m.status from public.community_members m where m.community_id = c.id and m.user_id = (select auth.uid())) as my_status,
       (select m.role from public.community_members m where m.community_id = c.id and m.user_id = (select auth.uid())) as my_role
from public.communities c
where public.can_view_community(c.id, c.college_id, c.visibility, c.deleted_at);

-- ── Events ──────────────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  college_id uuid references public.colleges(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 3 and 140),
  description text check (description is null or char_length(description) <= 5000),
  kind text not null default 'meetup' check (kind in ('workshop', 'hackathon', 'talk', 'meetup', 'competition', 'cultural', 'sports', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 3 and 64),
  mode text not null default 'in_person' check (mode in ('in_person', 'online', 'hybrid')),
  location text check (location is null or char_length(location) <= 200),
  online_url text,
  registration_mode text not null default 'in_platform' check (registration_mode in ('none', 'external', 'in_platform')),
  registration_url text,
  capacity integer check (capacity is null or capacity between 1 and 100000),
  banner_key text,
  visibility text not null default 'college' check (visibility in ('public', 'college', 'community')),
  status text not null default 'published' check (status in ('published', 'cancelled')),
  going_count integer not null default 0 check (going_count >= 0),
  interested_count integer not null default 0 check (interested_count >= 0),
  search_vector tsvector,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (visibility <> 'community' or community_id is not null)
);
create index events_time_idx on public.events(starts_at) where deleted_at is null;
create index events_college_idx on public.events(college_id, starts_at) where deleted_at is null;
create index events_search_idx on public.events using gin (search_vector);

create table public.event_registrations (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'interested', 'waitlist', 'cancelled')),
  attended boolean not null default false,
  reminded_24h_at timestamptz,
  reminded_1h_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_registrations_user_idx on public.event_registrations(user_id, status);

create or replace function public.can_view_event(p_id uuid, p_organizer uuid, p_college uuid, p_visibility text, p_community uuid, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    p_organizer = (select auth.uid())
    or (
      not exists (select 1 from public.user_blocks b where (b.blocker_id = p_organizer and b.blocked_id = (select auth.uid())) or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_organizer))
      and (
        p_visibility = 'public'
        or ((select auth.uid()) is not null and (
          (p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
          or (p_visibility = 'community' and p_community is not null and public.is_community_member(p_community))))
      )
    )
    or public.has_permission('events.manage', p_college)
  );
$$;
create or replace function public.can_manage_event(p_organizer uuid, p_college uuid, p_community uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_organizer = (select auth.uid())
    or public.has_permission('events.manage', p_college)
    or (p_community is not null and public.is_community_admin(p_community));
$$;

create or replace function public.events_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select college_id into new.college_id from public.profiles where id = new.organizer_id;
    new.going_count := 0; new.interested_count := 0; new.status := 'published';
    if new.community_id is not null and not public.is_community_admin(new.community_id, new.organizer_id) then
      raise exception 'not_community_admin' using errcode = '42501';
    end if;
  end if;
  begin
    perform now() at time zone new.timezone;
  exception when others then raise exception 'invalid_timezone' using errcode = '22023'; end;
  new.search_vector := setweight(to_tsvector('english', coalesce(new.title, '')), 'A') || setweight(to_tsvector('english', coalesce(new.description, '') || ' ' || coalesce(new.location, '')), 'B');
  new.updated_at := now();
  return new;
end; $$;
create trigger trg_events_before_write before insert or update on public.events for each row execute function public.events_before_write();

create or replace function public.event_counts_refresh(p_event uuid)
returns void language sql security definer set search_path = '' as $$
  update public.events e set
    going_count = (select count(*) from public.event_registrations r where r.event_id = p_event and r.status = 'going'),
    interested_count = (select count(*) from public.event_registrations r where r.event_id = p_event and r.status = 'interested')
  where e.id = p_event;
$$;

create or replace function public.event_registrations_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_event uuid := coalesce(new.event_id, old.event_id); ev public.events%rowtype; next_user uuid;
begin
  perform public.event_counts_refresh(v_event);
  select * into ev from public.events where id = v_event;
  -- A freed seat is offered to the longest-waiting person.
  if ev.capacity is not null and ev.going_count < ev.capacity then
    select user_id into next_user from public.event_registrations where event_id = v_event and status = 'waitlist' order by updated_at limit 1 for update skip locked;
    if next_user is not null then
      update public.event_registrations set status = 'going', updated_at = now() where event_id = v_event and user_id = next_user;
    end if;
  end if;
  return null;
end; $$;
create trigger trg_event_registrations_after after insert or update of status or delete on public.event_registrations for each row execute function public.event_registrations_after_change();

create or replace function public.rsvp_event(p_event uuid, p_status text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); ev public.events%rowtype; v_final text := p_status;
begin
  if p_status not in ('going', 'interested', 'cancelled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into ev from public.events where id = p_event for update;
  if not found or not public.can_view_event(ev.id, ev.organizer_id, ev.college_id, ev.visibility, ev.community_id, ev.deleted_at) then
    raise exception 'event_unavailable' using errcode = 'P0002'; end if;
  if ev.status = 'cancelled' and p_status <> 'cancelled' then raise exception 'event_cancelled' using errcode = '22023'; end if;
  if coalesce(ev.ends_at, ev.starts_at + interval '3 hours') < now() and p_status <> 'cancelled' then raise exception 'event_over' using errcode = '22023'; end if;
  if ev.registration_mode <> 'in_platform' and p_status = 'going' then raise exception 'registration_external' using errcode = '22023'; end if;
  if p_status = 'going' and ev.capacity is not null and (select count(*) from public.event_registrations where event_id = p_event and status = 'going' and user_id <> v_me) >= ev.capacity then
    v_final := 'waitlist';
  end if;
  insert into public.event_registrations(event_id, user_id, status) values (p_event, v_me, v_final)
  on conflict (event_id, user_id) do update set status = excluded.status, updated_at = now();
  return v_final;
end; $$;

create or replace function public.mark_event_attendance(p_event uuid, p_user uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype;
begin
  select * into ev from public.events where id = p_event;
  if not found or not public.can_manage_event(ev.organizer_id, ev.college_id, ev.community_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.event_registrations set attended = p_attended, updated_at = now() where event_id = p_event and user_id = p_user and status = 'going';
end; $$;

create or replace function public.cancel_event(p_event uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype; r record;
begin
  select * into ev from public.events where id = p_event and deleted_at is null for update;
  if not found or not public.can_manage_event(ev.organizer_id, ev.college_id, ev.community_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.events set status = 'cancelled' where id = p_event;
  for r in select user_id from public.event_registrations where event_id = p_event and status in ('going', 'waitlist', 'interested') loop
    perform public.notify(r.user_id, 'event_update', ev.organizer_id, 'event', ev.id,
      jsonb_build_object('slug', ev.slug, 'title', ev.title, 'change', 'This event was cancelled' || coalesce(': ' || public._snippet(p_reason, 100), '')), 'event-cancel:' || ev.id);
  end loop;
end; $$;

create or replace function public.delete_event(p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ev public.events%rowtype;
begin
  select * into ev from public.events where id = p_event and deleted_at is null;
  if not found or not public.can_manage_event(ev.organizer_id, ev.college_id, ev.community_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.events set deleted_at = now() where id = p_event;
end; $$;

create view public.event_cards with (security_barrier = true) as
select e.id, e.slug, e.college_id, e.community_id, e.organizer_id, e.title, e.description, e.kind, e.starts_at, e.ends_at, e.timezone,
       e.mode, e.location, e.online_url, e.registration_mode, e.registration_url, e.capacity, e.banner_key, e.visibility, e.status,
       e.going_count, e.interested_count, e.created_at,
       o.full_name as organizer_name, o.username as organizer_username, o.avatar_key as organizer_avatar_key,
       c.name as community_name, c.slug as community_slug,
       (select r.status from public.event_registrations r where r.event_id = e.id and r.user_id = (select auth.uid())) as my_status,
       public.can_manage_event(e.organizer_id, e.college_id, e.community_id) as can_manage
from public.events e
join public.profiles o on o.id = e.organizer_id
left join public.communities c on c.id = e.community_id
where public.can_view_event(e.id, e.organizer_id, e.college_id, e.visibility, e.community_id, e.deleted_at);

-- ── Official announcements ──────────────────────────────────────────────────
create table public.college_announcements (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 3 and 140),
  body text not null check (char_length(body) between 1 and 5000),
  pinned boolean not null default false,
  status text not null default 'published' check (status in ('published', 'archived')),
  expires_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index announcements_college_idx on public.college_announcements(college_id, published_at desc) where status = 'published';

create or replace function public.publish_announcement(p_college uuid, p_title text, p_body text, p_pinned boolean default false, p_expires timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_me uuid := (select auth.uid()); u record;
begin
  if not public.has_permission('announcements.manage', p_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.college_announcements(college_id, author_id, title, body, pinned, expires_at)
  values (p_college, v_me, left(trim(p_title), 140), left(trim(p_body), 5000), p_pinned, p_expires) returning id into v_id;
  for u in select id from public.profiles where college_id = p_college and status = 'active' and onboarded_at is not null and id <> v_me limit 20000 loop
    perform public.notify(u.id, 'announcement', v_me, 'announcement', v_id,
      jsonb_build_object('title', left(trim(p_title), 100), 'snippet', public._snippet(p_body, 120), 'href', '/feed'), 'ann:' || v_id);
  end loop;
  perform public.write_audit_log(v_me, 'announcement.published', 'announcement', v_id::text, p_college, jsonb_build_object('pinned', p_pinned));
  return v_id;
end; $$;
create or replace function public.archive_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_college uuid;
begin
  select college_id into v_college from public.college_announcements where id = p_id;
  if not public.has_permission('announcements.manage', v_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.college_announcements set status = 'archived' where id = p_id;
  perform public.write_audit_log((select auth.uid()), 'announcement.archived', 'announcement', p_id::text, v_college, '{}'::jsonb);
end; $$;

-- ── Opportunities ───────────────────────────────────────────────────────────
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid not null references public.profiles(id) on delete cascade,
  college_id uuid references public.colleges(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 3 and 140),
  organization text not null check (char_length(organization) between 1 and 120),
  kind text not null default 'internship' check (kind in ('internship', 'job', 'research', 'freelance', 'competition', 'scholarship')),
  location text check (location is null or char_length(location) <= 120),
  mode text not null default 'on_site' check (mode in ('on_site', 'remote', 'hybrid')),
  apply_url text,
  deadline date,
  description text check (description is null or char_length(description) <= 5000),
  skills text[] not null default '{}' check (cardinality(skills) <= 15),
  stipend text check (stipend is null or char_length(stipend) <= 80),
  visibility text not null default 'college' check (visibility in ('public', 'college')),
  status text not null default 'open' check (status in ('open', 'closed')),
  search_vector tsvector,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_college_idx on public.opportunities(college_id, created_at desc) where deleted_at is null;
create index opportunities_search_idx on public.opportunities using gin (search_vector);

create or replace function public.opportunities_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then select college_id into new.college_id from public.profiles where id = new.poster_id; end if;
  new.search_vector := setweight(to_tsvector('english', coalesce(new.title, '') || ' ' || coalesce(new.organization, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.description, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(array_to_string(new.skills, ' '), '')), 'B');
  new.updated_at := now();
  return new;
end; $$;
create trigger trg_opportunities_before_write before insert or update on public.opportunities for each row execute function public.opportunities_before_write();

create or replace function public.can_view_opportunity(p_poster uuid, p_college uuid, p_visibility text, p_deleted timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_deleted is null and (
    p_poster = (select auth.uid()) or p_visibility = 'public'
    or ((select auth.uid()) is not null and p_college is not null and p_college = public.my_college_id())
    or public.has_permission('opportunities.manage', p_college));
$$;
grant execute on function
  public.is_community_member(uuid, uuid), public.is_community_admin(uuid, uuid), public.can_view_community(uuid, uuid, text, timestamptz),
  public.can_view_event(uuid, uuid, uuid, text, uuid, timestamptz), public.can_manage_event(uuid, uuid, uuid),
  public.can_view_opportunity(uuid, uuid, text, timestamptz), public.can_view_post(uuid, uuid, text, uuid, text)
  to anon, authenticated, service_role;

grant execute on function
  public.join_community(uuid), public.leave_community(uuid), public.respond_community_membership(uuid, uuid, boolean),
  public.manage_community_member(uuid, uuid, text), public.set_community_official(uuid, boolean), public.delete_community(uuid),
  public.rsvp_event(uuid, text), public.mark_event_attendance(uuid, uuid, boolean), public.cancel_event(uuid, text), public.delete_event(uuid),
  public.publish_announcement(uuid, text, text, boolean, timestamptz), public.archive_announcement(uuid)
  to authenticated;
grant select on public.community_cards, public.event_cards to anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.college_announcements enable row level security;
alter table public.opportunities enable row level security;

grant select on public.communities, public.events, public.opportunities to anon, authenticated;
grant select on public.community_members, public.event_registrations, public.college_announcements to authenticated;

grant insert (created_by, slug, name, kind, description, visibility, join_policy, avatar_key, cover_key) on public.communities to authenticated;
grant update (name, kind, description, visibility, join_policy, avatar_key, cover_key) on public.communities to authenticated;
create policy communities_select on public.communities for select to anon, authenticated using (public.can_view_community(id, college_id, visibility, deleted_at));
create policy communities_insert on public.communities for insert to authenticated with check (created_by = (select auth.uid()) and public.can_contribute());
create policy communities_update on public.communities for update to authenticated
  using (public.is_community_admin(id) and deleted_at is null) with check (public.is_community_admin(id) and deleted_at is null);
create policy community_members_select on public.community_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_community_member(community_id) or public.is_community_admin(community_id));

grant insert (organizer_id, community_id, slug, title, description, kind, starts_at, ends_at, timezone, mode, location, online_url, registration_mode, registration_url, capacity, banner_key, visibility) on public.events to authenticated;
grant update (title, description, kind, starts_at, ends_at, timezone, mode, location, online_url, registration_mode, registration_url, capacity, banner_key, visibility) on public.events to authenticated;
create policy events_select on public.events for select to anon, authenticated using (public.can_view_event(id, organizer_id, college_id, visibility, community_id, deleted_at));
create policy events_select_own on public.events for select to authenticated using (organizer_id = (select auth.uid()));
create policy events_insert on public.events for insert to authenticated with check (organizer_id = (select auth.uid()) and public.can_contribute());
create policy events_update on public.events for update to authenticated
  using (public.can_manage_event(organizer_id, college_id, community_id) and deleted_at is null and status = 'published')
  with check (public.can_manage_event(organizer_id, college_id, community_id));

create policy registrations_select on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.events e where e.id = event_registrations.event_id and public.can_manage_event(e.organizer_id, e.college_id, e.community_id)));

create policy announcements_select on public.college_announcements for select to authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()) and college_id = public.my_college_id()
         or public.has_permission('announcements.manage', college_id));

grant insert (poster_id, slug, title, organization, kind, location, mode, apply_url, deadline, description, skills, stipend, visibility) on public.opportunities to authenticated;
grant update (title, organization, kind, location, mode, apply_url, deadline, description, skills, stipend, visibility, status, deleted_at) on public.opportunities to authenticated;
create policy opportunities_select on public.opportunities for select to anon, authenticated using (public.can_view_opportunity(poster_id, college_id, visibility, deleted_at));
create policy opportunities_select_own on public.opportunities for select to authenticated using (poster_id = (select auth.uid()));
-- Moderators must be able to address a listing even after it is soft-deleted (the new row has to pass SELECT too).
create policy opportunities_select_staff on public.opportunities for select to authenticated using (public.has_permission('opportunities.manage', college_id));
create policy opportunities_insert on public.opportunities for insert to authenticated with check (poster_id = (select auth.uid()) and public.can_contribute());
create policy opportunities_update on public.opportunities for update to authenticated
  using ((poster_id = (select auth.uid()) or public.has_permission('opportunities.manage', college_id)))
  with check ((poster_id = (select auth.uid()) or public.has_permission('opportunities.manage', college_id)));

-- ── Worker helpers (service role only) ──────────────────────────────────────
-- Atomically marks reminders as sent so a retry/tick can never remind twice.
create or replace function public.claim_event_reminders(p_kind text)
returns table (event_id uuid, user_id uuid, title text, slug text, starts_at timestamptz, organizer_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('24h', '1h') then raise exception 'invalid_kind'; end if;
  return query
  with due as (
    select r.event_id as eid, r.user_id as uid from public.event_registrations r
    join public.events e on e.id = r.event_id
    where r.status = 'going' and e.status = 'published' and e.deleted_at is null
      and e.starts_at > now()
      and e.starts_at <= now() + case p_kind when '24h' then interval '24 hours' else interval '1 hour' end
      and case p_kind when '24h' then r.reminded_24h_at is null else r.reminded_1h_at is null end
    for update of r skip locked
    limit 500
  ), upd as (
    update public.event_registrations r set
      -- a 1h reminder also counts as the 24h one for people who joined late
      reminded_24h_at = case when p_kind = '24h' or r.reminded_24h_at is null then now() else r.reminded_24h_at end,
      reminded_1h_at = case when p_kind = '1h' then now() else r.reminded_1h_at end
    from due where r.event_id = due.eid and r.user_id = due.uid
    returning r.event_id, r.user_id)
  select e.id, upd.user_id, e.title, e.slug, e.starts_at, e.organizer_id from upd join public.events e on e.id = upd.event_id;
end; $$;
revoke execute on function public.claim_event_reminders(text) from public, anon, authenticated;
grant execute on function public.claim_event_reminders(text) to service_role;

-- Uploads that were never attached to anything, or never completed.
create or replace function public.orphan_files(p_limit integer default 50)
returns table (id uuid, bucket text, storage_key text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.bucket, f.storage_key from public.files f
  where (
      (f.status = 'pending' and f.created_at < now() - interval '1 hour')
      or (f.status = 'ready' and f.purpose in ('post_attachment', 'message_attachment') and f.created_at < now() - interval '24 hours'
          and not exists (select 1 from public.post_attachments pa where pa.file_id = f.id)
          and not exists (select 1 from public.message_attachments ma where ma.file_id = f.id))
    )
  order by f.created_at limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.orphan_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_files(integer) to service_role;

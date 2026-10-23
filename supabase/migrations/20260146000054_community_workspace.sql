-- 0054: Community workspace, part 1 of 2 (channels, roles, messages, branding, attachments).
--
-- Adds the Discord-style structure to the communities that already exist (0011): categories, channels, channel
-- messages, a data-driven role/permission model, branding that is verified on the server, and the file rules for
-- channel attachments. Part 2 (0055) adds invitations, reports, moderation, appeals and the admin views.
--
-- Safe to apply to a live database: nothing is dropped, every existing community keeps its members, posts and
-- settings, and gets two starter channels. Direct messages are untouched, except for two confirmed defects fixed
-- below (section 9): a deleted message's attachment stayed readable, and its stored object was never removed.
--
-- Principles
--   * Every write goes through a SECURITY DEFINER function that checks the caller itself. Clients get SELECT on the
--     tables (row level security decides what they see) and no INSERT/UPDATE/DELETE.
--   * The caller is always auth.uid(). No function takes "the acting user" or a role as an argument.
--   * Error strings are a contract with lib/services/community-workspace.js (the service maps them to messages).

-- ═══════════════ 1. Community columns ═══════════════
create or replace function public.valid_topics(t text[])
returns boolean language sql immutable set search_path = '' as $$
  select not exists (select 1 from unnest(t) x where x is null or x !~ '^[a-z0-9][a-z0-9-]{0,29}$');
$$;

alter table public.communities
  add column if not exists rules text check (rules is null or char_length(rules) <= 4000),
  add column if not exists topics text[] not null default '{}'::text[] check (cardinality(topics) <= 8 and public.valid_topics(topics)),
  add column if not exists require_rules_ack boolean not null default false,
  add column if not exists invite_policy text not null default 'staff' check (invite_policy in ('staff', 'members'));
create index if not exists communities_topics_idx on public.communities using gin (topics) where deleted_at is null;

-- Topics are searchable like the name and description.
create or replace function public.communities_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select college_id into new.college_id from public.profiles where id = new.created_by;
    new.is_official := false;
    new.member_count := 0;
  end if;
  new.search_vector := setweight(to_tsvector('english', coalesce(new.name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.description, '') || ' ' || array_to_string(new.topics, ' ')), 'B');
  new.updated_at := now();
  return new;
end; $$;

create or replace view public.community_cards with (security_barrier = true) as
select c.id, c.slug, c.college_id, c.name, c.kind, c.description, c.visibility, c.join_policy, c.avatar_key, c.cover_key,
       c.is_official, c.member_count, c.created_at,
       (select m.status from public.community_members m where m.community_id = c.id and m.user_id = (select auth.uid())) as my_status,
       (select m.role from public.community_members m where m.community_id = c.id and m.user_id = (select auth.uid())) as my_role,
       c.topics, c.rules, c.require_rules_ack, c.invite_policy
from public.communities c
where public.can_view_community(c.id, c.college_id, c.visibility, c.deleted_at);

alter table public.community_members
  add column if not exists muted_until timestamptz,
  add column if not exists rules_ack_at timestamptz;

-- ═══════════════ 2. Roles and permissions ═══════════════
-- One row per (role, permission). The owner holds every permission explicitly, so "can this member do X" is always one
-- lookup and the whole model can be read (and audited) as data. Custom roles are deliberately not offered: four fixed
-- roles with presets cover the product, and every extra role multiplies the ways privilege can escalate.
create table if not exists public.community_role_permissions (
  role text not null check (role in ('member', 'moderator', 'admin', 'owner')),
  permission text not null check (char_length(permission) between 3 and 60),
  primary key (role, permission)
);
alter table public.community_role_permissions enable row level security;
grant select on public.community_role_permissions to authenticated;
drop policy if exists community_role_permissions_select on public.community_role_permissions;
create policy community_role_permissions_select on public.community_role_permissions for select to authenticated using (true);

insert into public.community_role_permissions (role, permission)
select r.role, p.permission
from (values
  ('member', 'channels.view'), ('member', 'messages.send'), ('member', 'messages.attach'), ('member', 'messages.edit_own'),
  ('member', 'messages.delete_own'), ('member', 'reports.create'),
  ('moderator', 'messages.moderate'), ('moderator', 'messages.pin'), ('moderator', 'reports.review'), ('moderator', 'members.restrict'),
  ('moderator', 'members.approve'), ('moderator', 'channels.view_staff'), ('moderator', 'invites.manage'),
  ('admin', 'channels.manage'), ('admin', 'branding.manage'), ('admin', 'settings.manage'), ('admin', 'members.ban'),
  ('admin', 'roles.manage_limited'), ('admin', 'audit.view'), ('admin', 'appeals.review'),
  ('owner', 'roles.manage'), ('owner', 'community.transfer'), ('owner', 'community.delete')
) as p(role, permission)
join (values ('member'), ('moderator'), ('admin'), ('owner')) as r(role)
  on (
    -- a role holds its own permissions and everything below it
    (p.role = 'member') or
    (p.role = 'moderator' and r.role in ('moderator', 'admin', 'owner')) or
    (p.role = 'admin' and r.role in ('admin', 'owner')) or
    (p.role = 'owner' and r.role = 'owner')
  )
on conflict do nothing;

create or replace function public.community_role_rank(p_role text)
returns integer language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'moderator' then 2 when 'member' then 1 else 0 end;
$$;

-- 0 when the user is not an active member of a live community.
create or replace function public.community_rank(p_community uuid, p_user uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.community_role_rank(m.role)
    from public.community_members m join public.communities c on c.id = m.community_id and c.deleted_at is null
    where m.community_id = p_community and m.user_id = coalesce(p_user, (select auth.uid())) and m.status = 'active'
  ), 0);
$$;

create or replace function public.community_can(p_community uuid, p_permission text, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.community_members m
    join public.communities c on c.id = m.community_id and c.deleted_at is null
    join public.community_role_permissions rp on rp.role = m.role
    where m.community_id = p_community and m.user_id = coalesce(p_user, (select auth.uid()))
      and m.status = 'active' and rp.permission = p_permission
  );
$$;

-- Staff = moderator or above. Used by the member-list policy and the queues.
create or replace function public.is_community_staff(p_community uuid, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.community_rank(p_community, p_user) >= 2;
$$;

-- ═══════════════ 3. Member list visibility (confirmed defect D5) ═══════════════
-- The old policy showed EVERY row of community_members to any member, including banned and pending people, so any
-- member could list who was banned. Members now see active members and their own row; staff see everyone.
drop policy if exists community_members_select on public.community_members;
drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_community_staff(community_id)
    or (status = 'active' and public.is_community_member(community_id))
  );

-- ═══════════════ 4. Audit log (append-only) ═══════════════
-- actor_id is a plain uuid (no foreign key) so erasing an account never rewrites history; the log keeps an opaque id.
-- Message text never goes in here, only who did what to which object.
create table if not exists public.community_audit_log (
  id bigint generated always as identity primary key,
  community_id uuid not null references public.communities(id) on delete cascade,
  actor_id uuid,
  action text not null check (char_length(action) between 3 and 60),
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists community_audit_log_idx on public.community_audit_log (community_id, id desc);
alter table public.community_audit_log enable row level security;
grant select on public.community_audit_log to authenticated;
drop policy if exists community_audit_select on public.community_audit_log;
create policy community_audit_select on public.community_audit_log for select to authenticated
  using (public.community_can(community_id, 'audit.view')
         or exists (select 1 from public.communities c where c.id = community_id and public.has_permission('audit.view', c.college_id)));
-- No INSERT/UPDATE/DELETE grant exists for API roles: rows are written only by _community_audit() below.

create or replace function public._community_audit(p_community uuid, p_action text, p_target_type text default null, p_target_id text default null, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.community_audit_log (community_id, actor_id, action, target_type, target_id, details)
  values (p_community, (select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public._community_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ═══════════════ 5. Categories and channels ═══════════════
create table if not exists public.community_categories (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_categories_idx on public.community_categories (community_id, position);

create table if not exists public.community_channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  category_id uuid references public.community_categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  type text not null default 'text' check (type in ('text', 'announcements', 'qna', 'resources', 'project', 'staff')),
  description text check (description is null or char_length(description) <= 300),
  topic text check (topic is null or char_length(topic) <= 120),
  rules text check (rules is null or char_length(rules) <= 1000),
  position integer not null default 0,
  min_view_role text not null default 'member' check (min_view_role in ('member', 'moderator', 'admin')),
  min_post_role text not null default 'member' check (min_post_role in ('member', 'moderator', 'admin', 'owner')),
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 21600),
  allow_attachments boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the staff channel is never visible to ordinary members, and an announcement channel is never open to everyone
  check (type <> 'staff' or min_view_role in ('moderator', 'admin')),
  check (type <> 'announcements' or min_post_role <> 'member'),
  check (public.community_role_rank(min_post_role) >= public.community_role_rank(min_view_role))
);
create index if not exists community_channels_idx on public.community_channels (community_id, position) where archived_at is null;
create unique index if not exists community_channels_name_idx on public.community_channels (community_id, lower(name)) where archived_at is null;

create or replace function public.can_view_channel_row(p_community uuid, p_min_role text, p_archived timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.community_rank(p_community) >= greatest(public.community_role_rank(p_min_role), 1)
     and (p_archived is null or public.community_rank(p_community) >= 2);
$$;
create or replace function public.can_view_channel(p_channel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_channels c
    where c.id = p_channel and public.can_view_channel_row(c.community_id, c.min_view_role, c.archived_at)
  );
$$;

alter table public.community_categories enable row level security;
alter table public.community_channels enable row level security;
grant select on public.community_categories, public.community_channels to authenticated;
drop policy if exists community_categories_select on public.community_categories;
create policy community_categories_select on public.community_categories for select to authenticated
  using (public.community_rank(community_id) >= 1 and (archived_at is null or public.community_rank(community_id) >= 2));
drop policy if exists community_channels_select on public.community_channels;
create policy community_channels_select on public.community_channels for select to authenticated
  using (public.can_view_channel_row(community_id, min_view_role, archived_at));

-- ═══════════════ 6. Channel messages ═══════════════
create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.community_channels(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  reply_to_id uuid references public.channel_messages(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  mentions uuid[] not null default '{}'::uuid[],
  status text not null default 'sent' check (status in ('sent', 'deleted', 'removed')),
  pinned_at timestamptz,
  pinned_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz,
  client_op_id uuid,
  announce_state text not null default 'none' check (announce_state in ('none', 'pending', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists channel_messages_page_idx on public.channel_messages (channel_id, created_at desc, id desc);
create unique index if not exists channel_messages_client_op_idx on public.channel_messages (author_id, client_op_id) where client_op_id is not null;
create index if not exists channel_messages_author_idx on public.channel_messages (author_id, created_at desc);
create index if not exists channel_messages_pins_idx on public.channel_messages (channel_id, pinned_at desc) where pinned_at is not null;
-- An expression index, not a stored column: a realtime event carries the whole row, and a tsvector would ride along on every one.
create index if not exists channel_messages_search_idx on public.channel_messages using gin (to_tsvector('simple'::regconfig, body)) where status = 'sent';
create index if not exists channel_messages_announce_idx on public.channel_messages (created_at) where announce_state = 'pending';
create index if not exists channel_messages_community_idx on public.channel_messages (community_id, created_at desc);

create table if not exists public.channel_message_files (
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  primary key (message_id, file_id)
);
-- A file belongs to one message: it cannot be replayed into a second channel the uploader chose.
create unique index if not exists channel_message_files_file_idx on public.channel_message_files (file_id);

alter table public.channel_messages enable row level security;
alter table public.channel_message_files enable row level security;
grant select on public.channel_messages, public.channel_message_files to authenticated;
drop policy if exists channel_messages_select on public.channel_messages;
create policy channel_messages_select on public.channel_messages for select to authenticated using (public.can_view_channel(channel_id));
drop policy if exists channel_message_files_select on public.channel_message_files;
create policy channel_message_files_select on public.channel_message_files for select to authenticated
  using (exists (select 1 from public.channel_messages m where m.id = message_id));

-- A deleted or removed message keeps neither its text, its attachment list, its mentions nor its pin. Its files are
-- detached and marked so the maintenance worker removes the stored objects (docs/COMMUNITIES.md, "Deleting").
create or replace function public.channel_messages_before_write() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.status in ('deleted', 'removed') then
      new.body := ''; new.attachments := '[]'::jsonb; new.mentions := '{}'::uuid[]; new.pinned_at := null; new.pinned_by := null;
    elsif old.status <> 'sent' then
      new.status := old.status; new.body := ''; new.attachments := '[]'::jsonb; new.mentions := '{}'::uuid[]; -- a tombstone never comes back to life
    elsif new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_channel_messages_before_write on public.channel_messages;
create trigger trg_channel_messages_before_write before update on public.channel_messages for each row execute function public.channel_messages_before_write();

-- files.orphaned_at: set when something that held the file is gone for good; the orphan sweep (below) reads it.
alter table public.files add column if not exists orphaned_at timestamptz;

create or replace function public.channel_messages_after_update() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'sent' and new.status in ('deleted', 'removed') then
    update public.files set orphaned_at = now()
    where id in (select file_id from public.channel_message_files where message_id = new.id);
    delete from public.channel_message_files where message_id = new.id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_channel_messages_after_update on public.channel_messages;
create trigger trg_channel_messages_after_update after update of status on public.channel_messages for each row execute function public.channel_messages_after_update();

-- Realtime: members receive channel messages live; the subscriber's own row level security filters every event.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_messages') then
    alter publication supabase_realtime add table public.channel_messages;
  end if;
end $$;

-- ═══════════════ 7. Read positions and notification preferences ═══════════════
create table if not exists public.channel_reads (
  channel_id uuid not null references public.community_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.channel_reads enable row level security;
grant select on public.channel_reads to authenticated;
drop policy if exists channel_reads_select on public.channel_reads;
create policy channel_reads_select on public.channel_reads for select to authenticated using (user_id = (select auth.uid()));

-- scope_id is the channel when a row is about one channel and the community otherwise, so one primary key covers both.
create table if not exists public.community_notify_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  channel_id uuid references public.community_channels(id) on delete cascade,
  scope_id uuid generated always as (coalesce(channel_id, community_id)) stored,
  level text not null default 'mentions' check (level in ('all', 'mentions', 'none')),
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope_id)
);
alter table public.community_notify_prefs enable row level security;
grant select on public.community_notify_prefs to authenticated;
drop policy if exists community_notify_prefs_select on public.community_notify_prefs;
create policy community_notify_prefs_select on public.community_notify_prefs for select to authenticated using (user_id = (select auth.uid()));

-- Does this person want a notification of this kind for this channel? An unexpired mute on the channel OR the community
-- always wins. Otherwise a channel's level beats the community's, which beats the default (announcements: everyone;
-- mentions and replies: yes). 'none' means no.
create or replace function public._channel_wants(p_user uuid, p_community uuid, p_channel uuid, p_kind text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_level text;
begin
  if exists (select 1 from public.community_notify_prefs
             where user_id = p_user and community_id = p_community and (channel_id = p_channel or channel_id is null) and muted_until > now()) then
    return false;
  end if;
  select level into v_level from public.community_notify_prefs
   where user_id = p_user and community_id = p_community and (channel_id = p_channel or channel_id is null)
   order by (channel_id is null) limit 1;           -- the channel row (channel_id not null) sorts first
  return coalesce(v_level, 'mentions') <> 'none';
end; $$;
revoke execute on function public._channel_wants(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ═══════════════ 8. Defaults and backfill ═══════════════
create or replace function public._community_default_channels(p_community uuid, p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_info uuid; v_chat uuid;
begin
  if exists (select 1 from public.community_channels where community_id = p_community) then return; end if;
  insert into public.community_categories (community_id, name, position) values (p_community, 'Information', 0) returning id into v_info;
  insert into public.community_categories (community_id, name, position) values (p_community, 'Community', 1) returning id into v_chat;
  insert into public.community_channels (community_id, category_id, name, type, description, position, min_post_role, created_by)
  values (p_community, v_info, 'announcements', 'announcements', 'News from the people who run this community.', 0, 'moderator', p_by);
  insert into public.community_channels (community_id, category_id, name, type, description, position, created_by)
  values (p_community, v_chat, 'general', 'text', 'Talk about anything related to this community.', 0, p_by);
end; $$;
revoke execute on function public._community_default_channels(uuid, uuid) from public, anon, authenticated;

create or replace function public.communities_after_insert_channels() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._community_default_channels(new.id, new.created_by);
  return null;
end; $$;
drop trigger if exists trg_communities_default_channels on public.communities;
create trigger trg_communities_default_channels after insert on public.communities for each row execute function public.communities_after_insert_channels();

do $$
declare r record;
begin
  for r in select id, created_by from public.communities where deleted_at is null loop
    perform public._community_default_channels(r.id, r.created_by);
  end loop;
end $$;

-- ═══════════════ 9. Attachments: access rules and the confirmed direct-message defect ═══════════════
-- Confirmed defect A1: deleting a direct message cleared its attachment snapshot but left the message_attachments row, so
-- the file stayed readable through /api/files/<id> to the conversation, and its object stayed in storage forever.
create or replace function public.can_read_message_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_attachments a join public.messages m on m.id = a.message_id
    where a.file_id = p_file and m.status = 'sent' and public.is_conversation_member(m.conversation_id));
$$;

create or replace function public.messages_after_delete_files() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'sent' and new.status = 'deleted' then
    update public.files set orphaned_at = now() where id in (select file_id from public.message_attachments where message_id = new.id);
    delete from public.message_attachments where message_id = new.id;
  end if;
  return null;
end; $$;
drop trigger if exists trg_messages_after_delete_files on public.messages;
create trigger trg_messages_after_delete_files after update of status on public.messages for each row execute function public.messages_after_delete_files();

-- Files that belonged to messages deleted before this migration: detach them now so they stop being readable.
update public.files set orphaned_at = now()
where id in (select a.file_id from public.message_attachments a join public.messages m on m.id = a.message_id where m.status = 'deleted');
delete from public.message_attachments a using public.messages m where m.id = a.message_id and m.status = 'deleted';

create or replace function public.can_read_channel_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channel_message_files f join public.channel_messages m on m.id = f.message_id
    where f.file_id = p_file and m.status = 'sent' and public.can_view_channel(m.channel_id));
$$;
drop policy if exists files_select_channel_attachment on public.files;
create policy files_select_channel_attachment on public.files for select to authenticated
  using (purpose = 'message_attachment' and status = 'ready' and public.can_read_channel_file(id));

-- The sweep: unfinished uploads, unattached attachments, avatars/covers/community images nobody uses, and now files
-- whose message was deleted (orphaned_at) without waiting a day. Same signature and result as before.
create index if not exists files_orphaned_idx on public.files (orphaned_at) where orphaned_at is not null and status = 'ready';
create index if not exists communities_avatar_key_idx on public.communities (avatar_key) where avatar_key is not null;
create index if not exists communities_cover_key_idx on public.communities (cover_key) where cover_key is not null;

create or replace function public.orphan_files(p_limit integer default 50)
returns table (id uuid, bucket text, storage_key text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.bucket, f.storage_key from public.files f
  where (
      (f.status = 'pending' and f.created_at < now() - interval '1 hour')
      or (f.status = 'ready' and f.purpose in ('post_attachment', 'message_attachment') and f.created_at < now() - interval '24 hours'
          and not exists (select 1 from public.post_attachments pa where pa.file_id = f.id)
          and not exists (select 1 from public.message_attachments ma where ma.file_id = f.id)
          and not exists (select 1 from public.channel_message_files cf where cf.file_id = f.id))
      or (f.status = 'ready' and f.orphaned_at is not null and f.orphaned_at < now() - interval '5 minutes'
          and not exists (select 1 from public.message_attachments ma where ma.file_id = f.id)
          and not exists (select 1 from public.channel_message_files cf where cf.file_id = f.id))
      or (f.status = 'ready' and f.purpose in ('avatar', 'cover') and f.created_at < now() - interval '24 hours'
          and not exists (select 1 from public.profiles p where p.avatar_key = f.storage_key or p.cover_key = f.storage_key)
          and not exists (select 1 from public.communities c where c.avatar_key = f.storage_key or c.cover_key = f.storage_key))
      or (f.status = 'ready' and f.purpose = 'community_image' and f.created_at < now() - interval '24 hours'
          and not exists (select 1 from public.communities c where c.avatar_key = f.storage_key or c.cover_key = f.storage_key))
    )
  order by f.created_at limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.orphan_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_files(integer) to service_role;

-- ═══════════════ 10. Branding (confirmed defect D1) ═══════════════
-- avatar_key and cover_key used to be directly writable by any community admin with any string. They are now set only
-- here, after checking that the file is a ready community image the caller uploaded, with the right proportions.
revoke update on public.communities from authenticated;
revoke insert (avatar_key, cover_key) on public.communities from authenticated;
grant insert (topics, rules, require_rules_ack, invite_policy) on public.communities to authenticated;

-- p_kind: 'icon' (square) or 'banner' (3:1). Pass a null file to remove the picture.
create or replace function public.set_community_branding(p_community uuid, p_kind text, p_file uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); f public.files%rowtype; v_old text; v_ratio numeric;
begin
  if p_kind not in ('icon', 'banner') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if not public.community_can(p_community, 'branding.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select case p_kind when 'icon' then avatar_key else cover_key end into v_old from public.communities where id = p_community and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_file is null then
    if p_kind = 'icon' then update public.communities set avatar_key = null where id = p_community;
    else update public.communities set cover_key = null where id = p_community; end if;
  else
    select * into f from public.files where id = p_file;
    if not found or f.owner_id <> v_me or f.purpose <> 'community_image' or f.status <> 'ready' then raise exception 'invalid_image' using errcode = '22023'; end if;
    if f.width is null or f.height is null then raise exception 'invalid_image' using errcode = '22023'; end if;
    v_ratio := f.width::numeric / f.height;
    if p_kind = 'icon' and (abs(v_ratio - 1) > 0.02 or f.width < 128) then raise exception 'invalid_proportions' using errcode = '22023'; end if;
    if p_kind = 'banner' and (abs(v_ratio - 3) > 0.06 or f.width < 600) then raise exception 'invalid_proportions' using errcode = '22023'; end if;
    if p_kind = 'icon' then update public.communities set avatar_key = f.storage_key where id = p_community;
    else update public.communities set cover_key = f.storage_key where id = p_community; end if;
  end if;
  -- the replaced picture is no longer used by anything: the sweep removes the stored object
  if v_old is not null and v_old is distinct from (select storage_key from public.files where id = p_file) then
    update public.files set orphaned_at = now() where storage_key = v_old and purpose = 'community_image';
  end if;
  perform public._community_audit(p_community, 'branding.' || p_kind || case when p_file is null then '_removed' else '_set' end);
  return jsonb_build_object('previous', v_old);
end; $$;

-- ═══════════════ 11. Community details and settings ═══════════════
create or replace function public.update_community_details(
  p_community uuid, p_name text, p_kind text, p_description text, p_visibility text, p_join_policy text,
  p_rules text, p_topics text[], p_require_rules_ack boolean, p_invite_policy text)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.communities%rowtype; v_topics text[] := coalesce(p_topics, '{}'::text[]);
begin
  perform public._assert_active_member();
  if not public.community_can(p_community, 'settings.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_visibility = 'college' and c.college_id is null then raise exception 'college_required' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct lower(btrim(t))), '{}') into v_topics from unnest(v_topics) t where btrim(t) <> '';
  update public.communities set
    name = p_name, kind = p_kind, description = nullif(btrim(coalesce(p_description, '')), ''),
    visibility = p_visibility, join_policy = p_join_policy,
    rules = nullif(btrim(coalesce(p_rules, '')), ''), topics = v_topics,
    require_rules_ack = coalesce(p_require_rules_ack, false), invite_policy = coalesce(p_invite_policy, 'staff')
  where id = p_community;
  -- when acknowledgement becomes required everyone is asked again from now on (existing acknowledgements stand)
  perform public._community_audit(p_community, 'settings.updated', 'community', p_community::text, jsonb_build_object(
    'visibility', jsonb_build_array(c.visibility, p_visibility), 'join_policy', jsonb_build_array(c.join_policy, p_join_policy),
    'require_rules_ack', jsonb_build_array(c.require_rules_ack, coalesce(p_require_rules_ack, false)),
    'invite_policy', jsonb_build_array(c.invite_policy, coalesce(p_invite_policy, 'staff')),
    'renamed', c.name is distinct from p_name, 'rules_changed', c.rules is distinct from nullif(btrim(coalesce(p_rules, '')), '')));
  return (select slug from public.communities where id = p_community);
end; $$;

create or replace function public.acknowledge_community_rules(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_active_member();
  update public.community_members set rules_ack_at = now()
  where community_id = p_community and user_id = (select auth.uid()) and status = 'active';
  if not found then raise exception 'not_a_member' using errcode = '42501'; end if;
end; $$;

-- ═══════════════ 12. Categories and channels: management ═══════════════
create or replace function public._require_channel_manager(p_community uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := public._assert_active_member();
begin
  if not public.community_can(p_community, 'channels.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return v;
end; $$;
revoke execute on function public._require_channel_manager(uuid) from public, anon, authenticated;

create or replace function public.create_community_category(p_community uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public._require_channel_manager(p_community);
  if (select count(*) from public.community_categories where community_id = p_community and archived_at is null) >= 12 then raise exception 'limit_reached' using errcode = '54000'; end if;
  insert into public.community_categories (community_id, name, position)
  values (p_community, btrim(p_name), coalesce((select max(position) + 1 from public.community_categories where community_id = p_community), 0))
  returning id into v_id;
  perform public._community_audit(p_community, 'category.created', 'category', v_id::text, jsonb_build_object('name', btrim(p_name)));
  return v_id;
end; $$;

-- p_archived: true archives the category and every channel in it, false restores them, null leaves them alone.
create or replace function public.update_community_category(p_category uuid, p_name text, p_archived boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare cat public.community_categories%rowtype;
begin
  select * into cat from public.community_categories where id = p_category;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._require_channel_manager(cat.community_id);
  update public.community_categories set name = coalesce(nullif(btrim(p_name), ''), name),
    archived_at = case when p_archived is null then archived_at when p_archived then coalesce(archived_at, now()) else null end
  where id = p_category;
  if p_archived is true then update public.community_channels set archived_at = coalesce(archived_at, now()) where category_id = p_category;
  elsif p_archived is false then update public.community_channels set archived_at = null where category_id = p_category; end if;
  perform public._community_audit(cat.community_id, case when p_archived is true then 'category.archived' when p_archived is false then 'category.restored' else 'category.renamed' end, 'category', p_category::text);
end; $$;

create or replace function public.reorder_community_categories(p_community uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_channel_manager(p_community);
  if cardinality(p_ids) > 50 then raise exception 'limit_reached' using errcode = '54000'; end if;
  update public.community_categories c set position = o.ord - 1
  from unnest(p_ids) with ordinality o(id, ord)
  where c.id = o.id and c.community_id = p_community;
  perform public._community_audit(p_community, 'category.reordered');
end; $$;

-- A channel's settings must stay consistent with its type, whoever sends them.
create or replace function public._normalize_channel(p_type text, inout p_view text, inout p_post text)
language plpgsql immutable set search_path = '' as $$
begin
  if p_type = 'staff' and p_view = 'member' then p_view := 'moderator'; end if;
  if p_type = 'staff' and p_post = 'member' then p_post := 'moderator'; end if;
  if p_type = 'announcements' and p_post = 'member' then p_post := 'moderator'; end if;
end; $$;

create or replace function public.create_community_channel(
  p_community uuid, p_category uuid, p_name text, p_type text, p_description text default null, p_topic text default null,
  p_rules text default null, p_min_view_role text default 'member', p_min_post_role text default 'member',
  p_slow_mode integer default 0, p_allow_attachments boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._require_channel_manager(p_community); v_id uuid; v_view text := p_min_view_role; v_post text := p_min_post_role;
begin
  if p_category is not null and not exists (select 1 from public.community_categories where id = p_category and community_id = p_community and archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from public.community_channels where community_id = p_community and archived_at is null) >= 50 then raise exception 'limit_reached' using errcode = '54000'; end if;
  select * into v_view, v_post from public._normalize_channel(p_type, v_view, v_post);
  begin
    insert into public.community_channels (community_id, category_id, name, type, description, topic, rules, position, min_view_role, min_post_role, slow_mode_seconds, allow_attachments, created_by)
    values (p_community, p_category, btrim(p_name), p_type, nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_topic, '')), ''),
            nullif(btrim(coalesce(p_rules, '')), ''),
            coalesce((select max(position) + 1 from public.community_channels where community_id = p_community and category_id is not distinct from p_category), 0),
            v_view, v_post, coalesce(p_slow_mode, 0), coalesce(p_allow_attachments, true), v_me)
    returning id into v_id;
  exception when unique_violation then raise exception 'name_taken' using errcode = '23505'; end;
  perform public._community_audit(p_community, 'channel.created', 'channel', v_id::text, jsonb_build_object('name', btrim(p_name), 'type', p_type, 'view', v_view, 'post', v_post));
  return v_id;
end; $$;

create or replace function public.update_community_channel(
  p_channel uuid, p_name text, p_category uuid, p_description text, p_topic text, p_rules text,
  p_min_view_role text, p_min_post_role text, p_slow_mode integer, p_allow_attachments boolean, p_archived boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare ch public.community_channels%rowtype; v_view text := p_min_view_role; v_post text := p_min_post_role;
begin
  select * into ch from public.community_channels where id = p_channel;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._require_channel_manager(ch.community_id);
  if p_category is not null and not exists (select 1 from public.community_categories where id = p_category and community_id = ch.community_id) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into v_view, v_post from public._normalize_channel(ch.type, v_view, v_post);
  begin
    update public.community_channels set
      name = btrim(p_name), category_id = p_category, description = nullif(btrim(coalesce(p_description, '')), ''),
      topic = nullif(btrim(coalesce(p_topic, '')), ''), rules = nullif(btrim(coalesce(p_rules, '')), ''),
      min_view_role = v_view, min_post_role = v_post, slow_mode_seconds = coalesce(p_slow_mode, 0),
      allow_attachments = coalesce(p_allow_attachments, true), updated_at = now(),
      archived_at = case when p_archived is null then archived_at when p_archived then coalesce(archived_at, now()) else null end
    where id = p_channel;
  exception when unique_violation then raise exception 'name_taken' using errcode = '23505'; end;
  perform public._community_audit(ch.community_id, case when p_archived is true then 'channel.archived' when p_archived is false then 'channel.restored' else 'channel.updated' end,
    'channel', p_channel::text, jsonb_build_object('view', jsonb_build_array(ch.min_view_role, v_view), 'post', jsonb_build_array(ch.min_post_role, v_post),
      'slow_mode', jsonb_build_array(ch.slow_mode_seconds, coalesce(p_slow_mode, 0))));
end; $$;

create or replace function public.reorder_community_channels(p_community uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_channel_manager(p_community);
  if cardinality(p_ids) > 100 then raise exception 'limit_reached' using errcode = '54000'; end if;
  update public.community_channels c set position = o.ord - 1
  from unnest(p_ids) with ordinality o(id, ord)
  where c.id = o.id and c.community_id = p_community;
  perform public._community_audit(p_community, 'channel.reordered');
end; $$;

-- Moves one channel to a category (null = uncategorised) at the end of it: the mobile alternative to dragging.
create or replace function public.move_community_channel(p_channel uuid, p_category uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ch public.community_channels%rowtype;
begin
  select * into ch from public.community_channels where id = p_channel;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._require_channel_manager(ch.community_id);
  if p_category is not null and not exists (select 1 from public.community_categories where id = p_category and community_id = ch.community_id) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.community_channels set category_id = p_category,
    position = coalesce((select max(position) + 1 from public.community_channels where community_id = ch.community_id and category_id is not distinct from p_category), 0)
  where id = p_channel;
  perform public._community_audit(ch.community_id, 'channel.moved', 'channel', p_channel::text);
end; $$;

-- ═══════════════ 13. Posting rules ═══════════════
-- The one answer to "may I post in this channel right now": 'ok', or the reason. 'not_found' covers both a channel that
-- does not exist and one the caller may not see, so channel ids cannot be probed.
create or replace function public.channel_post_state(p_channel uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare ch public.community_channels%rowtype; m public.community_members%rowtype; c public.communities%rowtype; v_rank integer;
begin
  select * into ch from public.community_channels where id = p_channel;
  if not found then return 'not_found'; end if;
  select * into c from public.communities where id = ch.community_id and deleted_at is null;
  if not found then return 'not_found'; end if;
  select * into m from public.community_members where community_id = ch.community_id and user_id = (select auth.uid());
  if not found or m.status <> 'active' then return 'not_found'; end if;
  v_rank := public.community_role_rank(m.role);
  if v_rank < public.community_role_rank(ch.min_view_role) or (ch.archived_at is not null and v_rank < 2) then return 'not_found'; end if;
  if ch.archived_at is not null then return 'archived'; end if;
  if v_rank < public.community_role_rank(ch.min_post_role) then return 'read_only'; end if;
  if not public.can_contribute() then return 'account_restricted'; end if;
  if m.muted_until is not null and m.muted_until > now() then return 'timed_out'; end if;
  if c.require_rules_ack and m.rules_ack_at is null then return 'rules_required'; end if;
  return 'ok';
end; $$;

-- ═══════════════ 14. Sending, editing, deleting, pinning ═══════════════
-- Returns { message, replayed }. Raises: not_authenticated · not_found · read_only · archived · timed_out ·
-- rules_required · account_restricted · empty_message · too_many_files · invalid_file · attachments_disabled ·
-- invalid_reply · slow_mode:<seconds> · rate_limited.
create or replace function public.send_channel_message(p_channel uuid, p_body text, p_file_ids uuid[], p_reply_to uuid, p_client_op_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_files uuid[] := coalesce(p_file_ids, '{}'::uuid[]);
  v_items jsonb := '[]'::jsonb;
  v_found integer;
  v_state text;
  ch public.community_channels%rowtype;
  c public.communities%rowtype;
  v_msg public.channel_messages%rowtype;
  v_replayed boolean := false;
  v_rank integer;
  v_wait integer;
  v_mentions uuid[] := '{}'::uuid[];
  v_reply public.channel_messages%rowtype;
  u uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if char_length(v_body) > 4000 then raise exception 'empty_message' using errcode = '22023'; end if;
  if v_body = '' and cardinality(v_files) = 0 then raise exception 'empty_message' using errcode = '22023'; end if;
  if cardinality(v_files) > 5 then raise exception 'too_many_files' using errcode = '22023'; end if;

  -- A retry of a send that already went through succeeds quietly, even if the sender has since lost the right to post.
  if p_client_op_id is not null then
    select * into v_msg from public.channel_messages where author_id = v_me and client_op_id = p_client_op_id;
    if found then return jsonb_build_object('message', to_jsonb(v_msg), 'replayed', true); end if;
  end if;

  v_state := public.channel_post_state(p_channel);
  if v_state <> 'ok' then raise exception '%', v_state using errcode = '42501'; end if;
  select * into ch from public.community_channels where id = p_channel;
  select * into c from public.communities where id = ch.community_id;
  v_rank := public.community_rank(ch.community_id);

  if (select count(*) from public.channel_messages where author_id = v_me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  -- Slow mode applies to members; staff are exempt so they can still manage a busy channel.
  if ch.slow_mode_seconds > 0 and v_rank < 2 then
    select ceil(ch.slow_mode_seconds - extract(epoch from (now() - max(created_at))))::integer into v_wait
    from public.channel_messages where channel_id = ch.id and author_id = v_me and status = 'sent' and created_at > now() - make_interval(secs => ch.slow_mode_seconds);
    if v_wait is not null and v_wait > 0 then raise exception 'slow_mode:%', v_wait using errcode = '54000'; end if;
  end if;

  if p_reply_to is not null then
    select * into v_reply from public.channel_messages where id = p_reply_to and channel_id = ch.id;
    if not found then raise exception 'invalid_reply' using errcode = '22023'; end if;
  end if;

  if cardinality(v_files) > 0 then
    if not ch.allow_attachments then raise exception 'attachments_disabled' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'original_name', f.original_name, 'mime_type', f.mime_type, 'size', f.size_bytes, 'width', f.width, 'height', f.height) order by f.created_at), '[]'::jsonb), count(*)
      into v_items, v_found
    from public.files f
    where f.id = any (v_files) and f.owner_id = v_me and f.purpose = 'message_attachment' and f.status = 'ready'
      and not exists (select 1 from public.channel_message_files x where x.file_id = f.id)
      and not exists (select 1 from public.message_attachments y where y.file_id = f.id);
    if v_found <> (select count(distinct x) from unnest(v_files) x) then raise exception 'invalid_file' using errcode = '22023'; end if;
  end if;

  -- @username mentions: only people who are in this community and could read this channel, at most ten, never yourself.
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions
  from (select lower((regexp_matches(v_body, '(?<![A-Za-z0-9_@])@([A-Za-z0-9][A-Za-z0-9_-]{1,28}[A-Za-z0-9])', 'g'))[1]) as u limit 10) x
  join public.profiles p on p.username = x.u and p.id <> v_me
  join public.community_members m on m.community_id = ch.community_id and m.user_id = p.id and m.status = 'active'
  where public.community_role_rank(m.role) >= greatest(public.community_role_rank(ch.min_view_role), 1);

  begin
    insert into public.channel_messages (channel_id, community_id, author_id, body, reply_to_id, attachments, mentions, client_op_id, announce_state)
    values (ch.id, ch.community_id, v_me, v_body, p_reply_to, v_items, v_mentions, p_client_op_id, case when ch.type = 'announcements' then 'pending' else 'none' end)
    returning * into v_msg;
  exception when unique_violation then
    select * into v_msg from public.channel_messages where author_id = v_me and client_op_id = p_client_op_id;
    v_replayed := true;
  end;

  if not v_replayed then
    if cardinality(v_files) > 0 then
      insert into public.channel_message_files (message_id, file_id) select v_msg.id, x from unnest(v_files) x on conflict do nothing;
    end if;
    -- Notifications: mentions and the author of the message replied to. Never every message in a channel. notify()
    -- applies the recipient's blocks and category preference; _channel_wants applies their community/channel mute.
    for u in select unnest(v_mentions) loop
      if public._channel_wants(u, ch.community_id, ch.id, 'mention') then
        perform public.notify(u, 'channel_mention', v_me, 'channel', ch.id,
          jsonb_build_object('community', c.slug, 'community_name', c.name, 'channel', ch.name, 'message', v_msg.id), 'chm:' || v_msg.id || ':' || u);
      end if;
    end loop;
    if v_reply.id is not null and v_reply.author_id is not null and v_reply.author_id <> v_me and not (v_reply.author_id = any (v_mentions))
       and public.community_rank(ch.community_id, v_reply.author_id) >= greatest(public.community_role_rank(ch.min_view_role), 1)
       and public._channel_wants(v_reply.author_id, ch.community_id, ch.id, 'reply') then
      perform public.notify(v_reply.author_id, 'channel_reply', v_me, 'channel', ch.id,
        jsonb_build_object('community', c.slug, 'community_name', c.name, 'channel', ch.name, 'message', v_msg.id), 'chr:' || v_msg.id);
    end if;
  end if;
  return jsonb_build_object('message', to_jsonb(v_msg), 'replayed', v_replayed);
end; $$;

create or replace function public.edit_channel_message(p_message uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); m public.channel_messages%rowtype; v_body text := btrim(coalesce(p_body, ''));
begin
  select * into m from public.channel_messages where id = p_message;
  if not found or m.author_id is distinct from v_me or m.status <> 'sent' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.community_can(m.community_id, 'messages.edit_own') or not public.can_view_channel(m.channel_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select muted_until from public.community_members where community_id = m.community_id and user_id = v_me) > now() then raise exception 'timed_out' using errcode = '42501'; end if;
  if char_length(v_body) > 4000 or (v_body = '' and jsonb_array_length(m.attachments) = 0) then raise exception 'empty_message' using errcode = '22023'; end if;
  update public.channel_messages set body = v_body where id = p_message returning * into m;
  return to_jsonb(m);
end; $$;

-- Own message: its author. Anyone else's: a moderator, only if the author ranks lower. A removal by staff is recorded
-- with a reason (part 2 logs it as a moderation action the author can see and appeal).
create or replace function public.delete_channel_message(p_message uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); m public.channel_messages%rowtype; v_own boolean;
begin
  select * into m from public.channel_messages where id = p_message;
  if not found or not public.can_view_channel(m.channel_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.status <> 'sent' then return jsonb_build_object('id', m.id, 'status', m.status); end if;
  v_own := m.author_id = v_me;
  if v_own then
    if not public.community_can(m.community_id, 'messages.delete_own') then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.channel_messages set status = 'deleted' where id = p_message;
    return jsonb_build_object('id', m.id, 'status', 'deleted');
  end if;
  if not public.community_can(m.community_id, 'messages.moderate') then raise exception 'forbidden' using errcode = '42501'; end if;
  if m.author_id is not null and public.community_rank(m.community_id, m.author_id) >= public.community_rank(m.community_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.channel_messages set status = 'removed' where id = p_message;
  perform public._community_audit(m.community_id, 'message.removed', 'message', m.id::text, jsonb_build_object('channel', m.channel_id, 'author', m.author_id));
  return jsonb_build_object('id', m.id, 'status', 'removed', 'author', m.author_id, 'community', m.community_id, 'channel', m.channel_id);
end; $$;

create or replace function public.pin_channel_message(p_message uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); m public.channel_messages%rowtype;
begin
  select * into m from public.channel_messages where id = p_message;
  if not found or not public.can_view_channel(m.channel_id) or m.status <> 'sent' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.community_can(m.community_id, 'messages.pin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_pinned and (select count(*) from public.channel_messages where channel_id = m.channel_id and pinned_at is not null) >= 50 then raise exception 'limit_reached' using errcode = '54000'; end if;
  update public.channel_messages set pinned_at = case when p_pinned then now() else null end, pinned_by = case when p_pinned then v_me else null end where id = p_message;
  perform public._community_audit(m.community_id, case when p_pinned then 'message.pinned' else 'message.unpinned' end, 'message', m.id::text);
end; $$;

-- ═══════════════ 15. Reading ═══════════════
-- (before) newest first, for scrolling back; (after) oldest first, for catching up. SECURITY INVOKER: the channel's
-- row level security decides, so a channel you cannot see returns nothing.
create or replace function public.channel_messages_page(
  p_channel uuid, p_before_ts timestamptz default null, p_before_id uuid default null,
  p_after_ts timestamptz default null, p_after_id uuid default null, p_limit integer default 30)
returns table (id uuid, channel_id uuid, community_id uuid, author_id uuid, body text, reply_to_id uuid, attachments jsonb, mentions uuid[], status text,
               pinned_at timestamptz, edited_at timestamptz, created_at timestamptz)
language plpgsql stable set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_after_ts is not null then
    return query select m.id, m.channel_id, m.community_id, m.author_id, m.body, m.reply_to_id, m.attachments, m.mentions, m.status, m.pinned_at, m.edited_at, m.created_at
      from public.channel_messages m
      where m.channel_id = p_channel and (m.created_at, m.id) > (p_after_ts, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
      order by m.created_at asc, m.id asc limit v_limit;
  elsif p_before_ts is not null then
    return query select m.id, m.channel_id, m.community_id, m.author_id, m.body, m.reply_to_id, m.attachments, m.mentions, m.status, m.pinned_at, m.edited_at, m.created_at
      from public.channel_messages m
      where m.channel_id = p_channel and (m.created_at, m.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      order by m.created_at desc, m.id desc limit v_limit;
  else
    return query select m.id, m.channel_id, m.community_id, m.author_id, m.body, m.reply_to_id, m.attachments, m.mentions, m.status, m.pinned_at, m.edited_at, m.created_at
      from public.channel_messages m where m.channel_id = p_channel
      order by m.created_at desc, m.id desc limit v_limit;
  end if;
end; $$;

create or replace function public.search_channel_messages(p_community uuid, p_query text, p_limit integer default 25, p_channel uuid default null)
returns table (id uuid, channel_id uuid, channel_name text, author_id uuid, body text, created_at timestamptz)
language sql stable set search_path = '' as $$
  select m.id, m.channel_id, c.name, m.author_id, left(m.body, 400), m.created_at
  from public.channel_messages m join public.community_channels c on c.id = m.channel_id
  where m.community_id = p_community and m.status = 'sent' and (p_channel is null or m.channel_id = p_channel)
    and length(btrim(coalesce(p_query, ''))) >= 2
    and to_tsvector('simple'::regconfig, m.body) @@ websearch_to_tsquery('simple'::regconfig, left(p_query, 100))
  order by m.created_at desc limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

create or replace function public.community_channel_unread(p_community uuid)
returns table (channel_id uuid, unread bigint, mentions bigint)
language sql stable set search_path = '' as $$
  select c.id,
    (select count(*) from (select 1 from public.channel_messages m
       where m.channel_id = c.id and m.status = 'sent' and m.created_at > coalesce(r.last_read_at, me.joined_at) and m.author_id is distinct from (select auth.uid()) limit 100) x),
    (select count(*) from (select 1 from public.channel_messages m
       where m.channel_id = c.id and m.status = 'sent' and m.created_at > coalesce(r.last_read_at, me.joined_at) and (select auth.uid()) = any (m.mentions) limit 100) y)
  from public.community_channels c
  join public.community_members me on me.community_id = c.community_id and me.user_id = (select auth.uid()) and me.status = 'active'
  left join public.channel_reads r on r.channel_id = c.id and r.user_id = (select auth.uid())
  where c.community_id = p_community and c.archived_at is null;
$$;

create or replace function public.mark_channel_read(p_channel uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.can_view_channel(p_channel) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.channel_reads (channel_id, user_id, last_read_at) values (p_channel, v_me, now())
  on conflict (channel_id, user_id) do update set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at);
  update public.notifications set read_at = now()
  where user_id = v_me and entity_id = p_channel and type in ('channel_mention', 'channel_reply', 'channel_announcement') and read_at is null;
end; $$;

-- p_channel null = the whole community. p_hours null with level 'none' = off until changed; a number mutes for that long.
create or replace function public.set_community_notify_pref(p_community uuid, p_channel uuid, p_level text, p_mute_hours integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member();
begin
  if p_level not in ('all', 'mentions', 'none') then raise exception 'invalid_level' using errcode = '22023'; end if;
  if public.community_rank(p_community) < 1 then raise exception 'not_a_member' using errcode = '42501'; end if;
  if p_channel is not null and not exists (select 1 from public.community_channels where id = p_channel and community_id = p_community and public.can_view_channel(id)) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.community_notify_prefs (user_id, community_id, channel_id, level, muted_until)
  values (v_me, p_community, p_channel, p_level, case when p_mute_hours is null then null else now() + make_interval(hours => least(greatest(p_mute_hours, 1), 24 * 365)) end)
  on conflict (user_id, scope_id) do update set level = excluded.level, muted_until = excluded.muted_until, updated_at = now();
end; $$;

-- ═══════════════ 16. Grants ═══════════════
-- This database closes functions by default (0017): everything callable is granted here, to signed-in members only.
grant execute on function
  public.valid_topics(text[]), public.community_role_rank(text), public.community_rank(uuid, uuid), public.community_can(uuid, text, uuid),
  public.is_community_staff(uuid, uuid), public.can_view_channel_row(uuid, text, timestamptz), public.can_view_channel(uuid),
  public.can_read_channel_file(uuid), public.can_read_message_file(uuid), public.channel_post_state(uuid),
  public.set_community_branding(uuid, text, uuid), public.update_community_details(uuid, text, text, text, text, text, text, text[], boolean, text),
  public.acknowledge_community_rules(uuid),
  public.create_community_category(uuid, text), public.update_community_category(uuid, text, boolean), public.reorder_community_categories(uuid, uuid[]),
  public.create_community_channel(uuid, uuid, text, text, text, text, text, text, text, integer, boolean),
  public.update_community_channel(uuid, text, uuid, text, text, text, text, text, integer, boolean, boolean),
  public.reorder_community_channels(uuid, uuid[]), public.move_community_channel(uuid, uuid),
  public.send_channel_message(uuid, text, uuid[], uuid, uuid), public.edit_channel_message(uuid, text), public.delete_channel_message(uuid),
  public.pin_channel_message(uuid, boolean), public.channel_messages_page(uuid, timestamptz, uuid, timestamptz, uuid, integer),
  public.search_channel_messages(uuid, text, integer, uuid), public.community_channel_unread(uuid), public.mark_channel_read(uuid),
  public.set_community_notify_pref(uuid, uuid, text, integer)
  to authenticated;

-- ═══════════════ 17. Nothing here is for a signed-out visitor ═══════════════
-- Supabase grants EXECUTE on every new function to anon by default. These are for signed-in members (granted above) and the
-- server; trigger functions and internal helpers are for neither. (privacy_security_audit() fails the build if one slips.)
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
             'valid_topics', 'community_role_rank', 'community_rank', 'community_can', 'is_community_staff', 'can_view_channel_row', 'can_view_channel',
             'can_read_channel_file', 'can_read_message_file', 'channel_post_state', 'set_community_branding', 'update_community_details',
             'acknowledge_community_rules', 'create_community_category', 'update_community_category', 'reorder_community_categories',
             'create_community_channel', 'update_community_channel', 'reorder_community_channels', 'move_community_channel', 'send_channel_message',
             'edit_channel_message', 'delete_channel_message', 'pin_channel_message', 'channel_messages_page', 'search_channel_messages',
             'community_channel_unread', 'mark_channel_read', 'set_community_notify_pref',
             'channel_messages_before_write', 'channel_messages_after_update', 'communities_after_insert_channels', 'communities_before_write',
             'messages_after_delete_files', '_normalize_channel', '_community_default_channels', '_require_channel_manager', '_channel_wants', '_community_audit'])
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname in ('channel_messages_before_write', 'channel_messages_after_update', 'communities_after_insert_channels', 'communities_before_write',
                     'messages_after_delete_files', '_normalize_channel', '_community_default_channels', '_require_channel_manager', '_channel_wants', '_community_audit') then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

-- Structure changes (a channel created, renamed or archived) reach open sidebars live, so a member never clicks a channel that is gone.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_channels') then
    alter publication supabase_realtime add table public.community_channels;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_categories') then
    alter publication supabase_realtime add table public.community_categories;
  end if;
end $$;

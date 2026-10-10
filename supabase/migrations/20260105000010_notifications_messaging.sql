-- 0010: notifications (with preferences + email queue) and direct messaging

-- ── Notifications ───────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  category text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  email_status text not null default 'none' check (email_status in ('none', 'pending', 'sent', 'failed', 'skipped')),
  email_attempts integer not null default 0,
  email_error text,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_email_idx on public.notifications (created_at) where email_status = 'pending';
-- One live (unread) notification per dedupe key: repeated reactions or messages do not spam.
create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null and read_at is null;

create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('social', 'connections', 'projects', 'mentorship', 'messages', 'events', 'moderation', 'announcements')),
  in_app boolean not null default true,
  email boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

-- Email is OFF by default for chatty categories; ON where a missed message has real cost.
create or replace function public.notification_email_default(p_category text)
returns boolean language sql immutable set search_path = '' as $$
  select p_category in ('projects', 'mentorship', 'moderation', 'events');
$$;

create or replace function public.notification_category(p_type text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_type in ('reaction', 'comment', 'reply', 'mention', 'repost', 'follow') then 'social'
    when p_type in ('connection_request', 'connection_accepted') then 'connections'
    when p_type like 'project_%' then 'projects'
    when p_type like 'mentorship_%' then 'mentorship'
    when p_type = 'message' then 'messages'
    when p_type like 'event_%' then 'events'
    when p_type like 'moderation_%' then 'moderation'
    when p_type = 'announcement' then 'announcements'
    else 'social' end;
$$;

-- The single way a notification is created. Honours blocks and the recipient's preferences.
create or replace function public.notify(
  p_user uuid, p_type text, p_actor uuid default null, p_entity_type text default null,
  p_entity_id uuid default null, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cat text := public.notification_category(p_type);
  v_pref public.notification_preferences%rowtype;
  v_in_app boolean := true;
  v_email boolean;
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and public.is_blocked_between(p_user, p_actor) then return; end if;
  if not exists (select 1 from public.profiles where id = p_user and status in ('active', 'restricted')) then return; end if;

  select * into v_pref from public.notification_preferences where user_id = p_user and category = v_cat;
  if found then v_in_app := v_pref.in_app; v_email := v_pref.email; else v_email := public.notification_email_default(v_cat); end if;
  if not v_in_app and not v_email then return; end if;

  insert into public.notifications (user_id, type, category, actor_id, entity_type, entity_id, data, dedupe_key, email_status, read_at)
  values (
    p_user, p_type, v_cat, p_actor, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb), p_dedupe,
    case when v_email then 'pending' else 'none' end,
    case when v_in_app then null else now() end  -- email-only: nothing to show in the bell
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null do nothing;
end; $$;
revoke execute on function public.notify(uuid, text, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.notify(uuid, text, uuid, text, uuid, jsonb, text) to service_role;

create or replace function public.mark_notification_read(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where id = p_id and user_id = (select auth.uid()) and read_at is null;
$$;
create or replace function public.mark_all_notifications_read(p_category text default null)
returns integer language sql security definer set search_path = '' as $$
  with u as (
    update public.notifications set read_at = now()
    where user_id = (select auth.uid()) and read_at is null and (p_category is null or category = p_category)
    returning 1)
  select count(*)::integer from u;
$$;
create or replace function public.unread_notification_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.notifications where user_id = (select auth.uid()) and read_at is null;
$$;
grant execute on function public.mark_notification_read(uuid), public.mark_all_notifications_read(text), public.unread_notification_count() to authenticated;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
grant select on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.notification_preferences to authenticated;
revoke update on public.notification_preferences from authenticated;
grant update (in_app, email, updated_at) on public.notification_preferences to authenticated;
create policy prefs_select on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_insert on public.notification_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy prefs_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy prefs_delete on public.notification_preferences for delete to authenticated using (user_id = (select auth.uid()));

-- Batch claim for the email worker (service role only).
create or replace function public.claim_notification_emails(p_limit integer default 100, p_min_age_sec integer default 90)
returns setof public.notifications language sql security definer set search_path = '' as $$
  update public.notifications n set email_attempts = email_attempts + 1
  where n.id in (
    select id from public.notifications
    where email_status = 'pending' and created_at < now() - make_interval(secs => p_min_age_sec) and email_attempts < 3
    order by created_at limit least(greatest(p_limit, 1), 500) for update skip locked)
  returning n.*;
$$;
revoke execute on function public.claim_notification_emails(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer, integer) to service_role;

-- ── Notification triggers on existing features ──────────────────────────────
create or replace function public._snippet(p text, p_len integer default 140)
returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'), p_len);
$$;

create or replace function public.trg_notify_reaction() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.posts%rowtype;
begin
  select * into p from public.posts where id = new.post_id;
  perform public.notify(p.author_id, 'reaction', new.user_id, 'post', p.id,
    jsonb_build_object('slug', p.slug, 'category', p.category, 'title', coalesce(p.title, public._snippet(p.body, 60)), 'reaction', new.reaction),
    'reaction:' || p.id || ':' || new.user_id);
  return null;
end; $$;
create trigger trg_notify_reaction after insert on public.post_reactions for each row execute function public.trg_notify_reaction();

create or replace function public.trg_notify_comment() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.posts%rowtype; parent_author uuid;
begin
  select * into p from public.posts where id = new.post_id;
  perform public.notify(p.author_id, 'comment', new.author_id, 'post', p.id,
    jsonb_build_object('slug', p.slug, 'category', p.category, 'title', coalesce(p.title, public._snippet(p.body, 60)), 'snippet', public._snippet(new.body)),
    'comment:' || p.id);
  if new.parent_id is not null then
    select author_id into parent_author from public.comments where id = new.parent_id;
    if parent_author is distinct from p.author_id then
      perform public.notify(parent_author, 'reply', new.author_id, 'post', p.id,
        jsonb_build_object('slug', p.slug, 'category', p.category, 'title', coalesce(p.title, public._snippet(p.body, 60)), 'snippet', public._snippet(new.body)),
        'reply:' || new.parent_id);
    end if;
  end if;
  return null;
end; $$;
create trigger trg_notify_comment after insert on public.comments for each row execute function public.trg_notify_comment();

create or replace function public.trg_notify_mention() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.posts%rowtype; c public.comments%rowtype; v_actor uuid; v_slug text; v_cat text; v_title text; v_vis boolean;
begin
  if new.entity_type = 'post' then
    select * into p from public.posts where id = new.entity_id;
    if not found then return null; end if;
    v_actor := p.author_id; v_slug := p.slug; v_cat := p.category; v_title := coalesce(p.title, public._snippet(p.body, 60));
    -- only notify people who could actually see the post
    if p.visibility in ('private', 'connections') and not public.are_connected(p.author_id, new.mentioned_user_id) then return null; end if;
  else
    select * into c from public.comments where id = new.entity_id;
    if not found then return null; end if;
    select * into p from public.posts where id = c.post_id;
    v_actor := c.author_id; v_slug := p.slug; v_cat := p.category; v_title := coalesce(p.title, public._snippet(p.body, 60));
  end if;
  perform public.notify(new.mentioned_user_id, 'mention', v_actor, 'post', p.id,
    jsonb_build_object('slug', v_slug, 'category', v_cat, 'title', v_title), 'mention:' || new.entity_id);
  return null;
end; $$;
create trigger trg_notify_mention after insert on public.mentions for each row execute function public.trg_notify_mention();

create or replace function public.trg_notify_repost() returns trigger language plpgsql security definer set search_path = '' as $$
declare o public.posts%rowtype;
begin
  if new.repost_of_id is null then return null; end if;
  select * into o from public.posts where id = new.repost_of_id;
  perform public.notify(o.author_id, 'repost', new.author_id, 'post', o.id,
    jsonb_build_object('slug', o.slug, 'category', o.category, 'title', coalesce(o.title, public._snippet(o.body, 60))),
    'repost:' || o.id || ':' || new.author_id);
  return null;
end; $$;
create trigger trg_notify_repost after insert on public.posts for each row execute function public.trg_notify_repost();

create or replace function public.trg_notify_follow() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.following_id, 'follow', new.follower_id, 'user', new.follower_id, '{}'::jsonb, 'follow:' || new.follower_id);
  return null;
end; $$;
create trigger trg_notify_follow after insert on public.follows for each row execute function public.trg_notify_follow();

create or replace function public.trg_notify_connection() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify(new.recipient_id, 'connection_request', new.requester_id, 'user', new.requester_id,
      jsonb_build_object('message', public._snippet(new.message, 140)), 'conn-req:' || new.id);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    perform public.notify(new.requester_id, 'connection_accepted', new.recipient_id, 'user', new.recipient_id, '{}'::jsonb, 'conn-ok:' || new.id);
  end if;
  return null;
end; $$;
create trigger trg_notify_connection after insert or update of status on public.connection_requests for each row execute function public.trg_notify_connection();

create or replace function public.trg_notify_project_join() returns trigger language plpgsql security definer set search_path = '' as $$
declare pr public.projects%rowtype; m record;
begin
  select * into pr from public.projects where id = new.project_id;
  if tg_op = 'INSERT' then
    for m in select user_id from public.project_members where project_id = new.project_id and role in ('owner', 'manager') loop
      perform public.notify(m.user_id, 'project_join_request', new.user_id, 'project', pr.id,
        jsonb_build_object('slug', pr.slug, 'name', pr.name, 'message', public._snippet(new.message)), 'pj-req:' || new.id || ':' || m.user_id);
    end loop;
  elsif new.status in ('accepted', 'rejected') and old.status = 'pending' then
    perform public.notify(new.user_id, 'project_join_decision', new.decided_by, 'project', pr.id,
      jsonb_build_object('slug', pr.slug, 'name', pr.name, 'accepted', new.status = 'accepted'), 'pj-dec:' || new.id);
  end if;
  return null;
end; $$;
create trigger trg_notify_project_join after insert or update of status on public.project_join_requests for each row execute function public.trg_notify_project_join();

create or replace function public.trg_notify_project_invite() returns trigger language plpgsql security definer set search_path = '' as $$
declare pr public.projects%rowtype;
begin
  select * into pr from public.projects where id = new.project_id;
  if tg_op = 'INSERT' then
    perform public.notify(new.invitee_id, 'project_invitation', new.invited_by, 'project', pr.id,
      jsonb_build_object('slug', pr.slug, 'name', pr.name, 'role', new.role_label, 'message', public._snippet(new.message)), 'pj-inv:' || new.id);
  elsif new.status in ('accepted', 'declined') and old.status = 'pending' and new.invited_by is not null then
    perform public.notify(new.invited_by, 'project_invitation_response', new.invitee_id, 'project', pr.id,
      jsonb_build_object('slug', pr.slug, 'name', pr.name, 'accepted', new.status = 'accepted'), 'pj-inv-resp:' || new.id);
  end if;
  return null;
end; $$;
create trigger trg_notify_project_invite after insert or update of status on public.project_invitations for each row execute function public.trg_notify_project_invite();

create or replace function public.trg_notify_mentorship() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.mentor_id, 'mentorship_request', new.mentee_id, 'mentorship', new.id,
      jsonb_build_object('topic', new.topic, 'message', public._snippet(new.message)), 'mt-req:' || new.id);
  elsif new.status in ('accepted', 'declined') and old.status = 'pending' then
    perform public.notify(new.mentee_id, 'mentorship_response', new.mentor_id, 'mentorship', new.id,
      jsonb_build_object('accepted', new.status = 'accepted', 'message', public._snippet(new.response_message)), 'mt-resp:' || new.id);
  end if;
  return null;
end; $$;
create trigger trg_notify_mentorship after insert or update of status on public.mentorship_requests for each row execute function public.trg_notify_mentorship();

-- ── Direct messaging ────────────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members(user_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  status text not null default 'sent' check (status in ('sent', 'deleted')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index messages_conv_idx on public.messages (conversation_id, created_at desc, id desc);
create table public.message_attachments (
  message_id uuid not null references public.messages(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  primary key (message_id, file_id)
);

create or replace function public.is_conversation_member(p_conv uuid, p_user uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members m where m.conversation_id = p_conv and m.user_id = coalesce(p_user, (select auth.uid())));
$$;

-- Server-side messaging permission: both active, nobody blocked, and the recipient's own setting allows it.
create or replace function public.can_message(p_sender uuid, p_recipient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_sender <> p_recipient
    and exists (select 1 from public.profiles s where s.id = p_sender and s.status = 'active')
    and not public.is_blocked_between(p_sender, p_recipient)
    and coalesce((
      select case r.allow_messages_from
        when 'everyone' then true
        when 'college' then (r.college_id is not null and r.college_id = (select college_id from public.profiles where id = p_sender))
                            or public.are_connected(p_sender, p_recipient)
        when 'connections' then public.are_connected(p_sender, p_recipient)
        else false end
      from public.profiles r where r.id = p_recipient and r.status in ('active', 'restricted')
    ), false);
$$;

create or replace function public.can_send_in_conversation(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_conversation_member(p_conv)
    and public.is_active_user()
    and not exists (
      select 1 from public.conversation_members o
      where o.conversation_id = p_conv and o.user_id <> (select auth.uid())
        and not public.can_message((select auth.uid()), o.user_id));
$$;

create or replace function public.start_direct_conversation(p_other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_key text; v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.can_message(v_me, p_other) then raise exception 'cannot_message' using errcode = '42501'; end if;
  v_key := least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text;
  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is null then
    begin
      insert into public.conversations(direct_key, created_by) values (v_key, v_me) returning id into v_id;
      insert into public.conversation_members(conversation_id, user_id) values (v_id, v_me), (v_id, p_other);
    exception when unique_violation then
      select id into v_id from public.conversations where direct_key = v_key;
    end;
  end if;
  return v_id;
end; $$;

create or replace function public.mark_conversation_read(p_conv uuid)
returns void language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = (select auth.uid());
  update public.notifications set read_at = now()
    where user_id = (select auth.uid()) and type = 'message' and entity_id = p_conv and read_at is null;
$$;

create or replace function public.unread_message_counts()
returns table (conversation_id uuid, unread bigint) language sql stable security definer set search_path = '' as $$
  select m.conversation_id, count(msg.id)
  from public.conversation_members m
  join public.messages msg on msg.conversation_id = m.conversation_id and msg.created_at > m.last_read_at
    and msg.sender_id is distinct from m.user_id and msg.status = 'sent'
  where m.user_id = (select auth.uid())
  group by m.conversation_id;
$$;

create or replace function public.messages_before_write() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'deleted' then new.body := ''; end if;
    if new.body is distinct from old.body and new.status = 'sent' then new.edited_at := now(); end if;
  end if;
  return new;
end; $$;
create trigger trg_messages_before_write before update on public.messages for each row execute function public.messages_before_write();

create or replace function public.messages_after_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  update public.conversations set last_message_at = new.created_at, last_message_preview = public._snippet(case when new.body = '' then 'Sent an attachment' else new.body end, 90) where id = new.conversation_id;
  update public.conversation_members set last_read_at = new.created_at where conversation_id = new.conversation_id and user_id = new.sender_id;
  for m in select user_id from public.conversation_members where conversation_id = new.conversation_id and user_id <> new.sender_id and not muted loop
    perform public.notify(m.user_id, 'message', new.sender_id, 'conversation', new.conversation_id,
      jsonb_build_object('snippet', public._snippet(case when new.body = '' then 'Sent an attachment' else new.body end, 100)), 'msg:' || new.conversation_id);
  end loop;
  return null;
end; $$;
create trigger trg_messages_after_insert after insert on public.messages for each row execute function public.messages_after_insert();

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

grant select on public.conversations, public.conversation_members, public.messages, public.message_attachments to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
grant update (status, body) on public.messages to authenticated;
grant insert (message_id, file_id), delete on public.message_attachments to authenticated;
grant update (muted) on public.conversation_members to authenticated;

create policy conversations_select on public.conversations for select to authenticated using (public.is_conversation_member(id));
create policy members_select on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id));
create policy members_update_own on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_send_in_conversation(conversation_id));
create policy messages_update_own on public.messages for update to authenticated
  using (sender_id = (select auth.uid()) and status = 'sent')
  with check (sender_id = (select auth.uid()) and status in ('sent', 'deleted'));
create policy message_attachments_select on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_attachments.message_id));
create policy message_attachments_insert on public.message_attachments for insert to authenticated
  with check (
    exists (select 1 from public.messages m where m.id = message_attachments.message_id and m.sender_id = (select auth.uid()))
    and exists (select 1 from public.files f where f.id = message_attachments.file_id and f.owner_id = (select auth.uid()) and f.purpose = 'message_attachment' and f.status = 'ready'));

grant execute on function
  public.is_conversation_member(uuid, uuid), public.can_message(uuid, uuid), public.can_send_in_conversation(uuid),
  public.start_direct_conversation(uuid), public.mark_conversation_read(uuid), public.unread_message_counts()
  to authenticated;

-- Attachments in a conversation are readable by its members (definer helper avoids RLS recursion).
create or replace function public.can_read_message_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_attachments a join public.messages m on m.id = a.message_id
    where a.file_id = p_file and public.is_conversation_member(m.conversation_id));
$$;
grant execute on function public.can_read_message_file(uuid) to authenticated;
create policy files_select_message_attachment on public.files for select to authenticated
  using (purpose = 'message_attachment' and status = 'ready' and public.can_read_message_file(id));

-- Realtime: members receive new messages / read receipts / notifications live (RLS filters each subscriber).
alter publication supabase_realtime add table public.messages, public.conversation_members, public.notifications;

-- Reports can now target messages. The reporter must be a participant; the reported text is snapshotted
-- so moderators can review it even if it is later deleted. Nothing else of the conversation is exposed.
create or replace function public.submit_report(
  p_target_type text, p_target_id uuid, p_category text, p_details text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid()); v_owner uuid; v_college uuid; v_snapshot jsonb; v_severity text;
  v_post public.posts%rowtype; v_comment public.comments%rowtype; v_profile public.profiles%rowtype; v_msg public.messages%rowtype;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_member() then raise exception 'account_restricted' using errcode = '42501'; end if;

  if p_target_type = 'post' then
    select * into v_post from public.posts where id = p_target_id;
    if not found or not public.can_view_post(v_post.author_id, v_post.college_id, v_post.visibility, v_post.community_id, v_post.status) then
      raise exception 'target_unavailable' using errcode = 'P0002'; end if;
    v_owner := v_post.author_id; v_college := v_post.college_id;
    v_snapshot := jsonb_build_object('slug', v_post.slug, 'category', v_post.category, 'title', v_post.title, 'body', v_post.body, 'visibility', v_post.visibility, 'posted_at', v_post.created_at);
  elsif p_target_type = 'comment' then
    select * into v_comment from public.comments where id = p_target_id;
    if not found or v_comment.status <> 'published' then raise exception 'target_unavailable' using errcode = 'P0002'; end if;
    select * into v_post from public.posts where id = v_comment.post_id;
    if not public.can_view_post(v_post.author_id, v_post.college_id, v_post.visibility, v_post.community_id, v_post.status) then
      raise exception 'target_unavailable' using errcode = 'P0002'; end if;
    v_owner := v_comment.author_id; v_college := v_post.college_id;
    v_snapshot := jsonb_build_object('post_slug', v_post.slug, 'body', v_comment.body, 'posted_at', v_comment.created_at);
  elsif p_target_type = 'user' then
    select * into v_profile from public.profiles where id = p_target_id;
    if not found or not public.can_view_profile(v_profile.id, v_profile.visibility, v_profile.college_id, v_profile.status) then
      raise exception 'target_unavailable' using errcode = 'P0002'; end if;
    v_owner := v_profile.id; v_college := v_profile.college_id;
    v_snapshot := jsonb_build_object('username', v_profile.username, 'full_name', v_profile.full_name, 'headline', v_profile.headline, 'bio', v_profile.bio);
  elsif p_target_type = 'message' then
    select * into v_msg from public.messages where id = p_target_id;
    if not found or v_msg.status <> 'sent' or not public.is_conversation_member(v_msg.conversation_id) or v_msg.sender_id = v_me then
      raise exception 'target_unavailable' using errcode = 'P0002'; end if;
    v_owner := v_msg.sender_id;
    select college_id into v_college from public.profiles where id = v_owner;
    v_snapshot := jsonb_build_object('body', v_msg.body, 'sent_at', v_msg.created_at, 'conversation_id', v_msg.conversation_id);
  else
    raise exception 'unsupported_target' using errcode = '22023';
  end if;

  if v_owner = v_me then raise exception 'cannot_report_self' using errcode = '22023'; end if;
  v_severity := case when p_category in ('self_harm', 'violence') then 'high'
    when p_category in ('sexual', 'harassment', 'hate', 'privacy', 'impersonation') then 'medium' else 'low' end;
  begin
    insert into public.reports(reporter_id, target_type, target_id, target_owner_id, college_id, category, details, severity, snapshot)
    values (v_me, p_target_type, p_target_id, v_owner, v_college, p_category, nullif(left(trim(coalesce(p_details, '')), 1000), ''), v_severity, v_snapshot)
    returning id into v_id;
  exception when unique_violation then raise exception 'already_reported' using errcode = '23505'; end;
  return v_id;
end; $$;

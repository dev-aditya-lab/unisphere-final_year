-- 0063: notifications a member controls per feature, official broadcasts, and the database half of instant message push
--
--  1. A Push switch per category (beside In app and Email). Push is a delivery of the bell's notification, so it needs the bell on.
--     notify() reads it when the notification is made: with push off the row is created already "pushed", which the worker skips.
--     The promotions category is in-app only by definition (Settings says so), and now really is: it is never pushed.
--  2. Broadcasts: an administrator sends a notification to everyone, to colleges, to communities, to named people, narrowed by
--     account type. Permission is announcements.manage: global staff may reach anyone, college staff only members of their colleges.
--  3. message_push_targets(): who must be pushed for one new message, with the mute, block, status, preference and device rules in one place.
--  4. The worker waits 15 seconds before pushing a *message* notification, so the instant push from the app goes first and the worker
--     is only the safety net if that failed (no double notification).

-- ── 1. A Push switch per category ──────────────────────────────────────────
alter table public.notification_preferences add column if not exists push boolean not null default true;
revoke update on public.notification_preferences from authenticated;
grant update (in_app, email, push, updated_at) on public.notification_preferences to authenticated;

create or replace function public.notify(
  p_user uuid, p_type text, p_actor uuid default null, p_entity_type text default null,
  p_entity_id uuid default null, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cat text := public.notification_category(p_type);
  v_pref public.notification_preferences%rowtype;
  v_in_app boolean := true;
  v_push boolean := true;
  v_email boolean;
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and public.is_blocked_between(p_user, p_actor) then return; end if;
  if not exists (select 1 from public.profiles where id = p_user and status in ('active', 'restricted')) then return; end if;

  select * into v_pref from public.notification_preferences where user_id = p_user and category = v_cat;
  if found then
    v_in_app := v_pref.in_app; v_push := v_pref.push; v_email := v_pref.email;
  else
    v_email := public.notification_email_default(v_cat);
  end if;
  -- There is no phone notification without the bell one, and "Offers & invitations" are shown only in the app.
  v_push := v_push and v_in_app and v_cat <> 'promotions';
  if not v_in_app and not v_email then return; end if;

  insert into public.notifications (user_id, type, category, actor_id, entity_type, entity_id, data, dedupe_key, email_status, read_at, pushed_at)
  values (
    p_user, p_type, v_cat, p_actor, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb), p_dedupe,
    case when v_email then 'pending' else 'none' end,
    case when v_in_app then null else now() end,   -- email-only: nothing to show in the bell
    case when v_push then null else now() end      -- push off: already "pushed", so the worker skips it
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null do nothing;
end; $$;
revoke execute on function public.notify(uuid, text, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.notify(uuid, text, uuid, text, uuid, jsonb, text) to service_role;

-- ── 2. Broadcasts ──────────────────────────────────────────────────────────
create table public.admin_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 2000),
  -- A page on this site (never another address): where tapping the notification goes.
  href text check (href is null or (href ~ '^/($|[^/\\])' and char_length(href) <= 300)),
  audience jsonb not null,
  push boolean not null default true,
  targeted integer not null default 0,
  delivered integer not null default 0,
  created_at timestamptz not null default now()
);
create index admin_broadcasts_created_idx on public.admin_broadcasts (created_at desc);
alter table public.admin_broadcasts enable row level security;
grant select on public.admin_broadcasts to authenticated;
-- Staff see the broadcasts they sent, and global staff see all of them. Sending goes through send_broadcast() only.
create policy admin_broadcasts_select on public.admin_broadcasts for select to authenticated
  using (created_by = (select auth.uid()) or public.has_permission('announcements.manage'));

-- Who an audience means, limited to what the caller may reach. `p_global`: may reach anyone; otherwise `p_colleges` bounds it.
-- The audience is a JSON object whose parts add up (a member in any part is included), and `account_types` then narrows the result:
--   { "everyone": true, "colleges": [uuid], "communities": [uuid], "usernames": ["asha"], "account_types": ["student", "alumni"] }
create or replace function public._broadcast_recipients(p_audience jsonb, p_global boolean, p_colleges uuid[])
returns table (id uuid, username text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_everyone boolean := coalesce((p_audience ->> 'everyone')::boolean, false);
  v_col uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_audience -> 'colleges', '[]'::jsonb))::uuid), '{}');
  v_com uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_audience -> 'communities', '[]'::jsonb))::uuid), '{}');
  v_names text[] := coalesce(array(select lower(jsonb_array_elements_text(coalesce(p_audience -> 'usernames', '[]'::jsonb)))), '{}');
  v_types text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_audience -> 'account_types', '[]'::jsonb))), '{}');
begin
  return query
  select p.id, p.username
  from public.profiles p
  where p.status = 'active' and p.onboarded_at is not null
    and (
      v_everyone
      or p.college_id = any (v_col)
      or exists (select 1 from public.profile_education e where e.user_id = p.id and e.college_id = any (v_col))
      or exists (select 1 from public.community_members m where m.user_id = p.id and m.status = 'active' and m.community_id = any (v_com))
      or lower(p.username) = any (v_names)
    )
    and (cardinality(v_types) = 0 or p.account_type = any (v_types))
    and (
      p_global
      or p.college_id = any (p_colleges)
      or exists (select 1 from public.profile_education e where e.user_id = p.id and e.college_id = any (p_colleges))
    );
end; $$;
revoke execute on function public._broadcast_recipients(jsonb, boolean, uuid[]) from public, anon, authenticated;

create or replace function public.broadcast_preview(p_audience jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_global boolean := public.has_permission('announcements.manage');
  v_colleges uuid[] := array(select distinct mp.college_id from public.my_permissions() mp where mp.permission = 'announcements.manage' and mp.college_id is not null);
  v_count integer;
  v_sample text[];
begin
  if not v_global and cardinality(v_colleges) = 0 then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*)::integer, (array_agg(r.username order by r.username))[1:5] into v_count, v_sample
    from public._broadcast_recipients(p_audience, v_global, v_colleges) r;
  return jsonb_build_object('count', v_count, 'sample', coalesce(to_jsonb(v_sample), '[]'::jsonb), 'global', v_global);
end; $$;

create or replace function public.send_broadcast(p_title text, p_body text, p_href text, p_audience jsonb, p_push boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_global boolean := public.has_permission('announcements.manage');
  v_colleges uuid[] := array(select distinct mp.college_id from public.my_permissions() mp where mp.permission = 'announcements.manage' and mp.college_id is not null);
  v_title text := left(trim(coalesce(p_title, '')), 100);
  v_body text := left(trim(coalesce(p_body, '')), 2000);
  v_href text := nullif(trim(coalesce(p_href, '')), '');
  v_id uuid;
  v_targeted integer;
  v_delivered integer;
begin
  if v_me is null or (not v_global and cardinality(v_colleges) = 0) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_title = '' or v_body = '' then raise exception 'invalid_message'; end if;
  if v_href is not null and v_href !~ '^/($|[^/\\])' then raise exception 'invalid_link'; end if;

  select count(*)::integer into v_targeted from public._broadcast_recipients(p_audience, v_global, v_colleges);
  if v_targeted = 0 then raise exception 'no_recipients'; end if;
  if v_targeted > 50000 then raise exception 'too_many_recipients'; end if;

  insert into public.admin_broadcasts(created_by, title, body, href, audience, push, targeted)
    values (v_me, v_title, v_body, v_href, p_audience, coalesce(p_push, true), v_targeted) returning id into v_id;

  -- One statement for everyone, with the same rules notify() applies to the "announcements" category: the member's In app switch decides
  -- whether it shows in the bell, Email whether an email is queued (off unless they chose it), Push whether the phone is told.
  -- There is no sender, so no one's block list applies: this is an official message.
  with delivered as (
    insert into public.notifications (user_id, type, category, actor_id, entity_type, entity_id, data, dedupe_key, email_status, read_at, pushed_at)
    select r.id, 'announcement', 'announcements', null, 'broadcast', v_id,
           jsonb_build_object('title', left(v_title, 100), 'snippet', public._snippet(v_body, 160), 'href', coalesce(v_href, '/notifications'), 'broadcast', v_id),
           'bc:' || v_id,
           case when coalesce(pref.email, false) then 'pending' else 'none' end,
           case when coalesce(pref.in_app, true) then null else now() end,
           case when coalesce(p_push, true) and coalesce(pref.in_app, true) and coalesce(pref.push, true) then null else now() end
    from public._broadcast_recipients(p_audience, v_global, v_colleges) r
    left join public.notification_preferences pref on pref.user_id = r.id and pref.category = 'announcements'
    where coalesce(pref.in_app, true) or coalesce(pref.email, false)
    on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null do nothing
    returning 1)
  select count(*)::integer into v_delivered from delivered;

  update public.admin_broadcasts set delivered = v_delivered where id = v_id;
  perform public.write_audit_log(v_me, 'broadcast.sent', 'broadcast', v_id::text, null,
    jsonb_build_object('audience', p_audience, 'targeted', v_targeted, 'delivered', v_delivered, 'push', coalesce(p_push, true)));
  return jsonb_build_object('id', v_id, 'targeted', v_targeted, 'delivered', v_delivered);
end; $$;

revoke execute on function public.broadcast_preview(jsonb), public.send_broadcast(text, text, text, jsonb, boolean) from public, anon;
grant execute on function public.broadcast_preview(jsonb), public.send_broadcast(text, text, text, jsonb, boolean) to authenticated;

-- ── 3. Who to push for one new message ─────────────────────────────────────
-- Not muted, not blocked either way, an account in good standing, the Messages category left on for In app and Push, and at least one
-- device to send to. `unread` counts the recipient's unread messages in the conversation, so a second message can say so.
create or replace function public.message_push_targets(p_conversation uuid, p_sender uuid)
returns table (user_id uuid, unread integer, sender_name text)
language sql stable security definer set search_path = '' as $$
  select m.user_id,
    (select count(*)::integer from public.messages msg
      where msg.conversation_id = m.conversation_id and msg.created_at > m.last_read_at and msg.sender_id is distinct from m.user_id and msg.status = 'sent'),
    (select p.full_name from public.profiles p where p.id = p_sender)
  from public.conversation_members m
  join public.profiles u on u.id = m.user_id and u.status in ('active', 'restricted')
  left join public.notification_preferences pref on pref.user_id = m.user_id and pref.category = 'messages'
  where m.conversation_id = p_conversation and m.user_id <> p_sender and not m.muted
    and not public.is_blocked_between(m.user_id, p_sender)
    and coalesce(pref.in_app, true) and coalesce(pref.push, true)
    and (exists (select 1 from public.push_devices d where d.user_id = m.user_id)
      or exists (select 1 from public.push_subscriptions s where s.user_id = m.user_id));
$$;
revoke execute on function public.message_push_targets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.message_push_targets(uuid, uuid) to service_role;

-- ── 4. The worker: messages wait 15 seconds, so the app's instant push goes first ─────────────────────────────────────────────
create or replace function public.claim_push_notifications(p_limit integer default 100)
returns table (
  id uuid, user_id uuid, type text, category text, entity_id uuid, data jsonb, actor_name text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Too old to be useful as an interruption; the bell still shows them.
  update public.notifications n set pushed_at = now()
    where n.pushed_at is null and n.created_at < now() - interval '2 hours';
  return query
    with picked as (
      select n.id from public.notifications n
      where n.pushed_at is null and n.read_at is null
        -- A message is pushed the moment it is sent (lib/services/message-push.js). If that did not happen, this picks it up 15 s later.
        and (n.type <> 'message' or n.created_at < now() - interval '15 seconds')
        and (exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
          or exists (select 1 from public.push_devices d where d.user_id = n.user_id))
      order by n.created_at
      limit least(greatest(p_limit, 1), 500)
      for update skip locked)
    update public.notifications n set pushed_at = now()
      from picked
      where n.id = picked.id
      returning n.id, n.user_id, n.type, n.category, n.entity_id, n.data,
        (select p.full_name from public.profiles p where p.id = n.actor_id), n.created_at;
end; $$;
revoke execute on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

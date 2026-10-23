-- 0055: Community workspace, part 2 of 2 (invitations, membership, roles, reports, moderation, appeals, admin views).
--
-- Builds on 0054. Same rules: every write is a SECURITY DEFINER function that checks auth.uid() itself, clients only
-- SELECT through row level security, and nothing here trusts a role, a permission or a user id sent by the client.

-- ═══════════════ 1. Notification category ═══════════════
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('social', 'connections', 'projects', 'mentorship', 'messages', 'events', 'moderation', 'announcements', 'rewards', 'promotions', 'communities'));

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
    when p_type like 'referral_reward%' or p_type = 'referral_reversed' then 'rewards'
    when p_type = 'referral_campaign' then 'promotions'
    when p_type like 'community\_%' or p_type like 'channel\_%' then 'communities'
    else 'social' end;
$$;

-- ═══════════════ 2. Invitations ═══════════════
-- A link is a random 96-bit code. Only its SHA-256 is stored, so a database reader cannot use an invite, and the code is
-- shown once, when it is created. An invite names no community until it is redeemed or previewed by a signed-in member.
create table if not exists public.community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  created_by uuid references public.profiles(id) on delete set null,
  invitee_id uuid references public.profiles(id) on delete cascade,
  note text check (note is null or char_length(note) <= 80),
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses between 1 and 1000),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_invites_idx on public.community_invites (community_id, created_at desc);
create index if not exists community_invites_creator_idx on public.community_invites (created_by, created_at desc);
create table if not exists public.community_invite_uses (
  invite_id uuid not null references public.community_invites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);
alter table public.community_invites enable row level security;
alter table public.community_invite_uses enable row level security;
grant select (id, community_id, code_hint, created_by, invitee_id, note, expires_at, max_uses, uses, revoked_at, created_at) on public.community_invites to authenticated;
drop policy if exists community_invites_select on public.community_invites;
create policy community_invites_select on public.community_invites for select to authenticated
  using (created_by = (select auth.uid()) or public.community_can(community_id, 'invites.manage'));

create or replace function public.create_community_invite(p_community uuid, p_hours integer, p_max_uses integer, p_invitee uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._assert_active_member(); c public.communities%rowtype; v_staff boolean; v_code text; v_id uuid;
  v_hours integer := least(greatest(coalesce(p_hours, 168), 1), 24 * 90); v_max integer := p_max_uses;
begin
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found or public.community_rank(p_community) < 1 then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_staff := public.community_can(p_community, 'invites.manage');
  if not v_staff and c.invite_policy <> 'members' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not v_staff then v_hours := least(v_hours, 168); v_max := least(coalesce(v_max, 25), 25); end if;
  if (select count(*) from public.community_invites where created_by = v_me and created_at > now() - interval '1 hour') >= 10 then raise exception 'rate_limited' using errcode = '54000'; end if;
  if (select count(*) from public.community_invites where community_id = p_community and revoked_at is null and expires_at > now()) >= 100 then raise exception 'limit_reached' using errcode = '54000'; end if;
  if p_invitee is not null then
    -- a named invite works once, for that person only
    if p_invitee = v_me or not exists (select 1 from public.profiles where id = p_invitee and status = 'active') or public.is_blocked_between(v_me, p_invitee)
       or exists (select 1 from public.community_members where community_id = p_community and user_id = p_invitee) then
      raise exception 'invalid_invitee' using errcode = '22023'; end if;
    v_max := 1;
  end if;
  v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);
  insert into public.community_invites (community_id, code_hash, code_hint, created_by, invitee_id, note, expires_at, max_uses)
  values (p_community, encode(sha256(convert_to(v_code, 'utf8')), 'hex'), right(v_code, 4), v_me, p_invitee, nullif(btrim(coalesce(p_note, '')), ''), now() + make_interval(hours => v_hours), v_max)
  returning id into v_id;
  if p_invitee is not null then
    perform public.notify(p_invitee, 'community_invite', v_me, 'community', p_community,
      jsonb_build_object('slug', c.slug, 'name', c.name, 'code', v_code), 'cinv:' || v_id);
  end if;
  perform public._community_audit(p_community, 'invite.created', 'invite', v_id::text, jsonb_build_object('hours', v_hours, 'max_uses', v_max, 'named', p_invitee is not null));
  return jsonb_build_object('id', v_id, 'code', v_code, 'expires_in_hours', v_hours);
end; $$;

create or replace function public.revoke_community_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.community_invites%rowtype;
begin
  perform public._assert_active_member();
  select * into i from public.community_invites where id = p_invite;
  if not found or not (i.created_by = (select auth.uid()) or public.community_can(i.community_id, 'invites.manage')) then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.community_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
  perform public._community_audit(i.community_id, 'invite.revoked', 'invite', p_invite::text);
end; $$;

-- One answer for a bad code, whether it never existed, expired, was revoked, ran out, belongs to someone else, or the
-- caller is banned: nothing here lets a caller learn which, or enumerate communities.
create or replace function public._usable_invite(p_code text)
returns public.community_invites language plpgsql stable security definer set search_path = '' as $$
declare i public.community_invites%rowtype;
begin
  if p_code is null or p_code !~ '^[0-9a-f]{24}$' then return null; end if;
  select * into i from public.community_invites where code_hash = encode(sha256(convert_to(p_code, 'utf8')), 'hex');
  if not found or i.revoked_at is not null or i.expires_at <= now() or (i.max_uses is not null and i.uses >= i.max_uses) then return null; end if;
  if i.invitee_id is not null and i.invitee_id is distinct from (select auth.uid()) then return null; end if;
  if not exists (select 1 from public.communities where id = i.community_id and deleted_at is null) then return null; end if;
  if exists (select 1 from public.community_members where community_id = i.community_id and user_id = (select auth.uid()) and status = 'banned') then return null; end if;
  return i;
end; $$;
revoke execute on function public._usable_invite(text) from public, anon, authenticated;

create or replace function public.preview_community_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare i public.community_invites%rowtype; c public.communities%rowtype; v_status text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  i := public._usable_invite(p_code);
  if i.id is null then return jsonb_build_object('valid', false); end if;
  select * into c from public.communities where id = i.community_id;
  select status into v_status from public.community_members where community_id = c.id and user_id = (select auth.uid());
  return jsonb_build_object('valid', true, 'already_member', coalesce(v_status = 'active', false), 'name', c.name, 'kind', c.kind, 'description', left(coalesce(c.description, ''), 300),
    'avatar_key', c.avatar_key, 'cover_key', c.cover_key, 'member_count', c.member_count, 'slug', case when v_status = 'active' then c.slug else null end);
end; $$;

create or replace function public.redeem_community_invite(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); i public.community_invites%rowtype; c public.communities%rowtype; v_status text; v_rows integer;
begin
  i := public._usable_invite(p_code);
  if i.id is null then raise exception 'invite_invalid' using errcode = '22023'; end if;
  -- lock the row so two redemptions of a one-use invite cannot both succeed
  select * into i from public.community_invites where id = i.id for update;
  if (i.max_uses is not null and i.uses >= i.max_uses) or i.revoked_at is not null then raise exception 'invite_invalid' using errcode = '22023'; end if;
  select * into c from public.communities where id = i.community_id;
  select status into v_status from public.community_members where community_id = c.id and user_id = v_me;
  if v_status = 'active' then return c.slug; end if;
  insert into public.community_members (community_id, user_id, status) values (c.id, v_me, 'active')
  on conflict (community_id, user_id) do update set status = 'active' where public.community_members.status = 'pending';
  insert into public.community_invite_uses (invite_id, user_id) values (i.id, v_me) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then update public.community_invites set uses = uses + 1 where id = i.id; end if;
  perform public._community_audit(c.id, 'member.joined_invite', 'user', v_me::text, jsonb_build_object('invite', i.id));
  return c.slug;
end; $$;

-- ═══════════════ 3. Membership ═══════════════
-- Joining keeps its old behaviour (open / request / invite-only, banned people refused) and now leaves a trail and tells
-- the people who can approve a request.
create or replace function public.join_community(p_community uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); c public.communities%rowtype; existing public.community_members%rowtype; v_status text; s uuid;
begin
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found or not public.can_view_community(c.id, c.college_id, c.visibility, c.deleted_at) then raise exception 'community_unavailable' using errcode = 'P0002'; end if;
  select * into existing from public.community_members where community_id = p_community and user_id = v_me;
  if found then
    if existing.status = 'banned' then raise exception 'banned' using errcode = '42501'; end if;
    return existing.status;
  end if;
  if c.join_policy = 'invite' then raise exception 'invite_only' using errcode = '42501'; end if;
  v_status := case when c.join_policy = 'open' then 'active' else 'pending' end;
  insert into public.community_members (community_id, user_id, status) values (p_community, v_me, v_status);
  perform public._community_audit(p_community, case when v_status = 'active' then 'member.joined' else 'member.requested' end, 'user', v_me::text);
  if v_status = 'pending' then
    for s in select user_id from public.community_members where community_id = p_community and status = 'active' and role in ('owner', 'admin', 'moderator') limit 10 loop
      perform public.notify(s, 'community_join_request', v_me, 'community', p_community, jsonb_build_object('slug', c.slug, 'name', c.name), 'cjr:' || p_community || ':' || v_me);
    end loop;
  end if;
  return v_status;
end; $$;

create or replace function public.leave_community(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if exists (select 1 from public.community_members where community_id = p_community and user_id = v_me and role = 'owner') then
    raise exception 'owner_cannot_leave' using errcode = '42501';
  end if;
  delete from public.community_members where community_id = p_community and user_id = v_me and status <> 'banned';
  if found then
    -- what a person leaves behind is their own preferences and read positions; their messages stay, attributed to them
    delete from public.channel_reads r using public.community_channels ch where r.channel_id = ch.id and ch.community_id = p_community and r.user_id = v_me;
    delete from public.community_notify_prefs where community_id = p_community and user_id = v_me;
    perform public._community_audit(p_community, 'member.left', 'user', v_me::text);
  end if;
end; $$;

create or replace function public.respond_community_membership(p_community uuid, p_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.communities%rowtype;
begin
  if not public.community_can(p_community, 'members.approve') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_accept then
    update public.community_members set status = 'active' where community_id = p_community and user_id = p_user and status = 'pending';
  else
    delete from public.community_members where community_id = p_community and user_id = p_user and status = 'pending';
  end if;
  if found then
    perform public._community_audit(p_community, case when p_accept then 'member.approved' else 'member.declined' end, 'user', p_user::text);
    perform public.notify(p_user, 'community_join_decision', (select auth.uid()), 'community', p_community,
      jsonb_build_object('slug', c.slug, 'name', c.name, 'accepted', p_accept), 'cjd:' || p_community || ':' || p_user || ':' || p_accept::text);
  end if;
end; $$;

-- Roles. The owner appoints admins; admins appoint moderators; nobody changes someone who ranks equal or higher, nobody
-- changes themselves, and the owner's role changes only through transfer_community_ownership().
create or replace function public.set_community_member_role(p_community uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); t public.community_members%rowtype; c public.communities%rowtype;
begin
  if p_role not in ('admin', 'moderator', 'member') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select * into t from public.community_members where community_id = p_community and user_id = p_user;
  if not found or t.status <> 'active' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_user = v_me or t.role = 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if t.role = p_role then return; end if;
  if p_role = 'admin' or t.role = 'admin' then
    if not public.community_can(p_community, 'roles.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  else
    if not public.community_can(p_community, 'roles.manage_limited') then raise exception 'forbidden' using errcode = '42501'; end if;
    if public.community_rank(p_community) <= public.community_role_rank(t.role) then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  update public.community_members set role = p_role where community_id = p_community and user_id = p_user;
  select * into c from public.communities where id = p_community;
  perform public._community_audit(p_community, 'role.changed', 'user', p_user::text, jsonb_build_object('from', t.role, 'to', p_role));
  perform public.notify(p_user, 'community_role', v_me, 'community', p_community, jsonb_build_object('slug', c.slug, 'name', c.name, 'role', p_role), 'crole:' || p_community || ':' || p_user || ':' || p_role);
end; $$;

-- Handing the community over. The caller must be the owner, must type the community's address as confirmation, and the new
-- owner must already be an active member. The old owner stays on as an admin, so the community is never without an owner
-- and never loses its staff by accident.
create or replace function public.transfer_community_ownership(p_community uuid, p_user uuid, p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); c public.communities%rowtype;
begin
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.community_can(p_community, 'community.transfer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = v_me or not exists (select 1 from public.community_members where community_id = p_community and user_id = p_user and status = 'active') then raise exception 'invalid_target' using errcode = '22023'; end if;
  if p_confirm is distinct from c.slug then raise exception 'confirmation_mismatch' using errcode = '22023'; end if;
  update public.community_members set role = 'admin' where community_id = p_community and user_id = v_me;
  update public.community_members set role = 'owner' where community_id = p_community and user_id = p_user;
  perform public._community_audit(p_community, 'owner.transferred', 'user', p_user::text, jsonb_build_object('from', v_me));
  perform public.notify(p_user, 'community_role', v_me, 'community', p_community, jsonb_build_object('slug', c.slug, 'name', c.name, 'role', 'owner'), 'crole:' || p_community || ':' || p_user || ':owner');
end; $$;

-- Pre-existing entry point kept for the old screens and tests: it now routes through the new checks.
create or replace function public.manage_community_member(p_community uuid, p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action in ('make_admin', 'make_moderator', 'make_member') then
    if not exists (select 1 from public.community_members where community_id = p_community and user_id = p_user) then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform public.set_community_member_role(p_community, p_user, substr(p_action, 6));
  elsif p_action in ('remove', 'ban') then
    perform public.moderate_member(p_community, p_user, p_action, 'Removed by community staff', null, null);
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;
end; $$;

-- ═══════════════ 4. Moderation actions ═══════════════
create table if not exists public.community_mod_actions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  report_id uuid,
  actor_id uuid,
  target_user_id uuid references public.profiles(id) on delete cascade,
  action text not null check (action in ('warn', 'timeout', 'clear_timeout', 'remove', 'ban', 'unban', 'remove_message', 'note', 'appeal_reversal')),
  reason text check (reason is null or char_length(reason) <= 1000),
  channel_id uuid references public.community_channels(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_mod_actions_idx on public.community_mod_actions (community_id, created_at desc);
create index if not exists community_mod_actions_target_idx on public.community_mod_actions (target_user_id, created_at desc);
alter table public.community_mod_actions enable row level security;
grant select on public.community_mod_actions to authenticated;
-- The person acted on sees what was done and why (never a private note). Staff see the community's record, except where
-- they are the person it is about.
drop policy if exists community_mod_actions_select on public.community_mod_actions;
create policy community_mod_actions_select on public.community_mod_actions for select to authenticated
  using ((target_user_id = (select auth.uid()) and action <> 'note')
         or (public.is_community_staff(community_id) and target_user_id is distinct from (select auth.uid())));

create or replace function public.moderate_member(p_community uuid, p_user uuid, p_action text, p_reason text, p_hours integer default null, p_report uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._assert_active_member(); t public.community_members%rowtype; c public.communities%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_id uuid; v_until timestamptz; v_perm text; v_rank_me integer;
begin
  if p_action not in ('warn', 'timeout', 'clear_timeout', 'remove', 'ban', 'unban', 'note') then raise exception 'invalid_action' using errcode = '22023'; end if;
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_perm := case when p_action in ('remove', 'ban', 'unban') then 'members.ban' else 'members.restrict' end;
  if not public.community_can(p_community, v_perm) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = v_me then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into t from public.community_members where community_id = p_community and user_id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_rank_me := public.community_rank(p_community);
  if t.role = 'owner' or public.community_role_rank(t.role) >= v_rank_me then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action in ('warn', 'timeout', 'remove', 'ban', 'note') and (v_reason is null or char_length(v_reason) < 3) then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_action in ('warn', 'timeout', 'clear_timeout', 'note') and t.status <> 'active' then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_action = 'timeout' then
    if p_hours is null or p_hours < 1 or p_hours > 672 then raise exception 'invalid_duration' using errcode = '22023'; end if;
    v_until := now() + make_interval(hours => p_hours);
    update public.community_members set muted_until = v_until where community_id = p_community and user_id = p_user;
  elsif p_action = 'clear_timeout' then
    update public.community_members set muted_until = null where community_id = p_community and user_id = p_user;
  elsif p_action = 'remove' then
    delete from public.community_members where community_id = p_community and user_id = p_user;
  elsif p_action = 'ban' then
    update public.community_members set status = 'banned', role = 'member', muted_until = null where community_id = p_community and user_id = p_user;
  elsif p_action = 'unban' then
    if t.status <> 'banned' then raise exception 'not_found' using errcode = 'P0002'; end if;
    delete from public.community_members where community_id = p_community and user_id = p_user;
  end if;

  insert into public.community_mod_actions (community_id, report_id, actor_id, target_user_id, action, reason, expires_at)
  values (p_community, p_report, v_me, p_user, p_action, v_reason, v_until) returning id into v_id;
  perform public._community_audit(p_community, 'member.' || p_action, 'user', p_user::text, jsonb_build_object('action', v_id, 'hours', p_hours));

  if p_action <> 'note' then
    perform public.notify(p_user, 'moderation_community_action', v_me, 'community', p_community,
      jsonb_build_object('slug', c.slug, 'name', c.name, 'action', p_action, 'reason', left(coalesce(v_reason, ''), 300), 'until', v_until, 'action_id', v_id),
      'mca:' || v_id);
  end if;
  if p_report is not null then
    update public.community_reports set status = 'action_taken', resolved_by = v_me, resolved_at = now(), resolution = coalesce(v_reason, resolution), updated_at = now()
    where id = p_report and community_id = p_community and status in ('open', 'reviewing');
  end if;
  return v_id;
end; $$;

-- ═══════════════ 5. Reports ═══════════════
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('channel_message', 'member')),
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  channel_id uuid references public.community_channels(id) on delete set null,
  category text not null check (category in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'misinformation', 'impersonation', 'scam', 'self_harm', 'privacy', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'action_taken', 'dismissed', 'appealed')),
  snapshot jsonb not null default '{}'::jsonb,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  resolved_by uuid,
  resolved_at timestamptz,
  escalated_at timestamptz,
  evidence_purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists community_reports_one_open_idx on public.community_reports (reporter_id, target_type, target_id) where status in ('open', 'reviewing');
create index if not exists community_reports_queue_idx on public.community_reports (community_id, status, severity, created_at);
create index if not exists community_reports_escalated_idx on public.community_reports (escalated_at) where escalated_at is not null;
create index if not exists community_reports_target_idx on public.community_reports (target_id);

alter table public.community_mod_actions drop constraint if exists community_mod_actions_report_fk;
alter table public.community_mod_actions add constraint community_mod_actions_report_fk
  foreign key (report_id) references public.community_reports(id) on delete set null;

alter table public.community_reports enable row level security;
grant select on public.community_reports to authenticated;
-- Scope: staff see a community's reports only about people who rank BELOW them (so a moderator never sees a report about an
-- admin, and nobody sees a report about themselves). Reports about the owner go straight to the platform team. The reporter
-- always sees their own. Platform staff see only what was escalated.
drop policy if exists community_reports_select on public.community_reports;
create policy community_reports_select on public.community_reports for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or (
      target_user_id is distinct from (select auth.uid())
      and public.community_can(community_id, 'reports.review')
      and public.community_rank(community_id) > public.community_rank(community_id, target_user_id)
    )
    or (escalated_at is not null and exists (select 1 from public.communities c where c.id = community_id and public.has_permission('reports.view', c.college_id)))
  );

create or replace function public.submit_community_report(p_community uuid, p_target_type text, p_target_id uuid, p_category text, p_details text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid()); c public.communities%rowtype; m public.channel_messages%rowtype; ch public.community_channels%rowtype;
  v_target uuid; v_snapshot jsonb; v_severity text; v_id uuid; v_existing uuid; s uuid; v_escalate boolean := false;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_member() then raise exception 'account_restricted' using errcode = '42501'; end if;
  if p_target_type not in ('channel_message', 'member') then raise exception 'invalid_target' using errcode = '22023'; end if;
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found or public.community_rank(p_community) < 1 then raise exception 'not_found' using errcode = 'P0002'; end if;

  select id into v_existing from public.community_reports where reporter_id = v_me and target_type = p_target_type and target_id = p_target_id and status in ('open', 'reviewing');
  if v_existing is not null then return jsonb_build_object('id', v_existing, 'duplicate', true); end if;
  if (select count(*) from public.community_reports where reporter_id = v_me and created_at > now() - interval '1 hour') >= 10 then raise exception 'rate_limited' using errcode = '54000'; end if;

  if p_target_type = 'channel_message' then
    select * into m from public.channel_messages where id = p_target_id and community_id = p_community;
    if not found or m.status <> 'sent' or not public.can_view_channel(m.channel_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    select * into ch from public.community_channels where id = m.channel_id;
    v_target := m.author_id;
    -- Evidence is captured now, because the message may be deleted before anyone reads the report. The two messages before it
    -- are included so a reply or a joke is not judged without its context. Kept only as long as the retention setting allows.
    v_snapshot := jsonb_build_object('channel', ch.name, 'body', m.body, 'posted_at', m.created_at,
      'attachments', coalesce((select jsonb_agg(jsonb_build_object('name', a ->> 'original_name', 'type', a ->> 'mime_type')) from jsonb_array_elements(m.attachments) a), '[]'::jsonb),
      'context', coalesce((select jsonb_agg(jsonb_build_object('author', x.author_id, 'body', left(x.body, 300), 'at', x.created_at) order by x.created_at)
                           from (select * from public.channel_messages p where p.channel_id = m.channel_id and p.status = 'sent' and (p.created_at, p.id) < (m.created_at, m.id) order by p.created_at desc, p.id desc limit 2) x), '[]'::jsonb));
  else
    if not exists (select 1 from public.community_members where community_id = p_community and user_id = p_target_id and status in ('active', 'pending')) then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_target := p_target_id;
    v_snapshot := (select jsonb_build_object('username', p.username, 'full_name', p.full_name, 'role', mm.role)
                   from public.profiles p join public.community_members mm on mm.user_id = p.id and mm.community_id = p_community where p.id = p_target_id);
  end if;
  if v_target = v_me then raise exception 'invalid_target' using errcode = '22023'; end if;

  v_severity := case when p_category in ('violence', 'self_harm', 'hate') then 'high' when p_category in ('harassment', 'sexual', 'scam', 'impersonation') then 'medium' else 'low' end;
  v_escalate := v_target is not null and public.community_rank(p_community, v_target) >= 4;   -- nobody inside outranks the owner
  insert into public.community_reports (community_id, reporter_id, target_type, target_id, target_user_id, channel_id, category, details, severity, snapshot, escalated_at)
  values (p_community, v_me, p_target_type, p_target_id, v_target, m.channel_id, p_category, nullif(btrim(coalesce(p_details, '')), ''), v_severity, coalesce(v_snapshot, '{}'::jsonb),
          case when v_escalate then now() end)
  returning id into v_id;

  for s in select user_id from public.community_members
           where community_id = p_community and status = 'active' and role in ('owner', 'admin', 'moderator') and user_id <> v_me and user_id is distinct from v_target limit 10 loop
    perform public.notify(s, 'moderation_community_report', v_me, 'community', p_community, jsonb_build_object('slug', c.slug, 'name', c.name), 'cr:' || p_community || ':' || p_target_id);
  end loop;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end; $$;

create or replace function public.update_community_report(p_report uuid, p_status text, p_resolution text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); r public.community_reports%rowtype;
begin
  if p_status not in ('reviewing', 'dismissed', 'action_taken') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into r from public.community_reports where id = p_report;
  -- visibility follows the policy: a report the caller may not see does not exist for them
  if not found or not public.community_can(r.community_id, 'reports.review') or r.target_user_id = v_me
     or public.community_rank(r.community_id) <= public.community_rank(r.community_id, r.target_user_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status in ('dismissed', 'action_taken', 'appealed') and p_status = 'reviewing' then raise exception 'already_closed' using errcode = '22023'; end if;
  update public.community_reports set status = p_status, resolution = case when p_status = 'reviewing' then resolution else nullif(btrim(coalesce(p_resolution, '')), '') end,
    resolved_by = case when p_status = 'reviewing' then null else v_me end, resolved_at = case when p_status = 'reviewing' then null else now() end, updated_at = now()
  where id = p_report;
  if p_status <> 'reviewing' and r.reporter_id is not null then
    perform public.notify(r.reporter_id, 'moderation_report_outcome', null, 'community', r.community_id, jsonb_build_object('actioned', p_status = 'action_taken'), 'crout:' || p_report);
  end if;
  perform public._community_audit(r.community_id, 'report.' || p_status, 'report', p_report::text);
end; $$;

create or replace function public.escalate_community_report(p_report uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); r public.community_reports%rowtype;
begin
  select * into r from public.community_reports where id = p_report;
  if not found or not public.community_can(r.community_id, 'reports.review') or r.target_user_id = v_me then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.community_reports set escalated_at = coalesce(escalated_at, now()), updated_at = now() where id = p_report;
  perform public._community_audit(r.community_id, 'report.escalated', 'report', p_report::text);
end; $$;

-- Removing a message is a moderation action: it is logged, the author is told, and they may appeal. (Replaces the 0054 version.)
drop function if exists public.delete_channel_message(uuid);
create or replace function public.delete_channel_message(p_message uuid, p_reason text default null, p_report uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); m public.channel_messages%rowtype; c public.communities%rowtype; v_id uuid; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into m from public.channel_messages where id = p_message;
  if not found or not public.can_view_channel(m.channel_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.status <> 'sent' then return jsonb_build_object('id', m.id, 'status', m.status); end if;
  if m.author_id = v_me then
    if not public.community_can(m.community_id, 'messages.delete_own') then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.channel_messages set status = 'deleted' where id = p_message;
    return jsonb_build_object('id', m.id, 'status', 'deleted');
  end if;
  if not public.community_can(m.community_id, 'messages.moderate') then raise exception 'forbidden' using errcode = '42501'; end if;
  if m.author_id is not null and public.community_rank(m.community_id, m.author_id) >= public.community_rank(m.community_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.channel_messages set status = 'removed' where id = p_message;
  if m.author_id is not null then
    select * into c from public.communities where id = m.community_id;
    insert into public.community_mod_actions (community_id, report_id, actor_id, target_user_id, action, reason, channel_id)
    values (m.community_id, p_report, v_me, m.author_id, 'remove_message', v_reason, m.channel_id) returning id into v_id;
    perform public.notify(m.author_id, 'moderation_community_action', v_me, 'community', m.community_id,
      jsonb_build_object('slug', c.slug, 'name', c.name, 'action', 'remove_message', 'reason', left(coalesce(v_reason, ''), 300), 'action_id', v_id), 'mca:' || v_id);
  end if;
  perform public._community_audit(m.community_id, 'message.removed', 'message', m.id::text, jsonb_build_object('channel', m.channel_id, 'author', m.author_id));
  if p_report is not null then
    update public.community_reports set status = 'action_taken', resolved_by = v_me, resolved_at = now(), resolution = coalesce(v_reason, resolution), updated_at = now()
    where id = p_report and community_id = m.community_id and status in ('open', 'reviewing');
  end if;
  return jsonb_build_object('id', m.id, 'status', 'removed');
end; $$;

-- ═══════════════ 6. Appeals ═══════════════
create table if not exists public.community_appeals (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  action_id uuid not null unique references public.community_mod_actions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'upheld', 'denied')),
  reviewed_by uuid,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_appeals_queue_idx on public.community_appeals (community_id, status, created_at);
alter table public.community_appeals enable row level security;
grant select on public.community_appeals to authenticated;
-- Reviewed inside the community by an admin or the owner who did not take the original decision; an appeal against the
-- owner, or one escalated, goes to platform staff.
drop policy if exists community_appeals_select on public.community_appeals;
create policy community_appeals_select on public.community_appeals for select to authenticated
  using (
    user_id = (select auth.uid())
    or (escalated_at is null and public.community_can(community_id, 'appeals.review')
        and (select a.actor_id is distinct from (select auth.uid()) from public.community_mod_actions a where a.id = action_id))
    or (escalated_at is not null and exists (select 1 from public.communities c where c.id = community_id and public.has_permission('appeals.review', c.college_id)))
  );

create or replace function public.submit_community_appeal(p_action uuid, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); a public.community_mod_actions%rowtype; v_id uuid; c public.communities%rowtype; s uuid; v_escalate boolean;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.community_mod_actions where id = p_action;
  if not found or a.target_user_id <> v_me or a.action not in ('timeout', 'remove', 'ban', 'remove_message') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.created_at < now() - interval '30 days' then raise exception 'appeal_window_closed' using errcode = '22023'; end if;
  if exists (select 1 from public.community_appeals where action_id = p_action) then raise exception 'already_appealed' using errcode = '23505'; end if;
  if char_length(btrim(coalesce(p_message, ''))) < 10 then raise exception 'message_too_short' using errcode = '22023'; end if;
  -- an appeal about the owner's own decision cannot be reviewed by the community: it goes to the platform team
  v_escalate := a.actor_id is null or public.community_rank(a.community_id, a.actor_id) >= 4;
  insert into public.community_appeals (community_id, action_id, user_id, message, escalated_at)
  values (a.community_id, p_action, v_me, btrim(p_message), case when v_escalate then now() end) returning id into v_id;
  if a.report_id is not null then update public.community_reports set status = 'appealed', updated_at = now() where id = a.report_id and status = 'action_taken'; end if;
  select * into c from public.communities where id = a.community_id;
  if not v_escalate then
    for s in select user_id from public.community_members where community_id = a.community_id and status = 'active' and role in ('owner', 'admin') and user_id is distinct from a.actor_id limit 10 loop
      perform public.notify(s, 'moderation_community_appeal', v_me, 'community', a.community_id, jsonb_build_object('slug', c.slug, 'name', c.name), 'capp:' || v_id || ':' || s);
    end loop;
  end if;
  return v_id;
end; $$;

-- Applies a decision. Upholding lifts what the appeal was about: a timeout ends, a ban is lifted (the person is a member again),
-- a removed message cannot be restored (its content is erased on removal) but the record is cleared and the author told.
create or replace function public._decide_community_appeal(p_appeal uuid, p_decision text, p_note text, p_reviewer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ap public.community_appeals%rowtype; a public.community_mod_actions%rowtype; c public.communities%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into ap from public.community_appeals where id = p_appeal for update;
  if not found or ap.status <> 'pending' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into a from public.community_mod_actions where id = ap.action_id;
  select * into c from public.communities where id = ap.community_id;
  update public.community_appeals set status = p_decision, reviewed_by = p_reviewer, review_note = v_note, reviewed_at = now() where id = p_appeal;
  if p_decision = 'upheld' then
    if a.action = 'timeout' then update public.community_members set muted_until = null where community_id = ap.community_id and user_id = ap.user_id;
    elsif a.action = 'ban' then update public.community_members set status = 'active', role = 'member' where community_id = ap.community_id and user_id = ap.user_id and status = 'banned'; end if;
    insert into public.community_mod_actions (community_id, report_id, actor_id, target_user_id, action, reason)
    values (ap.community_id, a.report_id, p_reviewer, ap.user_id, 'appeal_reversal', coalesce(v_note, 'Appeal upheld'));
  end if;
  if a.report_id is not null then
    update public.community_reports set status = case when p_decision = 'upheld' then 'dismissed' else 'action_taken' end, updated_at = now() where id = a.report_id and status = 'appealed';
  end if;
  perform public.notify(ap.user_id, 'moderation_community_appeal_decision', p_reviewer, 'community', ap.community_id,
    jsonb_build_object('slug', c.slug, 'name', c.name, 'upheld', p_decision = 'upheld', 'note', left(coalesce(v_note, ''), 300)), 'cappd:' || p_appeal);
  insert into public.community_audit_log (community_id, actor_id, action, target_type, target_id, details)
  values (ap.community_id, p_reviewer, 'appeal.' || p_decision, 'appeal', p_appeal::text, '{}'::jsonb);
end; $$;
revoke execute on function public._decide_community_appeal(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.review_community_appeal(p_appeal uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := public._assert_active_member(); ap public.community_appeals%rowtype; a public.community_mod_actions%rowtype;
begin
  if p_decision not in ('upheld', 'denied') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into ap from public.community_appeals where id = p_appeal;
  if not found or ap.escalated_at is not null or ap.user_id = v_me or not public.community_can(ap.community_id, 'appeals.review') then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into a from public.community_mod_actions where id = ap.action_id;
  if a.actor_id = v_me then raise exception 'not_found' using errcode = 'P0002'; end if;   -- nobody reviews their own decision
  perform public._decide_community_appeal(p_appeal, p_decision, p_note, v_me);
end; $$;

-- ═══════════════ 7. Announcements, evidence retention ═══════════════
-- An announcement reaches every member who has not muted the channel, but not in the sender's request: the worker does it
-- in batches. notify() deduplicates, so a retry never sends one twice. At most 5000 recipients per announcement.
create or replace function public.process_channel_announcements(p_limit integer default 20)
returns integer language plpgsql security definer set search_path = '' as $$
declare m record; r record; v_done integer := 0;
begin
  for m in select cm.id, cm.channel_id, cm.community_id, cm.author_id, cm.status, ch.name as channel_name, ch.min_view_role, co.slug, co.name as community_name
           from public.channel_messages cm join public.community_channels ch on ch.id = cm.channel_id join public.communities co on co.id = cm.community_id
           where cm.announce_state = 'pending' order by cm.created_at limit least(greatest(p_limit, 1), 100) for update of cm skip locked loop
    if m.status = 'sent' then
      for r in select mem.user_id from public.community_members mem
               where mem.community_id = m.community_id and mem.status = 'active' and mem.user_id is distinct from m.author_id
                 and public.community_role_rank(mem.role) >= greatest(public.community_role_rank(m.min_view_role), 1) limit 5000 loop
        if public._channel_wants(r.user_id, m.community_id, m.channel_id, 'announcement') then
          perform public.notify(r.user_id, 'channel_announcement', m.author_id, 'channel', m.channel_id,
            jsonb_build_object('community', m.slug, 'community_name', m.community_name, 'channel', m.channel_name, 'message', m.id), 'cha:' || m.id || ':' || r.user_id);
        end if;
      end loop;
    end if;
    update public.channel_messages set announce_state = 'done' where id = m.id;
    v_done := v_done + 1;
  end loop;
  return v_done;
end; $$;
revoke execute on function public.process_channel_announcements(integer) from public, anon, authenticated;
grant execute on function public.process_channel_announcements(integer) to service_role;

-- Report evidence (the text of a reported message and its context) is erased once a report has been closed for the
-- retention period. The report itself, its category and its outcome stay. The period is a setting the owner must confirm
-- before launch (docs/COMMUNITIES.md, "Retention").
insert into public.system_settings (key, value, is_public, description)
values ('community_evidence_retention_days', '180'::jsonb, false, 'Days a closed community report keeps the reported text. Owner to confirm.')
on conflict (key) do nothing;

create or replace function public.purge_community_report_evidence()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_days integer := coalesce((select (value #>> '{}')::integer from public.system_settings where key = 'community_evidence_retention_days'), 180); v_n integer;
begin
  with p as (
    update public.community_reports set snapshot = '{}'::jsonb, evidence_purged_at = now()
    where status in ('dismissed', 'action_taken') and resolved_at < now() - make_interval(days => greatest(v_days, 7)) and evidence_purged_at is null
    returning 1)
  select count(*) into v_n from p;
  return v_n;
end; $$;
revoke execute on function public.purge_community_report_evidence() from public, anon, authenticated;
grant execute on function public.purge_community_report_evidence() to service_role;

-- ═══════════════ 8. Account erasure ═══════════════
create or replace function public.erase_user_data(p_user uuid, p_erase_messages boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_msgs integer := 0; v_chan integer := 0; v_emb integer := 0; v_files integer := 0;
begin
  if p_erase_messages then
    update public.messages set status = 'deleted' where sender_id = p_user and status = 'sent';
    get diagnostics v_msgs = row_count;
    update public.channel_messages set status = 'deleted' where author_id = p_user and status = 'sent';
    get diagnostics v_chan = row_count;
  end if;
  -- Other members' plain reposts of this member's posts cannot outlive them (and would block the account's cascade).
  delete from public.posts r
  where r.body = '' and r.repost_of_id in (select id from public.posts where author_id = p_user);
  delete from public.embeddings e
  where (e.entity_type = 'profile' and e.entity_id = p_user)
     or (e.entity_type = 'post' and e.entity_id in (select id from public.posts where author_id = p_user))
     or (e.entity_type = 'project' and e.entity_id in (select id from public.projects where owner_id = p_user));
  get diagnostics v_emb = row_count;
  delete from public.ai_jobs j where j.type = 'embed' and j.status in ('pending', 'processing')
    and ((j.payload ->> 'entityType' = 'profile' and (j.payload ->> 'entityId')::uuid = p_user)
      or (j.payload ->> 'entityType' = 'post' and (j.payload ->> 'entityId')::uuid in (select id from public.posts where author_id = p_user))
      or (j.payload ->> 'entityType' = 'project' and (j.payload ->> 'entityId')::uuid in (select id from public.projects where owner_id = p_user)));
  delete from public.files where owner_id = p_user;
  get diagnostics v_files = row_count;
  return jsonb_build_object('messages_erased', v_msgs + v_chan, 'embeddings', v_emb, 'file_records', v_files);
end;
$$;
revoke execute on function public.erase_user_data(uuid, boolean) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid, boolean) to service_role;

-- ═══════════════ 9. Platform administration (least privilege) ═══════════════
-- Platform staff manage communities and read ESCALATED reports and appeals. They do not get a back door into private
-- channels: message text reaches them only as the snapshot attached to an escalated report.
create or replace function public.admin_community_overview(p_query text default null, p_limit integer default 30, p_offset integer default 0)
returns table (id uuid, slug text, name text, visibility text, join_policy text, member_count integer, is_official boolean, deleted_at timestamptz, created_at timestamptz,
               owner_name text, channels bigint, messages_7d bigint, open_reports bigint, banned bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.visibility, c.join_policy, c.member_count, c.is_official, c.deleted_at, c.created_at,
    (select p.full_name from public.community_members m join public.profiles p on p.id = m.user_id where m.community_id = c.id and m.role = 'owner'),
    (select count(*) from public.community_channels ch where ch.community_id = c.id and ch.archived_at is null),
    (select count(*) from public.channel_messages cm where cm.community_id = c.id and cm.created_at > now() - interval '7 days'),
    (select count(*) from public.community_reports r where r.community_id = c.id and r.status in ('open', 'reviewing')),
    (select count(*) from public.community_members m where m.community_id = c.id and m.status = 'banned')
  from public.communities c
  where public.has_permission('communities.manage', c.college_id)
    and (p_query is null or btrim(p_query) = '' or c.name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by c.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Everything about one community that is not message content.
create or replace function public.admin_community_detail(p_community uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.communities%rowtype;
begin
  select * into c from public.communities where id = p_community;
  if not found or not public.has_permission('communities.manage', c.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'community', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'visibility', c.visibility, 'join_policy', c.join_policy, 'member_count', c.member_count,
       'avatar_key', c.avatar_key, 'cover_key', c.cover_key, 'topics', c.topics, 'deleted_at', c.deleted_at, 'created_at', c.created_at),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'name', p.full_name, 'username', p.username) order by public.community_role_rank(m.role) desc)
                       from public.community_members m join public.profiles p on p.id = m.user_id where m.community_id = c.id and m.status = 'active' and m.role <> 'member'), '[]'::jsonb),
    'restricted', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'status', m.status, 'muted_until', m.muted_until, 'name', p.full_name))
                            from public.community_members m join public.profiles p on p.id = m.user_id
                            where m.community_id = c.id and (m.status = 'banned' or m.muted_until > now())), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('id', ch.id, 'name', ch.name, 'type', ch.type, 'min_view_role', ch.min_view_role, 'min_post_role', ch.min_post_role,
                           'archived', ch.archived_at is not null, 'messages', (select count(*) from public.channel_messages cm where cm.channel_id = ch.id and cm.status = 'sent')) order by ch.position)
                          from public.community_channels ch where ch.community_id = c.id), '[]'::jsonb),
    'invites', jsonb_build_object('active', (select count(*) from public.community_invites i where i.community_id = c.id and i.revoked_at is null and i.expires_at > now()),
                                  'created_30d', (select count(*) from public.community_invites i where i.community_id = c.id and i.created_at > now() - interval '30 days')),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'target_type', a.target_type, 'at', a.created_at, 'actor', (select full_name from public.profiles where id = a.actor_id)) order by a.id desc)
                       from (select * from public.community_audit_log where community_id = c.id order by id desc limit 50) a), '[]'::jsonb));
end; $$;

create or replace function public.admin_community_audit(p_community uuid, p_before bigint default null, p_limit integer default 50)
returns table (id bigint, action text, target_type text, target_id text, details jsonb, created_at timestamptz, actor_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, (select p.full_name from public.profiles p where p.id = a.actor_id)
  from public.community_audit_log a join public.communities c on c.id = a.community_id
  where a.community_id = p_community and public.has_permission('audit.view', c.college_id) and (p_before is null or a.id < p_before)
  order by a.id desc limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.admin_escalated_community_reports(p_status text default null)
returns table (id uuid, community_id uuid, community_name text, target_type text, category text, severity text, status text, details text, snapshot jsonb, created_at timestamptz,
               escalated_at timestamptz, resolution text, target_name text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.community_id, c.name, r.target_type, r.category, r.severity, r.status, r.details, r.snapshot, r.created_at, r.escalated_at, r.resolution,
         (select p.full_name from public.profiles p where p.id = r.target_user_id)
  from public.community_reports r join public.communities c on c.id = r.community_id
  where r.escalated_at is not null and public.has_permission('reports.view', c.college_id)
    and (p_status is null or r.status = p_status or (p_status = 'open' and r.status in ('open', 'reviewing')))
  order by r.severity desc, r.escalated_at desc limit 100;
$$;

create or replace function public.admin_resolve_community_report(p_report uuid, p_status text, p_resolution text default null, p_remove_message boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); r public.community_reports%rowtype; c public.communities%rowtype; m public.channel_messages%rowtype;
begin
  if p_status not in ('reviewing', 'dismissed', 'action_taken') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select * into r from public.community_reports where id = p_report and escalated_at is not null;
  select * into c from public.communities where id = r.community_id;
  -- one answer whether the report exists or not: callers without the permission learn nothing about report ids
  if r.id is null or not public.has_permission('reports.resolve', c.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_remove_message and r.target_type = 'channel_message' then
    select * into m from public.channel_messages where id = r.target_id;
    if found and m.status = 'sent' then
      update public.channel_messages set status = 'removed' where id = m.id;
      insert into public.community_mod_actions (community_id, report_id, actor_id, target_user_id, action, reason, channel_id)
      values (r.community_id, r.id, v_me, m.author_id, 'remove_message', coalesce(nullif(btrim(p_resolution), ''), 'Removed by platform staff'), m.channel_id);
    end if;
  end if;
  update public.community_reports set status = p_status, resolution = nullif(btrim(coalesce(p_resolution, '')), ''), resolved_by = v_me, resolved_at = case when p_status = 'reviewing' then null else now() end, updated_at = now() where id = p_report;
  insert into public.community_audit_log (community_id, actor_id, action, target_type, target_id, details)
  values (r.community_id, v_me, 'report.platform_' || p_status, 'report', p_report::text, jsonb_build_object('removed_message', p_remove_message));
  if r.reporter_id is not null and p_status <> 'reviewing' then
    perform public.notify(r.reporter_id, 'moderation_report_outcome', null, 'community', r.community_id, jsonb_build_object('actioned', p_status = 'action_taken'), 'crout:' || p_report);
  end if;
end; $$;

create or replace function public.admin_escalated_community_appeals()
returns table (id uuid, community_id uuid, community_name text, action text, reason text, message text, status text, created_at timestamptz, user_name text)
language sql stable security definer set search_path = '' as $$
  select ap.id, ap.community_id, c.name, a.action, a.reason, ap.message, ap.status, ap.created_at, (select p.full_name from public.profiles p where p.id = ap.user_id)
  from public.community_appeals ap join public.communities c on c.id = ap.community_id join public.community_mod_actions a on a.id = ap.action_id
  where ap.escalated_at is not null and public.has_permission('appeals.review', c.college_id)
  order by (ap.status = 'pending') desc, ap.created_at desc limit 100;
$$;

create or replace function public.admin_review_community_appeal(p_appeal uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare ap public.community_appeals%rowtype; c public.communities%rowtype;
begin
  if p_decision not in ('upheld', 'denied') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into ap from public.community_appeals where id = p_appeal and escalated_at is not null;
  select * into c from public.communities where id = ap.community_id;
  if ap.id is null or not public.has_permission('appeals.review', c.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public._decide_community_appeal(p_appeal, p_decision, p_note, (select auth.uid()));
end; $$;

-- Real counts per day, never estimates. Messages are counted, not read.
create or replace function public.admin_community_trends(p_days integer default 14)
returns table (day date, messages bigint, removed bigint, reports bigint, timeouts bigint, bans bigint, new_communities bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
begin
  if not public.has_permission('analytics.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select d::date,
    (select count(*) from public.channel_messages m where m.created_at >= d and m.created_at < d + interval '1 day'),
    (select count(*) from public.community_mod_actions a where a.action = 'remove_message' and a.created_at >= d and a.created_at < d + interval '1 day'),
    (select count(*) from public.community_reports r where r.created_at >= d and r.created_at < d + interval '1 day'),
    (select count(*) from public.community_mod_actions a where a.action = 'timeout' and a.created_at >= d and a.created_at < d + interval '1 day'),
    (select count(*) from public.community_mod_actions a where a.action = 'ban' and a.created_at >= d and a.created_at < d + interval '1 day'),
    (select count(*) from public.communities c where c.created_at >= d and c.created_at < d + interval '1 day')
  from generate_series(date_trunc('day', now()) - make_interval(days => v_days - 1), date_trunc('day', now()), interval '1 day') d
  order by 1;
end; $$;

-- Storage and notification health: what is stuck right now, from the tables themselves.
create or replace function public.admin_community_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('analytics.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'uploads_stuck', (select count(*) from public.files where status = 'pending' and created_at < now() - interval '1 hour' and purpose in ('message_attachment', 'community_image')),
    'files_awaiting_removal', (select count(*) from public.files where status = 'ready' and orphaned_at is not null),
    'unattached_message_files', (select count(*) from public.files f where f.status = 'ready' and f.purpose = 'message_attachment' and f.created_at < now() - interval '24 hours'
        and not exists (select 1 from public.message_attachments ma where ma.file_id = f.id) and not exists (select 1 from public.channel_message_files cf where cf.file_id = f.id)),
    'announcements_pending', (select count(*) from public.channel_messages where announce_state = 'pending'),
    'announcements_oldest_pending_minutes', (select coalesce(extract(epoch from now() - min(created_at)) / 60, 0)::integer from public.channel_messages where announce_state = 'pending'),
    'email_failed', (select count(*) from public.notifications where email_status = 'failed' and created_at > now() - interval '7 days'),
    'push_devices_failing', (select count(*) from public.push_subscriptions where failure_count >= 3),
    'open_reports', (select count(*) from public.community_reports where status in ('open', 'reviewing')),
    'escalated_open', (select count(*) from public.community_reports where escalated_at is not null and status in ('open', 'reviewing')),
    'appeals_pending', (select count(*) from public.community_appeals where status = 'pending'));
end; $$;

-- ═══════════════ 10. Grants ═══════════════
grant execute on function
  public.create_community_invite(uuid, integer, integer, uuid, text), public.revoke_community_invite(uuid),
  public.preview_community_invite(text), public.redeem_community_invite(text),
  public.join_community(uuid), public.leave_community(uuid), public.respond_community_membership(uuid, uuid, boolean),
  public.set_community_member_role(uuid, uuid, text), public.transfer_community_ownership(uuid, uuid, text),
  public.manage_community_member(uuid, uuid, text), public.moderate_member(uuid, uuid, text, text, integer, uuid),
  public.submit_community_report(uuid, text, uuid, text, text), public.update_community_report(uuid, text, text), public.escalate_community_report(uuid),
  public.delete_channel_message(uuid, text, uuid),
  public.submit_community_appeal(uuid, text), public.review_community_appeal(uuid, text, text),
  public.admin_community_overview(text, integer, integer), public.admin_community_detail(uuid), public.admin_community_audit(uuid, bigint, integer),
  public.admin_escalated_community_reports(text), public.admin_resolve_community_report(uuid, text, text, boolean),
  public.admin_escalated_community_appeals(), public.admin_review_community_appeal(uuid, text, text),
  public.admin_community_trends(integer), public.admin_community_health()
  to authenticated;

-- ═══════════════ 11. Nothing here is for a signed-out visitor ═══════════════
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
             'create_community_invite', 'revoke_community_invite', 'preview_community_invite', 'redeem_community_invite', 'join_community', 'leave_community',
             'respond_community_membership', 'set_community_member_role', 'transfer_community_ownership', 'manage_community_member', 'moderate_member',
             'submit_community_report', 'update_community_report', 'escalate_community_report', 'delete_channel_message', 'submit_community_appeal',
             'review_community_appeal', 'admin_community_overview', 'admin_community_detail', 'admin_community_audit', 'admin_escalated_community_reports',
             'admin_resolve_community_report', 'admin_escalated_community_appeals', 'admin_review_community_appeal', 'admin_community_trends',
             'admin_community_health', 'process_channel_announcements', 'purge_community_report_evidence', 'erase_user_data', '_usable_invite', '_decide_community_appeal'])
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

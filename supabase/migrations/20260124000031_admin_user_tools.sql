-- Admin user tools: a better member directory, timed restrictions, internal notes, profile correction, session
-- revocation, a permitted data export and a bounded post list for a member.
--
-- Everything here follows the existing administration design: SECURITY DEFINER functions that re-check the caller's
-- permission for the *record's college* (has_permission), refuse to act on oneself or on protected administrators
-- (_assert_can_act_on), require a reason for anything that changes a member, and write an append-only audit entry in the
-- same transaction, so a failure leaves neither a half-done change nor a missing audit row.
--
-- New permissions (granted by role, never by the client):
--   users.edit      correct a member's name, username, headline, bio       global_admin, college_admin
--   users.sessions  revoke a member's sessions, send a recovery email      global_admin, college_admin
--   users.export    export a member's data                                global_admin only
-- Internal notes use the existing moderation.warn permission (moderators and above).

insert into public.role_permissions(role, permission) values
  ('global_admin', 'users.edit'), ('college_admin', 'users.edit'),
  ('global_admin', 'users.sessions'), ('college_admin', 'users.sessions'),
  ('global_admin', 'users.export')
on conflict do nothing;

-- ── Member directory: search by id, registration period, sorting ────────────
drop function if exists public.admin_list_users(text, text, text, uuid, integer, integer);
create or replace function public.admin_list_users(
  p_q text default null, p_status text default null, p_role text default null, p_college uuid default null,
  p_from date default null, p_to date default null, p_sort text default 'created', p_dir text default 'desc',
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, username text, full_name text, email text, avatar_key text, status text, verification_status text, account_type text,
  college_id uuid, college_name text, roles text[], created_at timestamptz, last_sign_in_at timestamptz,
  restricted_until timestamptz, total_count bigint
) language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.full_name, u.email::text, p.avatar_key, p.status, p.verification_status, p.account_type,
         p.college_id, c.name,
         coalesce((select array_agg(distinct ur.role) from public.user_roles ur where ur.user_id = p.id), '{}'::text[]),
         p.created_at, u.last_sign_in_at, p.restricted_until, count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.colleges c on c.id = p.college_id
  where public.has_permission('users.view', p.college_id)
    and (p_status is null or p.status = p_status)
    and (p_college is null or p.college_id = p_college)
    and (p_from is null or p.created_at >= p_from)
    and (p_to is null or p.created_at < p_to + 1)
    and (p_role is null or exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = p_role))
    and (nullif(trim(p_q), '') is null
         or (trim(p_q) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and p.id = trim(p_q)::uuid)
         or p.username ilike '%' || public.escape_like(trim(p_q)) || '%'
         or p.full_name ilike '%' || public.escape_like(trim(p_q)) || '%'
         or u.email ilike '%' || public.escape_like(trim(p_q)) || '%')
  order by
    case when p_sort = 'name' and p_dir = 'asc' then lower(p.full_name) end asc,
    case when p_sort = 'name' and p_dir = 'desc' then lower(p.full_name) end desc,
    case when p_sort = 'last_seen' and p_dir = 'asc' then u.last_sign_in_at end asc nulls last,
    case when p_sort = 'last_seen' and p_dir = 'desc' then u.last_sign_in_at end desc nulls last,
    case when p_sort not in ('name', 'last_seen') and p_dir = 'asc' then p.created_at end asc,
    p.created_at desc, p.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

-- ── Member detail: add the restriction expiry ────────────────────────────────
create or replace function public.admin_user_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles%rowtype; u auth.users%rowtype;
begin
  select * into p from public.profiles where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('users.view', p.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_id;
  return jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'headline', p.headline, 'bio', p.bio,
      'status', p.status, 'restricted_until', p.restricted_until, 'verification_status', p.verification_status, 'account_type', p.account_type,
      'college_id', p.college_id, 'avatar_key', p.avatar_key, 'created_at', p.created_at, 'onboarded_at', p.onboarded_at,
      'graduation_year', p.graduation_year),
    'college_name', (select name from public.colleges where id = p.college_id),
    'email', u.email, 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at,
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', ur.id, 'role', ur.role, 'college_id', ur.college_id, 'college_name', c.name))
                       from public.user_roles ur left join public.colleges c on c.id = ur.college_id where ur.user_id = p.id), '[]'::jsonb),
    'counts', jsonb_build_object(
      'posts', (select count(*) from public.posts where author_id = p.id and status = 'published'),
      'comments', (select count(*) from public.comments where author_id = p.id and status = 'published'),
      'projects', (select count(*) from public.projects where owner_id = p.id and deleted_at is null),
      'reports_against', (select count(*) from public.reports where target_owner_id = p.id),
      'reports_filed', (select count(*) from public.reports where reporter_id = p.id)),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'action', m.action, 'reason', m.reason, 'actor', ap.full_name,
        'created_at', m.created_at, 'appeal_status', (select a.status from public.appeals a where a.action_id = m.id)) order by m.created_at desc)
      from (select * from public.moderation_actions where target_user_id = p.id order by created_at desc limit 30) m
      left join public.profiles ap on ap.id = m.actor_id), '[]'::jsonb),
    'deletion_request', (select jsonb_build_object('id', d.id, 'status', d.status, 'scheduled_for', d.scheduled_for)
                         from public.account_deletion_requests d where d.user_id = p.id and d.status in ('pending', 'processing') limit 1)
  );
end; $$;

-- ── Restrict / suspend for a period; reinstate clears it ─────────────────────
drop function if exists public.moderate_user(uuid, text, text);
create or replace function public.moderate_user(p_user uuid, p_action text, p_reason text, p_days integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  t public.profiles%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
  v_until timestamptz;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action not in ('warn', 'restrict', 'suspend', 'reinstate') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if not public.has_permission(case p_action when 'warn' then 'moderation.warn' when 'restrict' then 'users.restrict'
       when 'suspend' then 'users.suspend' else 'users.reinstate' end, t.college_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_days is not null and (p_days < 1 or p_days > 365 or p_action not in ('restrict', 'suspend')) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  perform public._assert_can_act_on(p_user);
  if p_days is not null then v_until := now() + make_interval(days => p_days); end if;

  if p_action = 'warn' then
    if t.status not in ('active', 'restricted') then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public.notify(p_user, 'moderation_warning', null, 'user', p_user, jsonb_build_object('reason', v_reason));
  elsif p_action = 'restrict' then
    if t.status <> 'active' then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public.notify(p_user, 'moderation_restriction', null, 'user', p_user, jsonb_build_object('reason', v_reason, 'level', 'restricted', 'until', v_until));
    update public.profiles set status = 'restricted', restricted_until = v_until where id = p_user;
  elsif p_action = 'suspend' then
    if t.status not in ('active', 'restricted') then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public.notify(p_user, 'moderation_restriction', null, 'user', p_user, jsonb_build_object('reason', v_reason, 'level', 'suspended', 'until', v_until));
    update public.profiles set status = 'suspended', restricted_until = v_until where id = p_user;
  else
    if t.status not in ('restricted', 'suspended') then raise exception 'invalid_state' using errcode = '23514'; end if;
    update public.profiles set status = 'active', restricted_until = null where id = p_user;
    update public.appeals a set status = 'upheld', reviewed_by = v_actor, reviewed_at = now(), review_note = 'Account reinstated by staff.'
      where a.user_id = p_user and a.status = 'pending'
        and exists (select 1 from public.moderation_actions m where m.id = a.action_id and m.action in ('restrict', 'suspend'));
    perform public.notify(p_user, 'moderation_reinstated', null, 'user', p_user, jsonb_build_object('note', v_reason));
  end if;
  perform public._log_moderation(null, v_actor, p_user, 'user', p_user, t.college_id, p_action,
    case when v_until is null then v_reason else left(v_reason, 940) || ' [until ' || to_char(v_until, 'YYYY-MM-DD') || ']' end);
end; $$;

-- Run by the background tick: members whose period ended are reinstated (and told), each logged like a staff reinstatement.
create or replace function public.expire_restrictions()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select id, college_id from public.profiles
    where status in ('restricted', 'suspended') and restricted_until is not null and restricted_until <= now()
    order by restricted_until limit 200 for update skip locked
  loop
    update public.profiles set status = 'active', restricted_until = null where id = r.id;
    perform public.notify(r.id, 'moderation_reinstated', null, 'user', r.id, jsonb_build_object('note', 'Your restriction period has ended.'));
    perform public._log_moderation(null, null, r.id, 'user', r.id, r.college_id, 'reinstate', 'Restriction period ended (automatic).');
    n := n + 1;
  end loop;
  return n;
end; $$;

-- ── Internal notes (never shown to the member: the select policy lists the actions they may see) ───────────────
create or replace function public.admin_add_user_note(p_user uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  t public.profiles%rowtype;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('moderation.warn', t.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_note is null or char_length(v_note) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  perform public._assert_can_act_on(p_user);
  perform public._log_moderation(null, v_actor, p_user, 'user', p_user, t.college_id, 'note', v_note);
end; $$;

-- ── Correct a member's name, username, headline or bio (a null argument leaves that field alone) ─────────────
create or replace function public.admin_update_profile(
  p_user uuid, p_full_name text, p_username text, p_headline text, p_bio text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  t public.profiles%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_claims text := current_setting('request.jwt.claims', true);
  v_name text := nullif(trim(p_full_name), '');
  v_user text := nullif(lower(trim(p_username)), '');
  v_changed text[] := '{}';
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('users.edit', t.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  perform public._assert_can_act_on(p_user);
  if v_name is not null and (char_length(v_name) < 1 or char_length(v_name) > 80) then raise exception 'invalid_name' using errcode = '22023'; end if;
  if p_headline is not null and char_length(p_headline) > 160 then raise exception 'invalid_headline' using errcode = '22023'; end if;
  if p_bio is not null and char_length(p_bio) > 2000 then raise exception 'invalid_bio' using errcode = '22023'; end if;

  if v_name is not null and v_name is distinct from t.full_name then v_changed := array_append(v_changed, 'full_name'); end if;
  if v_user is not null and v_user is distinct from t.username then v_changed := array_append(v_changed, 'username'); end if;
  if p_headline is not null and nullif(trim(p_headline), '') is distinct from t.headline then v_changed := array_append(v_changed, 'headline'); end if;
  if p_bio is not null and nullif(trim(p_bio), '') is distinct from t.bio then v_changed := array_append(v_changed, 'bio'); end if;
  if cardinality(v_changed) = 0 then raise exception 'nothing_to_change' using errcode = '22023'; end if;

  -- The 14-day username cooldown exists to stop members churning handles; a staff correction is exempt, so the
  -- update runs as the service role for this statement only (the same pattern as restoring removed content).
  perform set_config('request.jwt.claims', jsonb_set(coalesce(nullif(v_claims, ''), '{}')::jsonb, '{role}', '"service_role"')::text, true);
  begin
    update public.profiles set
      full_name = coalesce(v_name, full_name),
      username = coalesce(v_user, username),
      headline = case when p_headline is null then headline else nullif(trim(p_headline), '') end,
      bio = case when p_bio is null then bio else nullif(trim(p_bio), '') end
    where id = p_user;
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  -- Field names (and the old and new username, which is public) are recorded; the free text itself is not copied.
  perform public.write_audit_log(v_actor, 'user.profile_edited', 'user', p_user::text, t.college_id,
    jsonb_build_object('fields', to_jsonb(v_changed), 'reason', v_reason)
    || case when 'username' = any (v_changed) then jsonb_build_object('old_username', t.username, 'new_username', v_user) else '{}'::jsonb end);
  insert into public.moderation_actions(actor_id, target_user_id, target_type, target_id, college_id, action, reason)
  values (v_actor, p_user, 'user', p_user, t.college_id, 'note', left('Profile corrected (' || array_to_string(v_changed, ', ') || '): ' || v_reason, 1000));
end; $$;

-- ── Sign a member out everywhere ─────────────────────────────────────────────
-- Deleting the sessions removes their refresh tokens, so no new access token can be issued. An access token that was
-- already issued stays valid until it expires (an hour at most); the app and the database still check the member's
-- status on every request, which is what actually blocks a restricted or suspended account.
create or replace function public.admin_revoke_sessions(p_user uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  t public.profiles%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_n integer;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('users.sessions', t.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  perform public._assert_can_act_on(p_user);
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_n = row_count;
  perform public.write_audit_log(v_actor, 'user.sessions_revoked', 'user', p_user::text, t.college_id,
    jsonb_build_object('sessions', v_n, 'reason', v_reason));
  return v_n;
end; $$;

-- App-side steps that cannot run inside the database (sending a recovery email) are recorded through this single,
-- allow-listed door, after the same permission check. The caller cannot choose any other action name.
create or replace function public.admin_audit_event(p_action text, p_user uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  t public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_action <> 'user.recovery_requested' then raise exception 'invalid_action' using errcode = '22023'; end if;
  select * into t from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('users.sessions', t.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public._assert_can_act_on(p_user);
  perform public.write_audit_log(v_actor, p_action, 'user', p_user::text, t.college_id,
    jsonb_build_object('reason', nullif(left(trim(coalesce(p_reason, '')), 500), '')));
end; $$;

-- ── A member's posts for review: public and college posts only, never private ones, newest first and bounded ─────
create or replace function public.admin_user_posts(p_id uuid, p_limit integer default 10, p_offset integer default 0)
returns table (id uuid, slug text, title text, snippet text, category text, status text, visibility text,
  reaction_count integer, comment_count integer, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_college uuid;
begin
  select college_id into v_college from public.profiles where profiles.id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('users.view', v_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.id, p.slug, p.title, left(p.body, 160), p.category, p.status, p.visibility, p.reaction_count, p.comment_count, p.created_at, count(*) over ()
    from public.posts p
    where p.author_id = p_id and p.visibility in ('public', 'college') and p.status in ('published', 'removed')
    order by p.created_at desc, p.id desc
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end; $$;

-- ── Data export for a member: global administrators only; the export itself writes the audit entry ───────────
-- Included: profile, counts, post list, moderation history, roles. Never: messages, credentials, tokens, files.
create or replace function public.admin_export_user(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  p public.profiles%rowtype;
  u auth.users%rowtype;
  v jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into p from public.profiles where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('users.export', p.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_id;
  v := jsonb_build_object(
    'exported_at', now(),
    'profile', jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'headline', p.headline, 'bio', p.bio,
      'account_type', p.account_type, 'college_id', p.college_id, 'status', p.status, 'restricted_until', p.restricted_until,
      'verification_status', p.verification_status, 'skills', p.skills, 'interests', p.interests, 'created_at', p.created_at, 'onboarded_at', p.onboarded_at),
    'email', u.email, 'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at,
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', ur.role, 'college_id', ur.college_id, 'since', ur.created_at)) from public.user_roles ur where ur.user_id = p.id), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'slug', x.slug, 'title', x.title, 'category', x.category, 'visibility', x.visibility, 'status', x.status, 'created_at', x.created_at))
                       from (select * from public.posts where author_id = p.id order by created_at desc limit 500) x), '[]'::jsonb),
    'counts', jsonb_build_object('comments', (select count(*) from public.comments where author_id = p.id),
                                 'projects', (select count(*) from public.projects where owner_id = p.id and deleted_at is null)),
    'moderation_history', coalesce((select jsonb_agg(jsonb_build_object('action', m.action, 'reason', m.reason, 'created_at', m.created_at) order by m.created_at desc)
                       from (select * from public.moderation_actions where target_user_id = p.id order by created_at desc limit 200) m), '[]'::jsonb)
  );
  perform public.write_audit_log(v_actor, 'user.exported', 'user', p_id::text, p.college_id, jsonb_build_object('posts', jsonb_array_length(v->'posts')));
  return v;
end; $$;

-- ── Grants: signed-in staff only; each function re-checks its permission ─────
revoke execute on function
  public.admin_list_users(text, text, text, uuid, date, date, text, text, integer, integer),
  public.moderate_user(uuid, text, text, integer),
  public.admin_add_user_note(uuid, text),
  public.admin_update_profile(uuid, text, text, text, text, text),
  public.admin_revoke_sessions(uuid, text),
  public.admin_audit_event(text, uuid, text),
  public.admin_user_posts(uuid, integer, integer),
  public.admin_export_user(uuid),
  public.admin_user_detail(uuid)
from public, anon;
grant execute on function
  public.admin_list_users(text, text, text, uuid, date, date, text, text, integer, integer),
  public.moderate_user(uuid, text, text, integer),
  public.admin_add_user_note(uuid, text),
  public.admin_update_profile(uuid, text, text, text, text, text),
  public.admin_revoke_sessions(uuid, text),
  public.admin_audit_event(text, uuid, text),
  public.admin_user_posts(uuid, integer, integer),
  public.admin_export_user(uuid),
  public.admin_user_detail(uuid)
to authenticated;
revoke execute on function public.expire_restrictions() from public, anon, authenticated;
grant execute on function public.expire_restrictions() to service_role;

-- ── Two internal helpers that were callable by every signed-in member ────────
-- They are meant only for other SECURITY DEFINER functions (which keep their own access as the function owner) and
-- the service role. As granted before, any member could:
--   write_audit_log     add an entry of their choosing to the audit log, under any actor's name;
--   _accept_connection  create a mutual connection (and follows) with anyone, skipping requests, blocks and the
--                       recipient's "who can message me" choice.
revoke execute on function public.write_audit_log(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._accept_connection(uuid, uuid) from public, anon, authenticated;
grant execute on function public.write_audit_log(uuid, text, text, text, uuid, jsonb) to service_role;

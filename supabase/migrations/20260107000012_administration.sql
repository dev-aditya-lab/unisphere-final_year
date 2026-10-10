-- 0012: administration — moderation actions, appeals, admin read models, deletion processing
-- ---------------------------------------------------------------------------
-- Every privileged operation is a SECURITY DEFINER function that re-checks the caller's permission
-- *for the resource's college* (see has_permission). The admin UI is only a convenience on top.
-- Staff can never act on themselves, and only a global administrator can act on another administrator.
-- ---------------------------------------------------------------------------

-- ── Moderation actions (immutable history) ──────────────────────────────────
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  target_type text check (target_type is null or target_type in ('post', 'comment', 'user', 'project', 'message', 'event', 'community')),
  target_id uuid,
  college_id uuid references public.colleges(id) on delete set null,
  action text not null check (action in ('warn', 'remove_content', 'restore_content', 'restrict', 'suspend', 'reinstate', 'dismiss', 'note')),
  reason text check (reason is null or char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);
create index moderation_actions_user_idx on public.moderation_actions (target_user_id, created_at desc);
create index moderation_actions_report_idx on public.moderation_actions (report_id);
create index moderation_actions_college_idx on public.moderation_actions (college_id, created_at desc);

alter table public.moderation_actions enable row level security;
grant select on public.moderation_actions to authenticated;
-- Staff see everything in their college; members see what was done to them (never internal notes).
create policy moderation_actions_select on public.moderation_actions for select to authenticated
  using (
    public.has_permission('reports.view', college_id)
    or (target_user_id = (select auth.uid()) and action in ('warn', 'remove_content', 'restore_content', 'restrict', 'suspend', 'reinstate'))
  );

-- ── Appeals ─────────────────────────────────────────────────────────────────
create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_id uuid not null unique references public.moderation_actions(id) on delete cascade,
  college_id uuid references public.colleges(id) on delete set null,
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'upheld', 'denied')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index appeals_queue_idx on public.appeals (college_id, status, created_at);
create index appeals_user_idx on public.appeals (user_id, created_at desc);

alter table public.appeals enable row level security;
grant select on public.appeals to authenticated;
create policy appeals_select on public.appeals for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('appeals.review', college_id));

-- Reviewers of verification requests need to open the supporting document.
create or replace function public.can_review_verification_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.college_verifications v
    where v.document_file_id = p_file and public.has_permission('verification.review', v.college_id)
  );
$$;
grant execute on function public.can_review_verification_file(uuid) to authenticated, service_role;
create policy files_select_verification_staff on public.files for select to authenticated
  using (purpose = 'verification_document' and public.can_review_verification_file(id));

-- ── Guards and shared helpers (internal: not callable through the API) ──────
create or replace function public._assert_can_act_on(p_target uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_target is null then raise exception 'target_unavailable' using errcode = 'P0002'; end if;
  if p_target = (select auth.uid()) then raise exception 'cannot_act_on_self' using errcode = '42501'; end if;
  if exists (select 1 from public.user_roles where user_id = p_target and role = 'global_admin') then
    raise exception 'protected_account' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_target and role = 'college_admin')
     and not public.has_permission('roles.manage', null) then
    raise exception 'protected_account' using errcode = '42501';
  end if;
end; $$;

create or replace function public._log_moderation(
  p_report uuid, p_actor uuid, p_target_user uuid, p_type text, p_target uuid, p_college uuid, p_action text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.moderation_actions(report_id, actor_id, target_user_id, target_type, target_id, college_id, action, reason)
  values (p_report, p_actor, p_target_user, p_type, p_target, p_college, p_action, nullif(left(trim(coalesce(p_reason, '')), 1000), ''))
  returning id into v_id;
  perform public.write_audit_log(p_actor, 'moderation.' || p_action, coalesce(p_type, 'user'), coalesce(p_target, p_target_user)::text, p_college,
    jsonb_build_object('moderation_action_id', v_id, 'report_id', p_report));
  return v_id;
end; $$;

-- Removing is a plain status change. Restoring is blocked for ordinary members by triggers that look at the
-- caller's JWT role, so a *permission-checked* restore briefly acts as the service role inside this transaction.
create or replace function public._set_content_status(
  p_type text, p_id uuid, p_status text, p_actor uuid, p_reason text, p_body text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  if p_status = 'removed' then
    if p_type = 'post' then
      update public.posts set status = 'removed', removed_by = p_actor, removed_at = now(), removed_reason = left(p_reason, 500)
        where id = p_id and status = 'published';
    elsif p_type = 'comment' then
      update public.comments set status = 'removed' where id = p_id and status = 'published';
    else
      raise exception 'unsupported_action' using errcode = '22023';
    end if;
    return;
  end if;

  perform set_config('request.jwt.claims',
    jsonb_set(coalesce(nullif(v_claims, ''), '{}')::jsonb, '{role}', '"service_role"')::text, true);
  begin
    if p_type = 'post' then
      update public.posts set status = 'published', removed_by = null, removed_at = null, removed_reason = null
        where id = p_id and status = 'removed';
    elsif p_type = 'comment' then
      if coalesce(p_body, '') = '' then raise exception 'cannot_restore' using errcode = '22023'; end if;
      update public.comments set status = 'published', body = left(p_body, 2000) where id = p_id and status = 'removed';
    else
      raise exception 'unsupported_action' using errcode = '22023';
    end if;
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end; $$;

revoke execute on function public._assert_can_act_on(uuid), public._log_moderation(uuid, uuid, uuid, text, uuid, uuid, text, text),
  public._set_content_status(text, uuid, text, uuid, text, text) from public, anon, authenticated;

-- ── Report queue ────────────────────────────────────────────────────────────
create or replace function public.list_reports(
  p_status text default 'open', p_severity text default null, p_assigned text default null,
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, target_type text, target_id uuid, owner_id uuid, owner_name text, owner_username text,
  reporter_name text, category text, details text, severity text, status text, assigned_to uuid, assignee_name text,
  college_id uuid, college_name text, ai_suggestion jsonb, created_at timestamptz, resolved_at timestamptz, total_count bigint
) language sql stable security definer set search_path = '' as $$
  select r.id, r.target_type, r.target_id, r.target_owner_id, o.full_name, o.username,
         rp.full_name, r.category, r.details, r.severity, r.status, r.assigned_to, a.full_name,
         r.college_id, c.name, r.ai_suggestion, r.created_at, r.resolved_at,
         count(*) over ()
  from public.reports r
  left join public.profiles o on o.id = r.target_owner_id
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles a on a.id = r.assigned_to
  left join public.colleges c on c.id = r.college_id
  where public.has_permission('reports.view', r.college_id)
    and (case p_status
           when 'all' then true
           when 'open' then r.status in ('open', 'in_review')
           else r.status = p_status end)
    and (p_severity is null or r.severity = p_severity)
    and (p_assigned is null
         or (p_assigned = 'me' and r.assigned_to = (select auth.uid()))
         or (p_assigned = 'unassigned' and r.assigned_to is null))
  order by
    case when p_status = 'open' then case r.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end end,
    case when p_status = 'open' then r.created_at end asc,
    r.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create or replace function public.get_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.reports%rowtype;
  v_target jsonb;
  v_owner jsonb;
begin
  select * into r from public.reports where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('reports.view', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  if r.target_type = 'post' then
    select jsonb_build_object('status', p.status, 'slug', p.slug, 'title', p.title) into v_target from public.posts p where p.id = r.target_id;
  elsif r.target_type = 'comment' then
    select jsonb_build_object('status', c.status, 'post_id', c.post_id) into v_target from public.comments c where c.id = r.target_id;
  elsif r.target_type = 'user' then
    select jsonb_build_object('status', p.status, 'username', p.username) into v_target from public.profiles p where p.id = r.target_id;
  end if;

  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'username', p.username, 'status', p.status,
    'verification_status', p.verification_status, 'created_at', p.created_at,
    'protected', exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('global_admin', 'college_admin')))
    into v_owner from public.profiles p where p.id = r.target_owner_id;

  return jsonb_build_object(
    'report', to_jsonb(r) - 'reporter_id',
    'reporter_name', (select full_name from public.profiles where id = r.reporter_id),
    'assignee_name', (select full_name from public.profiles where id = r.assigned_to),
    'college_name', (select name from public.colleges where id = r.college_id),
    'target', coalesce(v_target, '{}'::jsonb),
    'owner', coalesce(v_owner, '{}'::jsonb),
    'same_target_reports', (select count(*) from public.reports x where x.target_type = r.target_type and x.target_id = r.target_id and x.id <> r.id),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'action', m.action, 'reason', m.reason, 'actor', ap.full_name, 'created_at', m.created_at, 'report_id', m.report_id)
        order by m.created_at desc)
      from (select * from public.moderation_actions
            where report_id = r.id or (r.target_owner_id is not null and target_user_id = r.target_owner_id)
            order by created_at desc limit 25) m
      left join public.profiles ap on ap.id = m.actor_id), '[]'::jsonb)
  );
end; $$;

create or replace function public.assign_report(p_id uuid, p_assign boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports%rowtype; v_me uuid := (select auth.uid());
begin
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('reports.resolve', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('resolved', 'dismissed') then raise exception 'already_resolved' using errcode = '23514'; end if;
  if p_assign then
    update public.reports set assigned_to = v_me, status = 'in_review' where id = p_id;
  else
    update public.reports set assigned_to = null, status = 'open' where id = p_id;
  end if;
end; $$;

create or replace function public.add_report_note(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports%rowtype; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  select * into r from public.reports where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('reports.resolve', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_note is null then raise exception 'reason_required' using errcode = '22023'; end if;
  perform public._log_moderation(r.id, (select auth.uid()), r.target_owner_id, r.target_type, r.target_id, r.college_id, 'note', v_note);
end; $$;

create or replace function public.resolve_report(p_id uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  r public.reports%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
  v_reporters uuid[];
  v_rep uuid;
  v_kind text;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.reports where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('reports.resolve', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status in ('resolved', 'dismissed') then raise exception 'already_resolved' using errcode = '23514'; end if;
  if p_action not in ('dismiss', 'warn', 'remove_content', 'restrict', 'suspend') then raise exception 'invalid_action' using errcode = '22023'; end if;
  if p_action <> 'dismiss' and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if r.reporter_id = v_actor then raise exception 'cannot_resolve_own_report' using errcode = '42501'; end if;

  if p_action = 'warn' and not public.has_permission('moderation.warn', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action = 'remove_content' and not public.has_permission('content.remove', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action = 'restrict' and not public.has_permission('users.restrict', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action = 'suspend' and not public.has_permission('users.suspend', r.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  if p_action <> 'dismiss' then
    perform public._assert_can_act_on(r.target_owner_id);
  end if;
  if p_action = 'remove_content' and r.target_type not in ('post', 'comment') then raise exception 'unsupported_action' using errcode = '22023'; end if;
  if p_action in ('restrict', 'suspend') and r.target_type <> 'user' and r.target_owner_id is null then raise exception 'target_unavailable' using errcode = 'P0002'; end if;
  v_kind := case when r.target_type = 'comment' then 'comment' when r.target_type = 'post' then 'post' else r.target_type end;

  if p_action = 'remove_content' then
    perform public._set_content_status(r.target_type, r.target_id, 'removed', v_actor, v_reason);
    perform public.notify(r.target_owner_id, 'moderation_content_removed', null, r.target_type, r.target_id,
      jsonb_build_object('reason', v_reason, 'kind', v_kind));
  elsif p_action = 'warn' then
    perform public.notify(r.target_owner_id, 'moderation_warning', null, r.target_type, r.target_id, jsonb_build_object('reason', v_reason));
  elsif p_action = 'restrict' then
    perform public.notify(r.target_owner_id, 'moderation_restriction', null, 'user', r.target_owner_id, jsonb_build_object('reason', v_reason, 'level', 'restricted'));
    update public.profiles set status = 'restricted' where id = r.target_owner_id and status = 'active';
  elsif p_action = 'suspend' then
    perform public.notify(r.target_owner_id, 'moderation_restriction', null, 'user', r.target_owner_id, jsonb_build_object('reason', v_reason, 'level', 'suspended'));
    update public.profiles set status = 'suspended' where id = r.target_owner_id and status in ('active', 'restricted');
  end if;

  perform public._log_moderation(r.id, v_actor, r.target_owner_id, r.target_type, r.target_id, r.college_id, p_action, v_reason);

  -- Close this report and (for real actions) every other open report about the same thing.
  with u as (
    update public.reports
       set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
           resolution = coalesce(v_reason, resolution),
           resolved_by = v_actor, resolved_at = now(), assigned_to = coalesce(assigned_to, v_actor)
     where target_type = r.target_type and target_id = r.target_id and status in ('open', 'in_review')
       and (id = r.id or p_action <> 'dismiss')
    returning reporter_id)
  select array_agg(distinct reporter_id) filter (where reporter_id is not null) into v_reporters from u;

  foreach v_rep in array coalesce(v_reporters, '{}'::uuid[]) loop
    perform public.notify(v_rep, 'moderation_report_outcome', null, 'report', r.id,
      jsonb_build_object('actioned', p_action <> 'dismiss'), 'report-outcome:' || r.id || ':' || v_rep);
  end loop;

  perform public.write_audit_log(v_actor, 'report.resolved', 'report', r.id::text, r.college_id,
    jsonb_build_object('action', p_action, 'target_type', r.target_type));
end; $$;

-- ── Direct actions on members and content (from user management / content lists) ──
create or replace function public.moderate_user(p_user uuid, p_action text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  t public.profiles%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
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
  perform public._assert_can_act_on(p_user);

  if p_action = 'warn' then
    if t.status not in ('active', 'restricted') then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public.notify(p_user, 'moderation_warning', null, 'user', p_user, jsonb_build_object('reason', v_reason));
  elsif p_action = 'restrict' then
    if t.status <> 'active' then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public.notify(p_user, 'moderation_restriction', null, 'user', p_user, jsonb_build_object('reason', v_reason, 'level', 'restricted'));
    update public.profiles set status = 'restricted' where id = p_user;
  elsif p_action = 'suspend' then
    if t.status not in ('active', 'restricted') then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public.notify(p_user, 'moderation_restriction', null, 'user', p_user, jsonb_build_object('reason', v_reason, 'level', 'suspended'));
    update public.profiles set status = 'suspended' where id = p_user;
  else
    if t.status not in ('restricted', 'suspended') then raise exception 'invalid_state' using errcode = '23514'; end if;
    update public.profiles set status = 'active' where id = p_user;
    update public.appeals a set status = 'upheld', reviewed_by = v_actor, reviewed_at = now(), review_note = 'Account reinstated by staff.'
      where a.user_id = p_user and a.status = 'pending'
        and exists (select 1 from public.moderation_actions m where m.id = a.action_id and m.action in ('restrict', 'suspend'));
    perform public.notify(p_user, 'moderation_reinstated', null, 'user', p_user, jsonb_build_object('note', v_reason));
  end if;
  perform public._log_moderation(null, v_actor, p_user, 'user', p_user, t.college_id, p_action, v_reason);
end; $$;

create or replace function public.moderate_content(p_type text, p_id uuid, p_action text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_college uuid; v_owner uuid; v_status text;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_type <> 'post' then raise exception 'unsupported_action' using errcode = '22023'; end if;
  if p_action not in ('remove', 'restore') then raise exception 'invalid_action' using errcode = '22023'; end if;
  select college_id, author_id, status into v_college, v_owner, v_status from public.posts where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission(case p_action when 'remove' then 'content.remove' else 'content.restore' end, v_college) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_action = 'remove' then
    if v_status <> 'published' then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public._assert_can_act_on(v_owner);
    perform public._set_content_status('post', p_id, 'removed', v_actor, v_reason);
    perform public.notify(v_owner, 'moderation_content_removed', null, 'post', p_id, jsonb_build_object('reason', v_reason, 'kind', 'post'));
  else
    if v_status <> 'removed' then raise exception 'invalid_state' using errcode = '23514'; end if;
    perform public._set_content_status('post', p_id, 'published', v_actor, v_reason);
  end if;
  perform public._log_moderation(null, v_actor, v_owner, 'post', p_id, v_college,
    case p_action when 'remove' then 'remove_content' else 'restore_content' end, v_reason);
end; $$;

-- ── Appeals ─────────────────────────────────────────────────────────────────
create or replace function public.submit_appeal(p_message text, p_action_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  me public.profiles%rowtype;
  act public.moderation_actions%rowtype;
  v_msg text := trim(coalesce(p_message, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into me from public.profiles where id = v_me;
  if not found or me.status in ('deactivated', 'deleted') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(v_msg) < 10 or char_length(v_msg) > 2000 then raise exception 'invalid_message' using errcode = '22023'; end if;

  if p_action_id is null then
    select * into act from public.moderation_actions
      where target_user_id = v_me and action in ('suspend', 'restrict') order by created_at desc limit 1;
  else
    select * into act from public.moderation_actions where id = p_action_id;
  end if;
  if not found or act.target_user_id is distinct from v_me or act.action not in ('warn', 'remove_content', 'restrict', 'suspend') then
    raise exception 'nothing_to_appeal' using errcode = 'P0002';
  end if;
  if act.created_at < now() - interval '30 days' then raise exception 'appeal_window_closed' using errcode = '23514'; end if;
  if act.action in ('restrict', 'suspend') and me.status not in ('restricted', 'suspended') then
    raise exception 'nothing_to_appeal' using errcode = 'P0002';
  end if;
  if (select count(*) from public.appeals where user_id = v_me and status = 'pending') >= 3 then
    raise exception 'too_many_pending' using errcode = '23514';
  end if;

  begin
    insert into public.appeals(user_id, action_id, college_id, message) values (v_me, act.id, me.college_id, v_msg) returning id into v_id;
  exception when unique_violation then
    raise exception 'already_appealed' using errcode = '23505';
  end;
  perform public.write_audit_log(v_me, 'appeal.submitted', 'appeal', v_id::text, me.college_id, jsonb_build_object('action', act.action));
  return v_id;
end; $$;

create or replace function public.list_appeals(p_status text default 'pending', p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, user_id uuid, full_name text, username text, user_status text, action_id uuid, action text, action_reason text,
  action_at timestamptz, actor_id uuid, actor_name text, message text, status text, review_note text, reviewer_name text,
  reviewed_at timestamptz, created_at timestamptz, college_id uuid, college_name text, snapshot jsonb, prior_actions bigint, total_count bigint
) language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, u.full_name, u.username, u.status, a.action_id, m.action, m.reason, m.created_at, m.actor_id, ma.full_name,
         a.message, a.status, a.review_note, rv.full_name, a.reviewed_at, a.created_at, a.college_id, c.name,
         (select r.snapshot from public.reports r where r.id = m.report_id),
         (select count(*) from public.moderation_actions x where x.target_user_id = a.user_id and x.action in ('warn', 'remove_content', 'restrict', 'suspend')),
         count(*) over ()
  from public.appeals a
  join public.profiles u on u.id = a.user_id
  join public.moderation_actions m on m.id = a.action_id
  left join public.profiles ma on ma.id = m.actor_id
  left join public.profiles rv on rv.id = a.reviewed_by
  left join public.colleges c on c.id = a.college_id
  where public.has_permission('appeals.review', a.college_id)
    and (p_status = 'all' or a.status = p_status)
  order by case when a.status = 'pending' then a.created_at end asc, a.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create or replace function public.review_appeal(p_id uuid, p_decision text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  a public.appeals%rowtype;
  m public.moderation_actions%rowtype;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_body text;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into a from public.appeals where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('appeals.review', a.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if a.status <> 'pending' then raise exception 'already_decided' using errcode = '23514'; end if;
  if p_decision not in ('upheld', 'denied') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  if v_note is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if a.user_id = v_actor then raise exception 'cannot_review_own_appeal' using errcode = '42501'; end if;
  select * into m from public.moderation_actions where id = a.action_id;
  -- Fresh eyes: the person who made the decision cannot be the one to overturn or confirm it (administrators excepted).
  if m.actor_id = v_actor and not public.has_permission('roles.manage', null) then
    raise exception 'cannot_review_own_decision' using errcode = '42501';
  end if;

  update public.appeals set status = p_decision, reviewed_by = v_actor, reviewed_at = now(), review_note = v_note where id = p_id;

  if p_decision = 'upheld' then
    if m.action in ('restrict', 'suspend') then
      update public.profiles set status = 'active' where id = a.user_id and status in ('restricted', 'suspended');
      perform public._log_moderation(null, v_actor, a.user_id, 'user', a.user_id, a.college_id, 'reinstate', 'Appeal upheld: ' || v_note);
    elsif m.action = 'remove_content' and m.target_id is not null then
      select r.snapshot ->> 'body' into v_body from public.reports r where r.id = m.report_id;
      begin
        perform public._set_content_status(m.target_type, m.target_id, 'published', v_actor, v_note, v_body);
        perform public._log_moderation(null, v_actor, a.user_id, m.target_type, m.target_id, a.college_id, 'restore_content', 'Appeal upheld: ' || v_note);
      exception when others then
        -- The content may be gone for good (e.g. a deleted comment); the decision itself still stands.
        null;
      end;
    end if;
  end if;

  perform public.notify(a.user_id, 'moderation_appeal_decision', null, 'appeal', a.id,
    jsonb_build_object('upheld', p_decision = 'upheld', 'note', v_note));
  perform public.write_audit_log(v_actor, 'appeal.' || p_decision, 'appeal', a.id::text, a.college_id, jsonb_build_object('action', m.action));
end; $$;

-- ── Verification: tell the member what was decided ──────────────────────────
create or replace function public.review_college_verification(
  p_id uuid, p_decision text, p_reason text default null, p_notes text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_college uuid; v_user uuid;
begin
  select college_id, user_id into v_college, v_user from public.college_verifications where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('verification.review', v_college) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision in ('rejected', 'needs_info') and coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  perform public.finalize_college_verification(p_id, p_decision, (select auth.uid()), p_reason, p_notes);
  perform public.notify(v_user, 'moderation_verification', null, 'verification', p_id,
    jsonb_build_object('approved', p_decision = 'approved', 'needs_info', p_decision = 'needs_info', 'reason', left(p_reason, 300)));
end; $$;

-- ── Users ───────────────────────────────────────────────────────────────────
create or replace function public.admin_list_users(
  p_q text default null, p_status text default null, p_role text default null, p_college uuid default null,
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, username text, full_name text, email text, avatar_key text, status text, verification_status text, account_type text,
  college_id uuid, college_name text, roles text[], created_at timestamptz, total_count bigint
) language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.full_name, u.email::text, p.avatar_key, p.status, p.verification_status, p.account_type,
         p.college_id, c.name,
         coalesce((select array_agg(distinct ur.role) from public.user_roles ur where ur.user_id = p.id), '{}'::text[]),
         p.created_at, count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.colleges c on c.id = p.college_id
  where public.has_permission('users.view', p.college_id)
    and (p_status is null or p.status = p_status)
    and (p_college is null or p.college_id = p_college)
    and (p_role is null or exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = p_role))
    and (nullif(trim(p_q), '') is null
         or p.username ilike '%' || public.escape_like(trim(p_q)) || '%'
         or p.full_name ilike '%' || public.escape_like(trim(p_q)) || '%'
         or u.email ilike '%' || public.escape_like(trim(p_q)) || '%')
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create or replace function public.admin_user_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles%rowtype; u auth.users%rowtype;
begin
  select * into p from public.profiles where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('users.view', p.college_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_id;
  return jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'headline', p.headline,
      'status', p.status, 'verification_status', p.verification_status, 'account_type', p.account_type,
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

create or replace function public.list_role_assignments()
returns table (
  id uuid, user_id uuid, full_name text, username text, role text, college_id uuid, college_name text,
  granted_by_name text, created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select ur.id, ur.user_id, p.full_name, p.username, ur.role, ur.college_id, c.name, g.full_name, ur.created_at
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join public.colleges c on c.id = ur.college_id
  left join public.profiles g on g.id = ur.granted_by
  where public.has_permission('roles.manage', ur.college_id) or public.has_permission('roles.manage_limited', ur.college_id)
  order by ur.role, p.full_name;
$$;

-- ── Content oversight (posts / communities / events) ────────────────────────
create or replace function public.admin_list_content(
  p_kind text, p_q text default null, p_status text default null, p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, slug text, title text, status text, detail text, owner_id uuid, owner_name text, owner_username text,
  college_id uuid, college_name text, created_at timestamptz, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_q text := '%' || public.escape_like(trim(coalesce(p_q, ''))) || '%';
begin
  if p_kind = 'post' then
    return query
      select x.id, x.slug, coalesce(nullif(x.title, ''), public._snippet(x.body, 80)), x.status, x.category || ' · ' || x.visibility,
             x.author_id, o.full_name, o.username, x.college_id, c.name, x.created_at, count(*) over ()
      from public.posts x join public.profiles o on o.id = x.author_id left join public.colleges c on c.id = x.college_id
      where public.has_permission('reports.view', x.college_id) and x.status <> 'deleted'
        and (p_status is null or x.status = p_status)
        and (nullif(trim(p_q), '') is null or x.title ilike v_q or x.body ilike v_q or o.username ilike v_q)
      order by x.created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
  elsif p_kind = 'community' then
    return query
      select x.id, x.slug, x.name, case when x.deleted_at is not null then 'removed' else 'active' end,
             x.kind || ' · ' || x.member_count || ' members' || case when x.is_official then ' · official' else '' end,
             x.created_by, o.full_name, o.username, x.college_id, c.name, x.created_at, count(*) over ()
      from public.communities x left join public.profiles o on o.id = x.created_by left join public.colleges c on c.id = x.college_id
      where public.has_permission('communities.manage', x.college_id)
        and (p_status is null or (p_status = 'removed') = (x.deleted_at is not null))
        and (nullif(trim(p_q), '') is null or x.name ilike v_q or x.slug ilike v_q)
      order by x.created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
  elsif p_kind = 'event' then
    return query
      select x.id, x.slug, x.title, case when x.deleted_at is not null then 'removed' else x.status end,
             x.kind || ' · ' || to_char(x.starts_at at time zone 'UTC', 'YYYY-MM-DD') || ' · ' || x.going_count || ' going',
             x.organizer_id, o.full_name, o.username, x.college_id, c.name, x.created_at, count(*) over ()
      from public.events x join public.profiles o on o.id = x.organizer_id left join public.colleges c on c.id = x.college_id
      where public.has_permission('events.manage', x.college_id)
        and (p_status is null or p_status = case when x.deleted_at is not null then 'removed' else x.status end)
        and (nullif(trim(p_q), '') is null or x.title ilike v_q or x.slug ilike v_q)
      order by x.created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
  else
    raise exception 'unsupported_action' using errcode = '22023';
  end if;
end; $$;

create or replace function public.admin_set_listing_removed(p_kind text, p_id uuid, p_removed boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid()); v_college uuid; v_owner uuid; v_title text;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_kind = 'community' then
    select college_id, created_by, name into v_college, v_owner, v_title from public.communities where id = p_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not public.has_permission('communities.manage', v_college) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.communities set deleted_at = case when p_removed then now() else null end where id = p_id;
  elsif p_kind = 'event' then
    select college_id, organizer_id, title into v_college, v_owner, v_title from public.events where id = p_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not public.has_permission('events.manage', v_college) then raise exception 'forbidden' using errcode = '42501'; end if;
    update public.events set deleted_at = case when p_removed then now() else null end where id = p_id;
  else
    raise exception 'unsupported_action' using errcode = '22023';
  end if;
  if p_removed and v_owner is not null then
    perform public.notify(v_owner, 'moderation_content_removed', null, p_kind, p_id, jsonb_build_object('reason', v_reason, 'kind', p_kind, 'title', v_title));
  end if;
  perform public.write_audit_log(v_actor, case when p_removed then p_kind || '.removed' else p_kind || '.restored' end, p_kind, p_id::text, v_college,
    jsonb_build_object('reason', v_reason));
end; $$;

-- ── Account deletion ────────────────────────────────────────────────────────
create or replace function public.admin_list_deletions(p_status text default 'pending')
returns table (
  id uuid, user_id uuid, full_name text, username text, email text, reason text, status text,
  requested_at timestamptz, scheduled_for timestamptz, college_id uuid
) language sql stable security definer set search_path = '' as $$
  select d.id, d.user_id, p.full_name, p.username, u.email::text, d.reason, d.status, d.requested_at, d.scheduled_for, p.college_id
  from public.account_deletion_requests d
  join public.profiles p on p.id = d.user_id
  join auth.users u on u.id = d.user_id
  where public.has_permission('users.delete', p.college_id) and (p_status = 'all' or d.status = p_status)
  order by d.scheduled_for asc limit 200;
$$;

-- Staff decision. 'approve' only moves the request to 'processing'; the server performs the erasure
-- (it also has to remove stored files) and the request disappears with the account.
create or replace function public.review_deletion_request(p_id uuid, p_decision text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.account_deletion_requests%rowtype; v_college uuid; v_actor uuid := (select auth.uid());
begin
  select * into d from public.account_deletion_requests where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select college_id into v_college from public.profiles where id = d.user_id;
  if not public.has_permission('users.delete', v_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d.status <> 'pending' then raise exception 'already_decided' using errcode = '23514'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  if p_decision = 'approve' then perform public._assert_can_act_on(d.user_id); end if;
  update public.account_deletion_requests
    set status = case when p_decision = 'approve' then 'processing' else 'rejected' end, processed_by = v_actor, processed_at = now()
    where id = p_id;
  perform public.write_audit_log(v_actor, 'account_deletion.' || p_decision, 'user', d.user_id::text, v_college, '{}'::jsonb);
  return d.user_id;
end; $$;

-- Worker: requests whose grace period has ended and that nobody cancelled.
create or replace function public.claim_due_deletions(p_limit integer default 10)
returns table (id uuid, user_id uuid) language sql security definer set search_path = '' as $$
  update public.account_deletion_requests d set status = 'processing', processed_at = now()
  where d.id in (
    select x.id from public.account_deletion_requests x
    where (x.status = 'processing' or (x.status = 'pending' and x.scheduled_for <= now()))
      and not exists (select 1 from public.user_roles ur where ur.user_id = x.user_id and ur.role in ('global_admin', 'college_admin'))
    order by x.scheduled_for limit least(greatest(p_limit, 1), 50) for update skip locked)
  returning d.id, d.user_id;
$$;
revoke execute on function public.claim_due_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_due_deletions(integer) to service_role;

-- ── Analytics ───────────────────────────────────────────────────────────────
create or replace function public.admin_overview(p_college uuid default null, p_from date default (current_date - 29), p_to date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz; v_to timestamptz;
begin
  if p_to < p_from or p_to - p_from > 366 then raise exception 'invalid_range' using errcode = '22023'; end if;
  if not public.has_permission('analytics.view', p_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_from := p_from::timestamp at time zone 'UTC';
  v_to := (p_to + 1)::timestamp at time zone 'UTC';
  return jsonb_build_object(
    'members', (select count(*) from public.profiles p where p.onboarded_at is not null and p.status in ('active', 'restricted') and (p_college is null or p.college_id = p_college)),
    'new_members', (select count(*) from public.profiles p where p.onboarded_at is not null and p.created_at >= v_from and p.created_at < v_to and (p_college is null or p.college_id = p_college)),
    'verified_members', (select count(*) from public.profiles p where p.verification_status = 'verified' and p.status in ('active', 'restricted') and (p_college is null or p.college_id = p_college)),
    'suspended_members', (select count(*) from public.profiles p where p.status in ('suspended', 'restricted') and (p_college is null or p.college_id = p_college)),
    'active_members', (select count(distinct s.uid) from (
        select po.author_id uid from public.posts po where po.created_at >= v_from and po.created_at < v_to and (p_college is null or po.college_id = p_college)
        union select c.author_id from public.comments c join public.posts po on po.id = c.post_id where c.created_at >= v_from and c.created_at < v_to and (p_college is null or po.college_id = p_college)
        union select m.sender_id from public.messages m join public.profiles pr on pr.id = m.sender_id where m.created_at >= v_from and m.created_at < v_to and (p_college is null or pr.college_id = p_college)
      ) s where s.uid is not null),
    'posts_total', (select count(*) from public.posts po where po.status = 'published' and (p_college is null or po.college_id = p_college)),
    'posts_period', (select count(*) from public.posts po where po.status = 'published' and po.created_at >= v_from and po.created_at < v_to and (p_college is null or po.college_id = p_college)),
    'comments_period', (select count(*) from public.comments c join public.posts po on po.id = c.post_id where c.status = 'published' and c.created_at >= v_from and c.created_at < v_to and (p_college is null or po.college_id = p_college)),
    'messages_period', (select count(*) from public.messages m join public.profiles pr on pr.id = m.sender_id where m.created_at >= v_from and m.created_at < v_to and (p_college is null or pr.college_id = p_college)),
    'projects_total', (select count(*) from public.projects pj where pj.deleted_at is null and (p_college is null or pj.college_id = p_college)),
    'projects_period', (select count(*) from public.projects pj where pj.deleted_at is null and pj.created_at >= v_from and pj.created_at < v_to and (p_college is null or pj.college_id = p_college)),
    'events_period', (select count(*) from public.events e where e.deleted_at is null and e.created_at >= v_from and e.created_at < v_to and (p_college is null or e.college_id = p_college)),
    'events_upcoming', (select count(*) from public.events e where e.deleted_at is null and e.status = 'published' and e.starts_at >= now() and (p_college is null or e.college_id = p_college)),
    'communities_total', (select count(*) from public.communities co where co.deleted_at is null and (p_college is null or co.college_id = p_college)),
    'connections_period', (select count(*) from public.connections cn join public.profiles pr on pr.id = cn.user_a where cn.created_at >= v_from and cn.created_at < v_to and (p_college is null or pr.college_id = p_college)),
    'reports_open', (select count(*) from public.reports r where r.status in ('open', 'in_review') and (p_college is null or r.college_id = p_college)),
    'reports_period', (select count(*) from public.reports r where r.created_at >= v_from and r.created_at < v_to and (p_college is null or r.college_id = p_college)),
    'reports_resolved_period', (select count(*) from public.reports r where r.resolved_at >= v_from and r.resolved_at < v_to and (p_college is null or r.college_id = p_college)),
    'appeals_pending', (select count(*) from public.appeals a where a.status = 'pending' and (p_college is null or a.college_id = p_college)),
    'verifications_pending', (select count(*) from public.college_verifications v where v.status in ('pending', 'needs_info') and (p_college is null or v.college_id = p_college)),
    'deletions_pending', (select count(*) from public.account_deletion_requests d join public.profiles pr on pr.id = d.user_id where d.status = 'pending' and (p_college is null or pr.college_id = p_college)),
    'posts_by_category', (select coalesce(jsonb_object_agg(k, n), '{}') from (select po.category k, count(*) n from public.posts po where po.status = 'published' and po.created_at >= v_from and po.created_at < v_to and (p_college is null or po.college_id = p_college) group by 1) s),
    'members_by_type', (select coalesce(jsonb_object_agg(k, n), '{}') from (select p.account_type k, count(*) n from public.profiles p where p.onboarded_at is not null and p.status in ('active', 'restricted') and (p_college is null or p.college_id = p_college) group by 1) s),
    'reports_by_category', (select coalesce(jsonb_object_agg(k, n), '{}') from (select r.category k, count(*) n from public.reports r where r.created_at >= v_from and r.created_at < v_to and (p_college is null or r.college_id = p_college) group by 1) s),
    'top_colleges', case when p_college is null then (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'members', s.n) order by s.n desc), '[]') from (
        select c.name, count(*) n from public.profiles p join public.colleges c on c.id = p.college_id where p.onboarded_at is not null and p.status in ('active', 'restricted') group by c.name order by n desc limit 8) s) else '[]'::jsonb end
  );
end; $$;

create or replace function public.admin_timeseries(p_metric text, p_college uuid default null, p_from date default (current_date - 29), p_to date default current_date)
returns table (day date, value integer) language plpgsql stable security definer set search_path = '' as $$
begin
  if p_to < p_from or p_to - p_from > 366 then raise exception 'invalid_range' using errcode = '22023'; end if;
  if p_metric not in ('members', 'posts', 'comments', 'reports', 'events', 'projects', 'messages') then raise exception 'invalid_metric' using errcode = '22023'; end if;
  if not public.has_permission('analytics.view', p_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with days as (select d::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d),
  counts as (
    select (s.at_ at time zone 'UTC')::date as day, count(*)::integer as n
    from (
      select p.created_at at_ from public.profiles p where p_metric = 'members' and p.onboarded_at is not null and (p_college is null or p.college_id = p_college)
      union all select po.created_at from public.posts po where p_metric = 'posts' and po.status = 'published' and (p_college is null or po.college_id = p_college)
      union all select c.created_at from public.comments c join public.posts po on po.id = c.post_id where p_metric = 'comments' and c.status = 'published' and (p_college is null or po.college_id = p_college)
      union all select r.created_at from public.reports r where p_metric = 'reports' and (p_college is null or r.college_id = p_college)
      union all select e.created_at from public.events e where p_metric = 'events' and e.deleted_at is null and (p_college is null or e.college_id = p_college)
      union all select pj.created_at from public.projects pj where p_metric = 'projects' and pj.deleted_at is null and (p_college is null or pj.college_id = p_college)
      union all select m.created_at from public.messages m join public.profiles pr on pr.id = m.sender_id where p_metric = 'messages' and (p_college is null or pr.college_id = p_college)
    ) s
    where s.at_ >= p_from::timestamp at time zone 'UTC' and s.at_ < (p_to + 1)::timestamp at time zone 'UTC'
    group by 1)
  select d.day, coalesce(c.n, 0) from days d left join counts c on c.day = d.day order by d.day;
end; $$;

create or replace function public.admin_ai_overview(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 90));
begin
  if not public.has_permission('ai.view', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.ai_usage_logs where created_at >= v_since),
    'avg_latency_ms', (select coalesce(round(avg(latency_ms)), 0) from public.ai_usage_logs where created_at >= v_since and status = 'success' and not cache_hit),
    'cache_hits', (select count(*) from public.ai_usage_logs where created_at >= v_since and cache_hit),
    'input_tokens', (select coalesce(sum(input_tokens), 0) from public.ai_usage_logs where created_at >= v_since),
    'output_tokens', (select coalesce(sum(output_tokens), 0) from public.ai_usage_logs where created_at >= v_since),
    'by_status', (select coalesce(jsonb_object_agg(k, n), '{}') from (select status k, count(*) n from public.ai_usage_logs where created_at >= v_since group by 1) s),
    'by_task', (select coalesce(jsonb_agg(jsonb_build_object('task', t, 'total', n, 'errors', e) order by n desc), '[]') from (
        select task t, count(*) n, count(*) filter (where status not in ('success', 'disabled', 'rate_limited', 'blocked')) e from public.ai_usage_logs where created_at >= v_since group by 1) s),
    'by_model', (select coalesce(jsonb_agg(jsonb_build_object('provider', pv, 'model', md, 'total', n) order by n desc), '[]') from (
        select provider pv, model md, count(*) n from public.ai_usage_logs where created_at >= v_since and model is not null group by 1, 2) s),
    'recent_errors', (select coalesce(jsonb_agg(jsonb_build_object('task', task, 'status', status, 'code', error_code, 'at', created_at)), '[]') from (
        select task, status, error_code, created_at from public.ai_usage_logs where created_at >= v_since and status in ('error', 'timeout', 'invalid_output') order by created_at desc limit 10) s),
    'jobs', (select coalesce(jsonb_object_agg(k, n), '{}') from (select status k, count(*) n from public.ai_jobs group by 1) s),
    'failed_jobs', (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'attempts', attempts, 'error', left(last_error, 160), 'at', updated_at)), '[]') from (
        select type, attempts, last_error, updated_at from public.ai_jobs where status = 'failed' order by updated_at desc limit 5) s),
    'embeddings', (select coalesce(jsonb_object_agg(k, n), '{}') from (select entity_type k, count(*) n from public.embeddings group by 1) s)
  );
end; $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function
  public.list_reports(text, text, text, integer, integer), public.get_report(uuid), public.assign_report(uuid, boolean),
  public.add_report_note(uuid, text), public.resolve_report(uuid, text, text),
  public.moderate_user(uuid, text, text), public.moderate_content(text, uuid, text, text),
  public.submit_appeal(text, uuid), public.list_appeals(text, integer, integer), public.review_appeal(uuid, text, text),
  public.admin_list_users(text, text, text, uuid, integer, integer), public.admin_user_detail(uuid), public.list_role_assignments(),
  public.admin_list_content(text, text, text, integer, integer), public.admin_set_listing_removed(text, uuid, boolean, text),
  public.admin_list_deletions(text), public.review_deletion_request(uuid, text),
  public.admin_overview(uuid, date, date), public.admin_timeseries(text, uuid, date, date), public.admin_ai_overview(integer)
  to authenticated, service_role;

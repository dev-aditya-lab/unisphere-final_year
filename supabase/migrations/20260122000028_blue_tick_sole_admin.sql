-- Blue tick: do not lock out the only administrator.
--
-- Migration 27 forbids reviewing your own application and granting a tick to yourself, so that no one approves their own
-- badge. When an organisation has a single administrator that rule makes the feature unusable.
--
-- New rule: the restriction applies whenever ANOTHER active administrator holds the permission (then that person must
-- do it). When the caller is the only one, they may act on their own record, and the audit log says so
-- ("self_review" / "self_grant") so it can always be seen afterwards.

-- Is there an active staff member, other than `p_me`, who holds `p_permission` everywhere?
create or replace function public._other_staff_with_permission(p_permission text, p_me uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles p on p.id = ur.user_id
    where rp.permission = p_permission
      and ur.college_id is null
      and ur.user_id <> p_me
      and p.status = 'active'
  );
$$;
revoke all on function public._other_staff_with_permission(text, uuid) from public, anon, authenticated;

create or replace function public.review_blue_tick_application(p_id uuid, p_decision text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_app public.blue_tick_applications%rowtype;
  v_file uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_self boolean;
begin
  if not public.has_permission('bluetick.review', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into v_app from public.blue_tick_applications where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_self := v_app.user_id = v_actor;
  if v_self and public._other_staff_with_permission('bluetick.review', v_actor) then
    raise exception 'cannot_review_own_request' using errcode = '42501';
  end if;
  if v_app.status <> 'pending_review' then raise exception 'already_decided' using errcode = '22023'; end if;
  v_file := v_app.document_file_id;

  if p_decision = 'approve' then
    update public.blue_tick_applications
      set status = 'approved', reviewed_by = v_actor, reviewed_at = now(), document_file_id = null, rejection_reason = null
      where id = p_id;
    insert into public.blue_tick_grants(user_id, source, application_id, granted_by)
      values (v_app.user_id, 'purchase', p_id, v_actor)
      on conflict do nothing;
    update public.profiles set blue_tick = true, blue_tick_at = coalesce(blue_tick_at, now()) where id = v_app.user_id;
    perform public.write_audit_log(v_actor, 'bluetick.approved', 'blue_tick_application', p_id::text, null,
      jsonb_build_object('user', v_app.user_id, 'self_review', v_self));
  else
    if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.blue_tick_applications
      set status = 'awaiting_document', reviewed_by = v_actor, reviewed_at = now(), document_file_id = null,
          rejection_reason = left(v_reason, 500), attempts = attempts + 1
      where id = p_id;
    perform public.write_audit_log(v_actor, 'bluetick.rejected', 'blue_tick_application', p_id::text, null,
      jsonb_build_object('user', v_app.user_id, 'attempts', v_app.attempts + 1, 'self_review', v_self));
  end if;
  return jsonb_build_object('user_id', v_app.user_id, 'document_file_id', v_file);
end;
$$;
grant execute on function public.review_blue_tick_application(uuid, text, text) to authenticated;

create or replace function public.admin_set_blue_tick(p_user uuid, p_on boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status text;
  v_self boolean := p_user = (select auth.uid());
begin
  if not public.has_permission('bluetick.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  select status into v_status from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_on then
    -- With other administrators around, someone else has to give you a tick. The only administrator may give their own.
    if v_self and public._other_staff_with_permission('bluetick.manage', v_actor) then
      raise exception 'cannot_grant_to_self' using errcode = '42501';
    end if;
    if v_status <> 'active' then raise exception 'target_unavailable' using errcode = '22023'; end if;
    if exists (select 1 from public.blue_tick_grants where user_id = p_user and revoked_at is null) then
      raise exception 'already_has_tick' using errcode = '22023';
    end if;
    insert into public.blue_tick_grants(user_id, source, granted_by, reason)
      values (p_user, 'admin', v_actor, left(v_reason, 300));
    update public.profiles set blue_tick = true, blue_tick_at = now() where id = p_user;
    perform public.write_audit_log(v_actor, 'bluetick.granted_free', 'user', p_user::text, null,
      jsonb_build_object('reason', left(v_reason, 300), 'self_grant', v_self));
  else
    update public.blue_tick_grants
      set revoked_at = now(), revoked_by = v_actor, revoke_reason = left(v_reason, 300)
      where user_id = p_user and revoked_at is null;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.profiles set blue_tick = false, blue_tick_at = null where id = p_user;
    perform public.write_audit_log(v_actor, 'bluetick.revoked', 'user', p_user::text, null, jsonb_build_object('reason', left(v_reason, 300)));
  end if;
end;
$$;
grant execute on function public.admin_set_blue_tick(uuid, boolean, text) to authenticated;

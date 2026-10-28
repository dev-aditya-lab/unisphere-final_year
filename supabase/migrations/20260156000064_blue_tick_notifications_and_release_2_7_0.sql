-- 0064: the blue tick tells the member what happened, and the release note for 2.7.0
--
-- Until now a blue tick was bought, reviewed, refunded or taken away without the member being told anywhere but by opening the page.
-- Every one of those moments now notifies the member through public.notify() (category "moderation", so the member's In app / Push / Email
-- switches apply), with the `event` in the notification's data: paid, approved, rejected, refunded, granted, revoked.
-- The functions below are the definitions that were live (from 0027 and 0028) with one added notify() call each; nothing else in them changed.

create or replace function public.fulfil_blue_tick_order(p_order text, p_payment text, p_amount integer, p_method text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.blue_tick_orders%rowtype;
  v_app uuid;
begin
  select * into v_order from public.blue_tick_orders where provider_order_id = p_order for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_order.status = 'paid' or v_order.status = 'refunded' then
    select id into v_app from public.blue_tick_applications where order_id = v_order.id;
    return jsonb_build_object('status', v_order.status, 'application_id', v_app, 'duplicate', false, 'already', true);
  end if;
  if v_order.amount_paise <> p_amount then raise exception 'amount_mismatch' using errcode = '22023'; end if;

  update public.blue_tick_orders
    set status = 'paid', provider_payment_id = p_payment, method = left(p_method, 40), paid_at = now()
    where id = v_order.id;

  -- Paid for a tick they already hold (or are already applying for): record it, and tell the server to refund it.
  if v_order.user_id is null
     or exists (select 1 from public.blue_tick_grants g where g.user_id = v_order.user_id and g.revoked_at is null)
     or exists (select 1 from public.blue_tick_applications a where a.user_id = v_order.user_id and a.status in ('awaiting_document', 'pending_review')) then
    update public.blue_tick_orders set note = 'Duplicate payment: refund due' where id = v_order.id;
    return jsonb_build_object('status', 'paid', 'application_id', null, 'duplicate', true, 'already', false);
  end if;

  insert into public.blue_tick_applications(user_id, order_id) values (v_order.user_id, v_order.id) returning id into v_app;
  perform public.write_audit_log(v_order.user_id, 'bluetick.paid', 'blue_tick_order', v_order.id::text, null,
    jsonb_build_object('amount_paise', v_order.amount_paise));
  -- The receipt: the payment arrived, and the next step is theirs.
  perform public.notify(v_order.user_id, 'moderation_blue_tick', null, 'blue_tick_application', v_app, jsonb_build_object('event', 'paid'), 'bt:paid:' || v_order.id);
  return jsonb_build_object('status', 'paid', 'application_id', v_app, 'duplicate', false, 'already', false);
end;
$$;

create or replace function public.review_blue_tick_application(p_id uuid, p_decision text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    perform public.notify(v_app.user_id, 'moderation_blue_tick', null, 'blue_tick_application', p_id, jsonb_build_object('event', 'approved'));
  else
    if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.blue_tick_applications
      set status = 'awaiting_document', reviewed_by = v_actor, reviewed_at = now(), document_file_id = null,
          rejection_reason = left(v_reason, 500), attempts = attempts + 1
      where id = p_id;
    perform public.write_audit_log(v_actor, 'bluetick.rejected', 'blue_tick_application', p_id::text, null,
      jsonb_build_object('user', v_app.user_id, 'attempts', v_app.attempts + 1, 'self_review', v_self));
    perform public.notify(v_app.user_id, 'moderation_blue_tick', null, 'blue_tick_application', p_id,
      jsonb_build_object('event', 'rejected', 'reason', left(v_reason, 200)));
  end if;
  return jsonb_build_object('user_id', v_app.user_id, 'document_file_id', v_file);
end;
$$;

create or replace function public.refund_blue_tick_order(p_payment text, p_actor uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order public.blue_tick_orders%rowtype;
  v_app public.blue_tick_applications%rowtype;
begin
  select * into v_order from public.blue_tick_orders where provider_payment_id = p_payment for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_order.status = 'refunded' then return; end if;

  update public.blue_tick_orders
    set status = 'refunded', refunded_at = now(), refunded_by = p_actor, note = coalesce(left(p_note, 300), note)
    where id = v_order.id;

  select * into v_app from public.blue_tick_applications where order_id = v_order.id for update;
  if found then
    if v_app.status = 'approved' then
      update public.blue_tick_grants set revoked_at = now(), revoked_by = p_actor, revoke_reason = 'Payment refunded'
        where application_id = v_app.id and revoked_at is null;
      update public.profiles set blue_tick = false, blue_tick_at = null
        where id = v_app.user_id
          and not exists (select 1 from public.blue_tick_grants g where g.user_id = v_app.user_id and g.revoked_at is null);
    end if;
    update public.blue_tick_applications set status = 'refunded', document_file_id = null where id = v_app.id;
  end if;
  perform public.write_audit_log(p_actor, 'bluetick.refunded', 'blue_tick_order', v_order.id::text, null,
    jsonb_build_object('amount_paise', v_order.amount_paise));
  if v_order.user_id is not null then
    perform public.notify(v_order.user_id, 'moderation_blue_tick', null, 'blue_tick_order', v_order.id, jsonb_build_object('event', 'refunded'));
  end if;
end;
$$;

create or replace function public.admin_set_blue_tick(p_user uuid, p_on boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
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
    perform public.notify(p_user, 'moderation_blue_tick', null, 'user', p_user, jsonb_build_object('event', 'granted'));
  else
    update public.blue_tick_grants
      set revoked_at = now(), revoked_by = v_actor, revoke_reason = left(v_reason, 300)
      where user_id = p_user and revoked_at is null;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.profiles set blue_tick = false, blue_tick_at = null where id = p_user;
    perform public.write_audit_log(v_actor, 'bluetick.revoked', 'user', p_user::text, null, jsonb_build_object('reason', left(v_reason, 300)));
    perform public.notify(p_user, 'moderation_blue_tick', null, 'user', p_user, jsonb_build_object('event', 'revoked', 'reason', left(v_reason, 200)));
  end if;
end;
$$;

-- Release note for 2.7.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.7.0', 'Notifications you control',
  'Every feature now tells you what happened, you choose which ones reach your phone, and messages arrive the moment they are sent.',
  '[{"kind":"new","text":"Messages reach your phone at once. Every new message is pushed as it is sent, and a burst from one person collects into one notification instead of piling up. Your lock screen shows who wrote, never what they wrote."},
    {"kind":"new","text":"A Push switch for every kind of notification, next to In app and Email, in Settings > Notifications. Turn off reactions on your phone and keep messages, or the other way round."},
    {"kind":"new","text":"Official broadcasts. Staff can notify everyone, a college, a community or named people, for example about an event, a change or something important. Your notification settings still decide how it reaches you."},
    {"kind":"new","text":"The blue tick now tells you when your payment arrives, when your ID is approved or needs another look, when a payment is refunded, and when a tick is granted or removed."},
    {"kind":"improved","text":"Other notifications reach your phone within seconds instead of minutes."},
    {"kind":"improved","text":"If you are already looking at a conversation, a new message in it no longer pops up on top of it."}]'::jsonb,
  null)
on conflict (version) do nothing;

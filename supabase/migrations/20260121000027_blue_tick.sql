-- Blue tick: a one-time paid badge, confirmed by an administrator against an ID document (or granted free by one).
--
-- Flow:  pay (Razorpay)  ->  upload ID proof  ->  administrator reviews  ->  tick.
--   * Money and the badge are separate records: `blue_tick_orders` (payments) and `blue_tick_applications` (review).
--   * The badge itself is `profiles.blue_tick`. Members cannot write it: profiles has column-level UPDATE grants and
--     this column is not in the list. It changes only through the SECURITY DEFINER functions below.
--   * Payments are written ONLY by the server with the service role, after the payment provider's signature has been
--     verified. Nothing here is callable by `anon`.
--   * The ID document lives in the existing private `verification_document` storage. Reviewers can open it; the
--     server deletes the object as soon as a decision is made, so only the decision is kept.
--   * Price and on/off are platform settings changed only through `set_blue_tick_pricing` (permission bluetick.manage).
--     Nothing is charged until an administrator enables it and sets a price: the default is off, at 0.

-- ── Badge columns ───────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists blue_tick boolean not null default false,
  add column if not exists blue_tick_at timestamptz;

-- ── Permissions (global administrators only) ────────────────────────────────
--   payments.view     the payments dashboard and order list
--   bluetick.review   open submitted ID documents, approve or reject applications
--   bluetick.manage   set the price, give or remove a tick free of charge, refund
insert into public.role_permissions(role, permission) values
  ('global_admin', 'payments.view'),
  ('global_admin', 'bluetick.review'),
  ('global_admin', 'bluetick.manage')
on conflict do nothing;

-- ── Settings (public so the pricing page can show the price) ────────────────
insert into public.system_settings(key, value, is_public, description) values
  ('blue_tick_enabled', 'false', true, 'Blue tick purchases are open'),
  ('blue_tick_price_paise', '0', true, 'One-time blue tick price in paise (100 paise = 1 INR)')
on conflict (key) do nothing;

-- The generic setter must not be a side door to the price.
create or replace function public.set_system_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old jsonb;
begin
  if not public.has_permission('settings.manage', null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key like 'blue\_tick\_%' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select value into v_old from public.system_settings where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = 'P0002'; end if;

  update public.system_settings set value = p_value, updated_by = v_actor, updated_at = now() where key = p_key;

  perform public.write_audit_log(v_actor, 'settings.updated', 'setting', p_key, null,
    case
      when jsonb_typeof(p_value) in ('boolean', 'number') then jsonb_build_object('old', v_old, 'new', p_value)
      else jsonb_build_object('changed', true)
    end);
end;
$$;

-- ── Payments ────────────────────────────────────────────────────────────────
create table public.blue_tick_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  payer_username text,
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  provider_payment_id text unique,
  amount_paise integer not null check (amount_paise >= 100 and amount_paise <= 100000000),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  method text check (method is null or char_length(method) <= 40),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  refunded_by uuid references public.profiles(id) on delete set null
);
create index blue_tick_orders_user_idx on public.blue_tick_orders(user_id, created_at desc);
create index blue_tick_orders_status_idx on public.blue_tick_orders(status, created_at desc);

alter table public.blue_tick_orders enable row level security;
-- A member may read their own orders. No INSERT/UPDATE/DELETE grant exists: the server writes with the service role.
grant select on public.blue_tick_orders to authenticated;
create policy blue_tick_orders_own on public.blue_tick_orders for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Review of the ID document ───────────────────────────────────────────────
create table public.blue_tick_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid unique references public.blue_tick_orders(id) on delete set null,
  status text not null default 'awaiting_document'
    check (status in ('awaiting_document', 'pending_review', 'approved', 'refunded')),
  document_file_id uuid references public.files(id) on delete set null,
  attempts integer not null default 0,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open application per member, and one approved one.
create unique index blue_tick_applications_open_idx
  on public.blue_tick_applications(user_id) where status in ('awaiting_document', 'pending_review');
create unique index blue_tick_applications_approved_idx
  on public.blue_tick_applications(user_id) where status = 'approved';
create index blue_tick_applications_queue_idx on public.blue_tick_applications(status, submitted_at);
create trigger trg_blue_tick_applications_updated before update on public.blue_tick_applications
  for each row execute function public.set_updated_at();

alter table public.blue_tick_applications enable row level security;
grant select on public.blue_tick_applications to authenticated;
create policy blue_tick_applications_own on public.blue_tick_applications for select to authenticated
  using (user_id = (select auth.uid()));

-- ── Active badges, with where each came from ────────────────────────────────
create table public.blue_tick_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('purchase', 'admin')),
  application_id uuid references public.blue_tick_applications(id) on delete set null,
  granted_by uuid references public.profiles(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 300)
);
create unique index blue_tick_grants_active_idx on public.blue_tick_grants(user_id) where revoked_at is null;
alter table public.blue_tick_grants enable row level security;
-- No policy and no grant: read only through the staff functions below.

-- ── Reviewers may open the ID document ──────────────────────────────────────
create or replace function public.can_review_verification_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.college_verifications v
    where v.document_file_id = p_file and public.has_permission('verification.review', v.college_id)
  ) or exists (
    select 1 from public.blue_tick_applications a
    where a.document_file_id = p_file and a.status = 'pending_review' and public.has_permission('bluetick.review', null)
  );
$$;
grant execute on function public.can_review_verification_file(uuid) to authenticated, service_role;

-- ── Member: send the ID document for review ─────────────────────────────────
create or replace function public.submit_blue_tick_document(p_application uuid, p_file uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_app public.blue_tick_applications%rowtype;
begin
  if v_actor is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_app from public.blue_tick_applications where id = p_application and user_id = v_actor for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_app.status <> 'awaiting_document' then raise exception 'invalid_state' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.files f
    where f.id = p_file and f.owner_id = v_actor and f.purpose = 'verification_document' and f.status = 'ready'
  ) then raise exception 'invalid_document' using errcode = '22023'; end if;

  update public.blue_tick_applications
    set status = 'pending_review', document_file_id = p_file, submitted_at = now(), rejection_reason = null
    where id = p_application;
end;
$$;
grant execute on function public.submit_blue_tick_document(uuid, uuid) to authenticated;

-- ── Reviewer: approve or send back ──────────────────────────────────────────
-- Returns the document that was attached, so the server can delete the stored object once a decision exists.
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
begin
  if not public.has_permission('bluetick.review', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into v_app from public.blue_tick_applications where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_app.user_id = v_actor then raise exception 'cannot_review_own_request' using errcode = '42501'; end if;
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
      jsonb_build_object('user', v_app.user_id));
  else
    if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.blue_tick_applications
      set status = 'awaiting_document', reviewed_by = v_actor, reviewed_at = now(), document_file_id = null,
          rejection_reason = left(v_reason, 500), attempts = attempts + 1
      where id = p_id;
    perform public.write_audit_log(v_actor, 'bluetick.rejected', 'blue_tick_application', p_id::text, null,
      jsonb_build_object('user', v_app.user_id, 'attempts', v_app.attempts + 1));
  end if;
  return jsonb_build_object('user_id', v_app.user_id, 'document_file_id', v_file);
end;
$$;
grant execute on function public.review_blue_tick_application(uuid, text, text) to authenticated;

-- ── Administrator: give or remove a tick free of charge ─────────────────────
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
begin
  if not public.has_permission('bluetick.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  select status into v_status from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_on then
    -- Granting to yourself is a conflict of interest: another administrator has to do it.
    if p_user = v_actor then raise exception 'cannot_grant_to_self' using errcode = '42501'; end if;
    if v_status <> 'active' then raise exception 'target_unavailable' using errcode = '22023'; end if;
    if exists (select 1 from public.blue_tick_grants where user_id = p_user and revoked_at is null) then
      raise exception 'already_has_tick' using errcode = '22023';
    end if;
    insert into public.blue_tick_grants(user_id, source, granted_by, reason)
      values (p_user, 'admin', v_actor, left(v_reason, 300));
    update public.profiles set blue_tick = true, blue_tick_at = now() where id = p_user;
    perform public.write_audit_log(v_actor, 'bluetick.granted_free', 'user', p_user::text, null, jsonb_build_object('reason', left(v_reason, 300)));
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

-- ── Administrator: price and on/off ─────────────────────────────────────────
create or replace function public.set_blue_tick_pricing(p_enabled boolean, p_price_paise integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_price jsonb;
  v_old_enabled jsonb;
begin
  if not public.has_permission('bluetick.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_price_paise is null or p_price_paise < 100 or p_price_paise > 10000000 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;
  select value into v_old_price from public.system_settings where key = 'blue_tick_price_paise';
  select value into v_old_enabled from public.system_settings where key = 'blue_tick_enabled';
  update public.system_settings set value = to_jsonb(p_price_paise), updated_by = v_actor, updated_at = now() where key = 'blue_tick_price_paise';
  update public.system_settings set value = to_jsonb(p_enabled), updated_by = v_actor, updated_at = now() where key = 'blue_tick_enabled';
  perform public.write_audit_log(v_actor, 'bluetick.pricing_changed', 'setting', 'blue_tick', null,
    jsonb_build_object('old_price_paise', v_old_price, 'new_price_paise', p_price_paise, 'old_enabled', v_old_enabled, 'new_enabled', p_enabled));
end;
$$;
grant execute on function public.set_blue_tick_pricing(boolean, integer) to authenticated;

-- ── Server only (service role): payment results ─────────────────────────────
-- The payment was verified by the server (provider signature + a read of the payment from the provider's API).
create or replace function public.fulfil_blue_tick_order(p_order text, p_payment text, p_amount integer, p_method text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  return jsonb_build_object('status', 'paid', 'application_id', v_app, 'duplicate', false, 'already', false);
end;
$$;

create or replace function public.fail_blue_tick_order(p_order text, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.blue_tick_orders set status = 'failed', note = left(p_note, 300)
  where provider_order_id = p_order and status = 'created';
$$;

-- Refund recorded (by an administrator, or by the provider's webhook when it was done in their dashboard).
create or replace function public.refund_blue_tick_order(p_payment text, p_actor uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
end;
$$;

revoke all on function public.fulfil_blue_tick_order(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.fail_blue_tick_order(text, text) from public, anon, authenticated;
revoke all on function public.refund_blue_tick_order(text, uuid, text) from public, anon, authenticated;
grant execute on function public.fulfil_blue_tick_order(text, text, integer, text) to service_role;
grant execute on function public.fail_blue_tick_order(text, text) to service_role;
grant execute on function public.refund_blue_tick_order(text, uuid, text) to service_role;

-- ── Administrator reads ─────────────────────────────────────────────────────
create or replace function public.admin_payments_overview(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_orders jsonb;
  v_series jsonb;
  v_ticks jsonb;
  v_apps jsonb;
begin
  if not public.has_permission('payments.view', null) then raise exception 'forbidden' using errcode = '42501'; end if;

  select jsonb_build_object(
    'paid_count', count(*) filter (where status = 'paid'),
    'net_paise', coalesce(sum(amount_paise) filter (where status = 'paid'), 0),
    'refunded_count', count(*) filter (where status = 'refunded'),
    'refunded_paise', coalesce(sum(amount_paise) filter (where status = 'refunded'), 0),
    'failed_count', count(*) filter (where status = 'failed'),
    'open_count', count(*) filter (where status = 'created' and created_at > now() - interval '1 hour'),
    'abandoned_count', count(*) filter (where status = 'created' and created_at <= now() - interval '1 hour'),
    'period_paid_count', count(*) filter (where status = 'paid' and paid_at >= now() - make_interval(days => v_days)),
    'period_net_paise', coalesce(sum(amount_paise) filter (where status = 'paid' and paid_at >= now() - make_interval(days => v_days)), 0),
    'refund_due_count', count(*) filter (where status = 'paid' and note like 'Duplicate payment%')
  ) into v_orders from public.blue_tick_orders;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date::text, 'value', coalesce(o.n, 0), 'paise', coalesce(o.r, 0)) order by d), '[]'::jsonb)
    into v_series
    from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d
    left join (
      select (paid_at at time zone 'Asia/Kolkata')::date as day, count(*) as n, sum(amount_paise) as r
      from public.blue_tick_orders where status = 'paid' and paid_at >= now() - make_interval(days => v_days + 1)
      group by 1
    ) o on o.day = d::date;

  select jsonb_build_object(
    'active', count(*) filter (where revoked_at is null),
    'purchased', count(*) filter (where revoked_at is null and source = 'purchase'),
    'free', count(*) filter (where revoked_at is null and source = 'admin')
  ) into v_ticks from public.blue_tick_grants;

  select jsonb_build_object(
    'awaiting_document', count(*) filter (where status = 'awaiting_document'),
    'pending_review', count(*) filter (where status = 'pending_review')
  ) into v_apps from public.blue_tick_applications;

  return jsonb_build_object(
    'orders', v_orders, 'series', v_series, 'ticks', v_ticks, 'applications', v_apps,
    'pricing', jsonb_build_object(
      'enabled', coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'blue_tick_enabled'), false),
      'price_paise', coalesce((select (value #>> '{}')::integer from public.system_settings where key = 'blue_tick_price_paise'), 0)
    )
  );
end;
$$;

create or replace function public.admin_list_blue_tick_orders(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table(
  id uuid, provider_order_id text, provider_payment_id text, amount_paise integer, status text, method text, note text,
  created_at timestamptz, paid_at timestamptz, refunded_at timestamptz, user_id uuid, username text, full_name text,
  application_status text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('payments.view', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select o.id, o.provider_order_id, o.provider_payment_id, o.amount_paise, o.status, o.method, o.note,
           o.created_at, o.paid_at, o.refunded_at, o.user_id, coalesce(p.username, o.payer_username), p.full_name,
           a.status, count(*) over ()
    from public.blue_tick_orders o
    left join public.profiles p on p.id = o.user_id
    left join public.blue_tick_applications a on a.order_id = o.id
    where p_status is null or p_status = 'all' or o.status = p_status
    order by o.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_list_blue_tick_applications(p_status text default 'pending_review', p_limit integer default 25, p_offset integer default 0)
returns table(
  id uuid, order_id uuid, status text, attempts integer, submitted_at timestamptz, created_at timestamptz, reviewed_at timestamptz,
  rejection_reason text, document_file_id uuid, user_id uuid, username text, full_name text, headline text,
  amount_paise integer, provider_payment_id text, order_status text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('bluetick.review', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select a.id, a.order_id, a.status, a.attempts, a.submitted_at, a.created_at, a.reviewed_at, a.rejection_reason, a.document_file_id,
           a.user_id, p.username, p.full_name, p.headline, o.amount_paise, o.provider_payment_id, o.status, count(*) over ()
    from public.blue_tick_applications a
    join public.profiles p on p.id = a.user_id
    left join public.blue_tick_orders o on o.id = a.order_id
    where p_status is null or p_status = 'all' or a.status = p_status
    order by coalesce(a.submitted_at, a.created_at) asc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_list_blue_ticks(p_limit integer default 25, p_offset integer default 0)
returns table(
  id uuid, user_id uuid, username text, full_name text, source text, reason text, created_at timestamptz,
  granted_by_username text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('payments.view', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select g.id, g.user_id, p.username, p.full_name, g.source, g.reason, g.created_at, gb.username, count(*) over ()
    from public.blue_tick_grants g
    join public.profiles p on p.id = g.user_id
    left join public.profiles gb on gb.id = g.granted_by
    where g.revoked_at is null
    order by g.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- Refund target: what the server needs to ask the provider to refund. Checks the permission as the caller.
create or replace function public.blue_tick_refund_target(p_order uuid)
returns table(provider_payment_id text, amount_paise integer, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('bluetick.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select o.provider_payment_id, o.amount_paise, o.status from public.blue_tick_orders o where o.id = p_order;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.admin_payments_overview(integer), public.admin_list_blue_tick_orders(text, integer, integer),
  public.admin_list_blue_tick_applications(text, integer, integer), public.admin_list_blue_ticks(integer, integer),
  public.blue_tick_refund_target(uuid) from public, anon;
grant execute on function public.admin_payments_overview(integer), public.admin_list_blue_tick_orders(text, integer, integer),
  public.admin_list_blue_tick_applications(text, integer, integer), public.admin_list_blue_ticks(integer, integer),
  public.blue_tick_refund_target(uuid) to authenticated;

-- ── Show the badge next to authors ──────────────────────────────────────────
-- A column is appended at the end so existing consumers (functions returning post_feed) keep working.
create or replace view public.post_feed with (security_barrier = true) as
select
  p.id, p.slug, p.author_id, p.college_id, p.community_id, p.project_id, p.category, p.title, p.body,
  p.visibility, p.status, p.reaction_count, p.reactions, p.comment_count, p.repost_count,
  p.edited_at, p.created_at, p.repost_of_id,
  a.full_name as author_name,
  a.username as author_username,
  a.avatar_key as author_avatar_key,
  a.account_type as author_account_type,
  a.headline as author_headline,
  (a.verification_status = 'verified') as author_verified,
  (select r.reaction from public.post_reactions r where r.post_id = p.id and r.user_id = (select auth.uid())) as my_reaction,
  exists (select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = (select auth.uid())) as bookmarked,
  o.slug as original_slug,
  o.title as original_title,
  o.body as original_body,
  o.category as original_category,
  o.created_at as original_created_at,
  oa.full_name as original_author_name,
  oa.username as original_author_username,
  oa.avatar_key as original_author_avatar_key,
  (p.removed_reason is not null) as has_removal_notice,
  (
    select coalesce(jsonb_agg(jsonb_build_object('id', pa.file_id, 'alt', pa.alt_text) order by pa.position, pa.created_at), '[]'::jsonb)
    from public.post_attachments pa where pa.post_id = p.id
  ) as attachments,
  a.blue_tick as author_blue_tick
from public.posts p
join public.profiles a on a.id = p.author_id
left join public.posts o
  on o.id = p.repost_of_id
 and public.can_view_post(o.author_id, o.college_id, o.visibility, o.community_id, o.status)
left join public.profiles oa on oa.id = o.author_id
where public.can_view_post(p.author_id, p.college_id, p.visibility, p.community_id, p.status);

create or replace view public.comment_feed with (security_barrier = true) as
select
  c.id, c.post_id, c.parent_id, c.author_id, c.body, c.status, c.like_count, c.reply_count,
  c.edited_at, c.created_at,
  a.full_name as author_name,
  a.username as author_username,
  a.avatar_key as author_avatar_key,
  a.account_type as author_account_type,
  (a.verification_status = 'verified') as author_verified,
  exists (select 1 from public.comment_reactions cr where cr.comment_id = c.id and cr.user_id = (select auth.uid())) as liked,
  p.slug as post_slug,
  p.author_id as post_author_id,
  a.blue_tick as author_blue_tick
from public.comments c
join public.profiles a on a.id = c.author_id
join public.posts p on p.id = c.post_id
where public.can_view_post(p.author_id, p.college_id, p.visibility, p.community_id, p.status)
  and (c.status = 'published' or (c.status in ('deleted', 'removed') and c.reply_count > 0))
  and ((select auth.uid()) is null or not public.is_blocked_between((select auth.uid()), c.author_id));

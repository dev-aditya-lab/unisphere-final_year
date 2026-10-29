-- 0067: UniSphere Academy, part 3 of 4: coupons, the pricing engine, orders, payments, refunds.
--
-- The server (this database) is the only source of a price. A browser never sends an amount, a discount or a currency:
-- it names a course, a cohort and a coupon CODE, and `_academy_quote` works out the rest from stored facts.
--
-- Pricing order (deterministic, documented in docs/ACADEMY.md):
--   1. list price            academy_courses.price_minor
--   2. scheduled price       the lowest price among active rules valid right now (a rule never raises the price)
--   3. coupon                validated against the amount after step 2; percent coupons round half up and honour a cap
--   4. tax                   from the Academy settings: none, inclusive (already inside the price) or exclusive (added)
--   5. total                 what the student pays
-- A coupon and a scheduled price stack only if the global setting and the coupon both allow it.
-- Every figure is a bigint in minor units (paise). Orders keep a snapshot, so later price changes never alter past purchases.

-- ═══════════════ 1. Coupons ═══════════════
create table public.academy_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  description text check (description is null or char_length(description) <= 200),
  kind text not null check (kind in ('percent', 'fixed')),
  percent_bps integer check (percent_bps is null or percent_bps between 1 and 10000),
  amount_minor bigint check (amount_minor is null or amount_minor between 1 and 100000000),
  max_discount_minor bigint check (max_discount_minor is null or max_discount_minor >= 1),
  min_purchase_minor bigint not null default 0 check (min_purchase_minor >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  usage_limit integer check (usage_limit is null or usage_limit between 1 and 1000000),
  per_user_limit integer not null default 1 check (per_user_limit between 1 and 100),
  first_purchase_only boolean not null default false,
  kinds text[] not null default '{course,program,internship}' check (kinds <@ array['course', 'program', 'internship'] and cardinality(kinds) >= 1),
  stackable_with_sale boolean not null default true,
  internal_note text check (internal_note is null or char_length(internal_note) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'percent' and percent_bps is not null and amount_minor is null) or (kind = 'fixed' and amount_minor is not null and percent_bps is null)),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create table public.academy_coupon_courses (
  coupon_id uuid not null references public.academy_coupons(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  primary key (coupon_id, course_id)
);
create table public.academy_coupon_categories (
  coupon_id uuid not null references public.academy_coupons(id) on delete cascade,
  category_id uuid not null references public.academy_categories(id) on delete cascade,
  primary key (coupon_id, category_id)
);
-- A coupon with rows here belongs to those people only.
create table public.academy_coupon_users (
  coupon_id uuid not null references public.academy_coupons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (coupon_id, user_id)
);

create or replace function public.academy_coupons_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.code := upper(btrim(new.code));
  new.created_by := coalesce(new.created_by, (select auth.uid()));
  return new;
end;
$$;
create trigger trg_academy_coupons_guard before insert or update on public.academy_coupons for each row execute function public.academy_coupons_guard();
create trigger trg_academy_coupons_updated before update on public.academy_coupons for each row execute function public.set_updated_at();
create trigger trg_academy_coupons_audit after insert or update or delete on public.academy_coupons for each row execute function public.academy_audit('coupon');

alter table public.academy_coupons enable row level security;
alter table public.academy_coupon_courses enable row level security;
alter table public.academy_coupon_categories enable row level security;
alter table public.academy_coupon_users enable row level security;
grant select, insert, update, delete on public.academy_coupons, public.academy_coupon_courses, public.academy_coupon_categories, public.academy_coupon_users to authenticated;
-- Coupons are private: only the people who run them can list them. Students check a code through academy_quote().
create policy academy_coupons_staff on public.academy_coupons for all to authenticated
  using (public.has_permission('academy.coupons.manage', null) or public.has_permission('academy.finance.view', null))
  with check (public.has_permission('academy.coupons.manage', null));
create policy academy_coupon_courses_staff on public.academy_coupon_courses for all to authenticated
  using (public.has_permission('academy.coupons.manage', null)) with check (public.has_permission('academy.coupons.manage', null));
create policy academy_coupon_categories_staff on public.academy_coupon_categories for all to authenticated
  using (public.has_permission('academy.coupons.manage', null)) with check (public.has_permission('academy.coupons.manage', null));
create policy academy_coupon_users_staff on public.academy_coupon_users for all to authenticated
  using (public.has_permission('academy.coupons.manage', null)) with check (public.has_permission('academy.coupons.manage', null));

-- ═══════════════ 2. Orders, payments, refunds ═══════════════
create sequence public.academy_order_seq;

create table public.academy_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  -- Kept for the receipt; removed when the account is erased (the order itself is a financial record and stays).
  buyer_name text,
  buyer_username text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded')),
  currency text not null default 'INR' check (currency = 'INR'),
  list_minor bigint not null check (list_minor >= 0),
  sale_discount_minor bigint not null default 0 check (sale_discount_minor >= 0),
  coupon_discount_minor bigint not null default 0 check (coupon_discount_minor >= 0),
  net_minor bigint not null check (net_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  tax_mode text not null default 'none' check (tax_mode in ('none', 'inclusive', 'exclusive')),
  tax_rate_bps integer not null default 0,
  coupon_id uuid references public.academy_coupons(id) on delete set null,
  coupon_code text,
  -- The full quote the student saw and accepted, plus their verification consent. Never rewritten.
  snapshot jsonb not null,
  provider text,
  provider_order_id text unique,
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) <= 80),
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (total_minor = net_minor + case when tax_mode = 'exclusive' then tax_minor else 0 end)
);
create index academy_orders_user_idx on public.academy_orders(user_id, created_at desc);
create index academy_orders_status_idx on public.academy_orders(status, created_at desc);
create index academy_orders_pending_idx on public.academy_orders(expires_at) where status = 'pending';

create or replace function public.academy_orders_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.order_no := 'AO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.academy_order_seq')::text, 6, '0');
  else
    -- The money on an order is fixed when it is created.
    if new.list_minor is distinct from old.list_minor or new.sale_discount_minor is distinct from old.sale_discount_minor
       or new.coupon_discount_minor is distinct from old.coupon_discount_minor or new.net_minor is distinct from old.net_minor
       or new.tax_minor is distinct from old.tax_minor or new.total_minor is distinct from old.total_minor
       or new.currency is distinct from old.currency or new.snapshot is distinct from old.snapshot
       or new.order_no is distinct from old.order_no or new.coupon_code is distinct from old.coupon_code then
      raise exception 'order_immutable' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_academy_orders_guard before insert or update on public.academy_orders for each row execute function public.academy_orders_guard();
create trigger trg_academy_orders_updated before update on public.academy_orders for each row execute function public.set_updated_at();

alter table public.academy_enrollments add constraint academy_enrollments_order_fk foreign key (order_id) references public.academy_orders(id) on delete set null;

create table public.academy_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.academy_orders(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete restrict,
  cohort_id uuid references public.academy_cohorts(id) on delete set null,
  price_rule_id uuid references public.academy_price_rules(id) on delete set null,
  course_code text not null,
  title text not null,
  kind text not null,
  unit_minor bigint not null check (unit_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0)
);
create index academy_order_items_order_idx on public.academy_order_items(order_id);
create index academy_order_items_course_idx on public.academy_order_items(course_id);
create index academy_order_items_rule_idx on public.academy_order_items(price_rule_id) where price_rule_id is not null;

create table public.academy_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.academy_orders(id) on delete restrict,
  provider text not null,
  provider_payment_id text not null unique,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'INR',
  refunded_minor bigint not null default 0 check (refunded_minor >= 0 and refunded_minor <= amount_minor),
  status text not null default 'succeeded' check (status in ('succeeded', 'partially_refunded', 'refunded')),
  method text check (method is null or char_length(method) <= 40),
  created_at timestamptz not null default now()
);
create index academy_payments_order_idx on public.academy_payments(order_id);

-- Append-only record of what the payment gateway told us and what we did about it. The (provider, event_key) pair makes every
-- webhook and every "I came back from the gateway" idempotent.
create table public.academy_payment_events (
  id bigint generated always as identity primary key,
  order_id uuid references public.academy_orders(id) on delete restrict,
  provider text not null,
  event_key text not null,
  type text not null check (char_length(type) <= 60),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, event_key)
);
create index academy_payment_events_order_idx on public.academy_payment_events(order_id, created_at);
create or replace function public.academy_append_only() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'append_only' using errcode = '42501'; end; $$;
create trigger trg_academy_payment_events_ro before update or delete on public.academy_payment_events for each row execute function public.academy_append_only();

create table public.academy_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.academy_orders(id) on delete restrict,
  payment_id uuid references public.academy_payments(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'requested' check (status in ('requested', 'approved', 'completed', 'rejected', 'failed')),
  initiated_by text not null check (initiated_by in ('student', 'staff', 'gateway')),
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  revoke_access boolean not null default true,
  provider_refund_id text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  completed_at timestamptz
);
create index academy_refunds_order_idx on public.academy_refunds(order_id);
create index academy_refunds_status_idx on public.academy_refunds(status, requested_at);
-- Only one refund may be open (requested or approved) for an order at a time.
create unique index academy_refunds_open_idx on public.academy_refunds(order_id) where status in ('requested', 'approved');

create table public.academy_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.academy_coupons(id) on delete cascade,
  order_id uuid not null unique references public.academy_orders(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  discount_minor bigint not null check (discount_minor >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'redeemed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index academy_coupon_redemptions_coupon_idx on public.academy_coupon_redemptions(coupon_id, status);
create index academy_coupon_redemptions_user_idx on public.academy_coupon_redemptions(coupon_id, user_id, status);
create trigger trg_academy_coupon_redemptions_updated before update on public.academy_coupon_redemptions for each row execute function public.set_updated_at();

alter table public.academy_orders enable row level security;
alter table public.academy_order_items enable row level security;
alter table public.academy_payments enable row level security;
alter table public.academy_payment_events enable row level security;
alter table public.academy_refunds enable row level security;
alter table public.academy_coupon_redemptions enable row level security;
grant select on public.academy_orders, public.academy_order_items, public.academy_payments, public.academy_refunds to authenticated;
grant select on public.academy_payment_events, public.academy_coupon_redemptions to authenticated;
-- A student sees their own orders, payments and refunds. Finance staff see all. Nobody can write through the API.
create policy academy_orders_read on public.academy_orders for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('academy.finance.view', null));
create policy academy_order_items_read on public.academy_order_items for select to authenticated
  using (exists (select 1 from public.academy_orders o where o.id = order_id));
create policy academy_payments_read on public.academy_payments for select to authenticated
  using (exists (select 1 from public.academy_orders o where o.id = order_id));
create policy academy_refunds_read on public.academy_refunds for select to authenticated
  using (exists (select 1 from public.academy_orders o where o.id = order_id));
create policy academy_payment_events_read on public.academy_payment_events for select to authenticated using (public.has_permission('academy.finance.view', null));
create policy academy_coupon_redemptions_read on public.academy_coupon_redemptions for select to authenticated
  using (public.has_permission('academy.coupons.manage', null) or public.has_permission('academy.finance.view', null));

-- ═══════════════ 3. The pricing engine ═══════════════
-- p_user may be null (a visitor looking at a price). p_lock takes a row lock on the coupon so two buyers cannot both use its
-- last redemption. p_preview lets staff quote a course that is not published yet; p_at lets them ask "what will it cost on
-- the 1st?".
create or replace function public._academy_quote(
  p_user uuid, p_course uuid, p_cohort uuid, p_coupon text,
  p_lock boolean default false, p_at timestamptz default null, p_preview boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := coalesce(p_at, now());
  v_c public.academy_courses%rowtype;
  v_coh public.academy_cohorts%rowtype;
  v_rule public.academy_price_rules%rowtype;
  v_cp public.academy_coupons%rowtype;
  v_code text := upper(btrim(coalesce(p_coupon, '')));
  v_list bigint;
  v_sale bigint := 0;
  v_after_sale bigint;
  v_disc bigint := 0;
  v_net bigint;
  v_tax bigint := 0;
  v_total bigint;
  v_mode text := coalesce(public._academy_setting('tax_mode') #>> '{}', 'none');
  v_rate integer := coalesce((public._academy_setting('tax_rate_bps') #>> '{}')::integer, 0);
  v_label text := coalesce(public._academy_setting('tax_label') #>> '{}', 'Tax');
  v_stack text := coalesce(public._academy_setting('coupon_with_sale') #>> '{}', 'allow');
  v_seats integer;
  v_cnt integer;
  v_err text;
  v_has_course_rows boolean;
  v_has_cat_rows boolean;
  v_own_pending uuid[] := '{}';
begin
  select * into v_c from public.academy_courses where id = p_course;
  if not found or (v_c.status <> 'published' and not p_preview) then return jsonb_build_object('ok', false, 'error', 'course_unavailable'); end if;
  if v_c.price_minor is null then return jsonb_build_object('ok', false, 'error', 'price_not_set'); end if;
  if v_c.ends_at is not null and v_c.ends_at < v_now and not p_preview then return jsonb_build_object('ok', false, 'error', 'enrollment_closed'); end if;
  if p_cohort is not null then
    select * into v_coh from public.academy_cohorts where id = p_cohort and course_id = p_course;
    if not found or (v_coh.status <> 'open' and not p_preview) then return jsonb_build_object('ok', false, 'error', 'cohort_unavailable'); end if;
  end if;
  if not p_preview then
    v_seats := public._academy_seats_left(p_course, p_cohort, p_user);
    if v_seats is not null and v_seats <= 0 then return jsonb_build_object('ok', false, 'error', 'sold_out'); end if;
  end if;

  -- 1. list price, 2. the lowest price among the rules valid at v_now
  v_list := v_c.price_minor;
  select r.* into v_rule from public.academy_price_rules r
   where r.course_id = p_course and r.active
     and (r.starts_at is null or r.starts_at <= v_now) and (r.ends_at is null or r.ends_at > v_now)
     and (r.cohort_id is null or r.cohort_id = p_cohort)
     and r.price_minor < v_list
     and (r.max_uses is null or (
           select count(*) from public.academy_order_items i join public.academy_orders o on o.id = i.order_id
            where i.price_rule_id = r.id and (o.status in ('paid', 'partially_refunded') or (o.status = 'pending' and o.expires_at > now()))) < r.max_uses)
   order by r.price_minor asc, (r.cohort_id is not null) desc, r.ends_at asc nulls last, r.id
   limit 1;
  if found then v_sale := v_list - v_rule.price_minor; end if;
  v_after_sale := v_list - v_sale;

  -- 3. the coupon. The student's own unpaid orders for this course are about to be replaced by the new attempt, so they do not
  -- count against the coupon's limits.
  if v_code <> '' then
    if p_user is null then return jsonb_build_object('ok', false, 'error', 'sign_in_required'); end if;
    select coalesce(array_agg(o.id), '{}') into v_own_pending from public.academy_orders o
     where o.user_id = p_user and o.status = 'pending' and exists (select 1 from public.academy_order_items i where i.order_id = o.id and i.course_id = p_course);
    if p_lock then
      select * into v_cp from public.academy_coupons where code = v_code for update;
    else
      select * into v_cp from public.academy_coupons where code = v_code;
    end if;
    -- An unknown, switched-off or someone-else's coupon all answer the same, so a code cannot be probed.
    if not found or not v_cp.active then return jsonb_build_object('ok', false, 'error', 'coupon_invalid'); end if;
    if exists (select 1 from public.academy_coupon_users u where u.coupon_id = v_cp.id)
       and not exists (select 1 from public.academy_coupon_users u where u.coupon_id = v_cp.id and u.user_id = p_user) then
      return jsonb_build_object('ok', false, 'error', 'coupon_invalid');
    end if;
    if v_cp.starts_at is not null and v_cp.starts_at > v_now then return jsonb_build_object('ok', false, 'error', 'coupon_not_started'); end if;
    if v_cp.expires_at is not null and v_cp.expires_at <= v_now then return jsonb_build_object('ok', false, 'error', 'coupon_expired'); end if;
    select exists (select 1 from public.academy_coupon_courses x where x.coupon_id = v_cp.id),
           exists (select 1 from public.academy_coupon_categories x where x.coupon_id = v_cp.id) into v_has_course_rows, v_has_cat_rows;
    if not (v_c.kind = any (v_cp.kinds)) then return jsonb_build_object('ok', false, 'error', 'coupon_not_eligible'); end if;
    if (v_has_course_rows or v_has_cat_rows) and not (
         exists (select 1 from public.academy_coupon_courses x where x.coupon_id = v_cp.id and x.course_id = p_course)
      or exists (select 1 from public.academy_coupon_categories x where x.coupon_id = v_cp.id and x.category_id = v_c.category_id)) then
      return jsonb_build_object('ok', false, 'error', 'coupon_not_eligible');
    end if;
    if v_after_sale = 0 then return jsonb_build_object('ok', false, 'error', 'coupon_not_needed'); end if;
    if v_sale > 0 and (v_stack = 'block' or not v_cp.stackable_with_sale) then return jsonb_build_object('ok', false, 'error', 'coupon_no_stack'); end if;
    if v_after_sale < v_cp.min_purchase_minor then return jsonb_build_object('ok', false, 'error', 'coupon_min_spend'); end if;
    if v_cp.usage_limit is not null then
      select count(*) into v_cnt from public.academy_coupon_redemptions where coupon_id = v_cp.id and status in ('reserved', 'redeemed') and not (order_id = any (v_own_pending));
      if v_cnt >= v_cp.usage_limit then return jsonb_build_object('ok', false, 'error', 'coupon_exhausted'); end if;
    end if;
    select count(*) into v_cnt from public.academy_coupon_redemptions where coupon_id = v_cp.id and user_id = p_user and status in ('reserved', 'redeemed') and not (order_id = any (v_own_pending));
    if v_cnt >= v_cp.per_user_limit then return jsonb_build_object('ok', false, 'error', 'coupon_user_limit'); end if;
    if v_cp.first_purchase_only and exists (
      select 1 from public.academy_orders o where o.user_id = p_user and o.total_minor > 0 and o.status in ('paid', 'refunded', 'partially_refunded')) then
      return jsonb_build_object('ok', false, 'error', 'coupon_first_purchase');
    end if;

    if v_cp.kind = 'percent' then
      v_disc := (v_after_sale * v_cp.percent_bps + 5000) / 10000;            -- round half up, integers only
      if v_cp.max_discount_minor is not null then v_disc := least(v_disc, v_cp.max_discount_minor); end if;
    else
      v_disc := v_cp.amount_minor;
    end if;
    v_disc := least(v_disc, v_after_sale);
  end if;

  -- 4. tax on what is left, 5. the total
  v_net := v_after_sale - v_disc;
  if v_mode = 'exclusive' and v_rate > 0 and v_net > 0 then
    v_tax := (v_net * v_rate + 5000) / 10000;
    v_total := v_net + v_tax;
  elsif v_mode = 'inclusive' and v_rate > 0 and v_net > 0 then
    v_tax := (v_net * v_rate + (10000 + v_rate) / 2) / (10000 + v_rate);      -- the part of the price that is tax
    v_total := v_net;
  else
    v_mode := case when v_mode = 'none' then 'none' else v_mode end;
    v_total := v_net;
  end if;

  return jsonb_build_object(
    'ok', true,
    'course', jsonb_build_object('id', v_c.id, 'code', v_c.code, 'title', v_c.title, 'slug', v_c.slug, 'kind', v_c.kind, 'category_id', v_c.category_id),
    'cohort', case when v_coh.id is not null then jsonb_build_object('id', v_coh.id, 'name', v_coh.name) end,
    'currency', v_c.currency,
    'list_minor', v_list,
    'sale', case when v_rule.id is not null then jsonb_build_object('rule_id', v_rule.id, 'label', v_rule.label, 'kind', v_rule.kind, 'price_minor', v_rule.price_minor, 'discount_minor', v_sale, 'ends_at', v_rule.ends_at) end,
    'after_sale_minor', v_after_sale,
    'coupon', case when v_cp.id is not null then jsonb_build_object('id', v_cp.id, 'code', v_cp.code, 'kind', v_cp.kind, 'percent_bps', v_cp.percent_bps, 'amount_minor', v_cp.amount_minor, 'discount_minor', v_disc) end,
    'net_minor', v_net,
    'tax', jsonb_build_object('mode', v_mode, 'rate_bps', case when v_mode = 'none' then 0 else v_rate end, 'label', v_label, 'minor', v_tax, 'included', v_mode = 'inclusive'),
    'total_minor', v_total,
    'free', v_total = 0,
    'seats_left', case when p_preview then null else v_seats end,
    'quoted_at', v_now);
end;
$$;
revoke execute on function public._academy_quote(uuid, uuid, uuid, text, boolean, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public._academy_quote(uuid, uuid, uuid, text, boolean, timestamptz, boolean) to service_role;

-- What a student (or a visitor, with no coupon) would pay.
create or replace function public.academy_quote(p_course uuid, p_cohort uuid default null, p_coupon text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public._academy_quote((select auth.uid()), p_course, p_cohort, p_coupon, false, null, false);
$$;
grant execute on function public.academy_quote(uuid, uuid, text) to anon, authenticated, service_role;

-- Prices for a page full of courses (catalogue, home, pricing): the same engine, no coupon, for visitors too.
create or replace function public.academy_catalog_prices(p_courses uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb := '{}'::jsonb; v_id uuid; v_q jsonb;
begin
  foreach v_id in array coalesce(p_courses[1:60], '{}') loop
    v_q := public._academy_quote(null, v_id, null, null, false, null, false);
    if (v_q ->> 'ok')::boolean then
      v_out := v_out || jsonb_build_object(v_id::text, jsonb_build_object(
        'list_minor', v_q -> 'list_minor', 'after_sale_minor', v_q -> 'after_sale_minor', 'total_minor', v_q -> 'total_minor',
        'sale', v_q -> 'sale', 'tax', v_q -> 'tax', 'free', v_q -> 'free', 'seats_left', v_q -> 'seats_left'));
    elsif v_q ->> 'error' = 'sold_out' then
      v_out := v_out || jsonb_build_object(v_id::text, jsonb_build_object('sold_out', true));
    end if;
  end loop;
  return v_out;
end;
$$;
grant execute on function public.academy_catalog_prices(uuid[]) to anon, authenticated, service_role;

-- The administrators' pricing preview: any course, any date, any coupon, optionally as a particular student. Creates nothing.
create or replace function public.academy_admin_quote(p_course uuid, p_cohort uuid, p_coupon text, p_user uuid default null, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not (public.has_permission('academy.pricing.manage', null) or public.has_permission('academy.coupons.manage', null) or public.has_permission('academy.finance.view', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public._academy_quote(coalesce(p_user, (select auth.uid())), p_course, p_cohort, p_coupon, false, p_at, true);
end;
$$;
grant execute on function public.academy_admin_quote(uuid, uuid, text, uuid, timestamptz) to authenticated;

-- ═══════════════ 4. Checkout ═══════════════
-- Creates the order (or, for a free course, just the enrolment). Returns { ok, ... } or { ok:false, error }.
-- The price comes from _academy_quote inside this transaction, with the coupon row locked.
create or replace function public.academy_create_order(p_course uuid, p_cohort uuid, p_coupon text, p_consent boolean, p_idem text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_prof public.profiles%rowtype;
  v_q jsonb;
  v_order public.academy_orders%rowtype;
  v_id uuid;
  v_hold integer := coalesce((public._academy_setting('order_hold_minutes') #>> '{}')::integer, 60);
  v_total bigint;
  v_item public.academy_courses%rowtype;
  v_enr jsonb;
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_prof from public.profiles where id = v_user and status in ('active', 'restricted');
  if not found then return jsonb_build_object('ok', false, 'error', 'account_unavailable'); end if;

  if p_idem is not null then
    select * into v_order from public.academy_orders where user_id = v_user and idempotency_key = p_idem;
    if found then
      return jsonb_build_object('ok', true, 'existing', true, 'order_id', v_order.id, 'order_no', v_order.order_no, 'status', v_order.status, 'total_minor', v_order.total_minor);
    end if;
  end if;

  -- Serialise one student's checkouts so a double click cannot make two orders.
  perform pg_advisory_xact_lock(hashtextextended('academy-order:' || v_user::text, 0));

  if exists (select 1 from public.academy_enrollments e where e.user_id = v_user and e.course_id = p_course and e.status in ('active', 'completed', 'suspended')) then
    return jsonb_build_object('ok', false, 'error', 'already_enrolled');
  end if;
  if not coalesce(p_consent, false) then return jsonb_build_object('ok', false, 'error', 'consent_required'); end if;

  v_q := public._academy_quote(v_user, p_course, p_cohort, p_coupon, true, null, false);
  if not (v_q ->> 'ok')::boolean then return v_q; end if;
  v_total := (v_q ->> 'total_minor')::bigint;
  select * into v_item from public.academy_courses where id = p_course;

  -- A free course (no coupon needed): enrol, no order.
  if v_total = 0 and jsonb_typeof(v_q -> 'coupon') is distinct from 'object' then
    v_enr := public._academy_enroll(v_user, p_course, p_cohort, 'free', null, null, null, true);
    return jsonb_build_object('ok', true, 'enrolled', true, 'free', true, 'enrollment_id', v_enr ->> 'enrollment_id');
  end if;
  if v_total > 0 and coalesce(public._academy_setting('sales_enabled') = 'true'::jsonb, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'sales_closed');
  end if;

  -- A new attempt replaces the student's earlier unpaid orders for this course.
  update public.academy_coupon_redemptions r set status = 'released'
   where r.status = 'reserved' and r.user_id = v_user and r.order_id in (
     select o.id from public.academy_orders o join public.academy_order_items i on i.order_id = o.id
      where o.user_id = v_user and o.status = 'pending' and i.course_id = p_course);
  update public.academy_orders o set status = 'cancelled'
   where o.user_id = v_user and o.status = 'pending' and exists (select 1 from public.academy_order_items i where i.order_id = o.id and i.course_id = p_course);

  insert into public.academy_orders(user_id, buyer_name, buyer_username, status, currency, list_minor, sale_discount_minor, coupon_discount_minor, net_minor,
                                    tax_minor, total_minor, tax_mode, tax_rate_bps, coupon_id, coupon_code, snapshot, idempotency_key, expires_at, paid_at)
  values (v_user, v_prof.full_name, v_prof.username, case when v_total = 0 then 'paid' else 'pending' end, v_q ->> 'currency',
          (v_q ->> 'list_minor')::bigint, coalesce((v_q -> 'sale' ->> 'discount_minor')::bigint, 0), coalesce((v_q -> 'coupon' ->> 'discount_minor')::bigint, 0),
          (v_q ->> 'net_minor')::bigint, (v_q -> 'tax' ->> 'minor')::bigint, v_total, v_q -> 'tax' ->> 'mode', (v_q -> 'tax' ->> 'rate_bps')::integer,
          (v_q -> 'coupon' ->> 'id')::uuid, v_q -> 'coupon' ->> 'code',
          v_q || jsonb_build_object('consent', true), p_idem,
          case when v_total = 0 then null else now() + make_interval(mins => v_hold) end,
          case when v_total = 0 then now() end)
  returning id into v_id;

  insert into public.academy_order_items(order_id, course_id, cohort_id, price_rule_id, course_code, title, kind, unit_minor, discount_minor, tax_minor, total_minor)
  values (v_id, p_course, p_cohort, (v_q -> 'sale' ->> 'rule_id')::uuid, v_item.code, v_item.title, v_item.kind, (v_q ->> 'list_minor')::bigint,
          coalesce((v_q -> 'sale' ->> 'discount_minor')::bigint, 0) + coalesce((v_q -> 'coupon' ->> 'discount_minor')::bigint, 0),
          (v_q -> 'tax' ->> 'minor')::bigint, v_total);

  if jsonb_typeof(v_q -> 'coupon') = 'object' then
    insert into public.academy_coupon_redemptions(coupon_id, order_id, user_id, discount_minor, status)
    values ((v_q -> 'coupon' ->> 'id')::uuid, v_id, v_user, (v_q -> 'coupon' ->> 'discount_minor')::bigint, case when v_total = 0 then 'redeemed' else 'reserved' end);
  end if;

  if v_total = 0 then
    -- A coupon made it free: no payment, enrol now.
    v_enr := public._academy_enroll(v_user, p_course, p_cohort, 'free', v_id, null, null, true);
    select * into v_order from public.academy_orders where id = v_id;
    return jsonb_build_object('ok', true, 'enrolled', true, 'free', true, 'order_id', v_id, 'order_no', v_order.order_no, 'enrollment_id', v_enr ->> 'enrollment_id');
  end if;

  select * into v_order from public.academy_orders where id = v_id;
  return jsonb_build_object('ok', true, 'order_id', v_id, 'order_no', v_order.order_no, 'status', 'pending', 'total_minor', v_total, 'currency', v_order.currency);
end;
$$;
grant execute on function public.academy_create_order(uuid, uuid, text, boolean, text) to authenticated;

-- Server only: remember which gateway order belongs to ours.
create or replace function public.academy_attach_provider_order(p_order uuid, p_provider text, p_provider_order text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.academy_orders set provider = p_provider, provider_order_id = p_provider_order where id = p_order and status = 'pending' and provider_order_id is null;
  if not found then raise exception 'invalid_state' using errcode = '22023'; end if;
end;
$$;
revoke execute on function public.academy_attach_provider_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.academy_attach_provider_order(uuid, text, text) to service_role;

-- Cancel an unpaid order (the gateway refused to start it, or the student gave up) and give the coupon back.
create or replace function public.academy_cancel_order(p_order uuid, p_user uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_caller uuid := coalesce(p_user, (select auth.uid()));
begin
  update public.academy_orders set status = 'cancelled' where id = p_order and status = 'pending' and (v_caller is null or user_id = v_caller);
  if found then update public.academy_coupon_redemptions set status = 'released' where order_id = p_order and status = 'reserved'; end if;
end;
$$;
grant execute on function public.academy_cancel_order(uuid, uuid) to authenticated, service_role;

-- Unpaid orders past their hold expire and give their coupon back. (A payment that still arrives later is honoured: see fulfil.)
create or replace function public.academy_expire_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  with e as (update public.academy_orders set status = 'expired' where status = 'pending' and expires_at < now() returning id)
  update public.academy_coupon_redemptions r set status = 'released' from e where r.order_id = e.id and r.status = 'reserved';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.academy_expire_orders() from public, anon, authenticated;
grant execute on function public.academy_expire_orders() to service_role;

-- ═══════════════ 5. Settling a payment ═══════════════
-- The server calls this only after the gateway has itself confirmed the payment (never on the browser's word). Idempotent:
-- the same payment can arrive from the webhook and from the student coming back, in any order, any number of times.
create or replace function public.academy_fulfil_order(
  p_provider text, p_provider_order text, p_provider_payment text, p_amount bigint, p_currency text, p_method text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o public.academy_orders%rowtype;
  v_item public.academy_order_items%rowtype;
  v_pay uuid;
  v_enr jsonb;
  v_dup boolean := false;
  v_new_event integer;
begin
  select * into v_o from public.academy_orders where provider = p_provider and provider_order_id = p_provider_order for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_order'); end if;

  insert into public.academy_payment_events(order_id, provider, event_key, type, detail)
  values (v_o.id, p_provider, 'paid:' || p_provider_payment, 'payment.paid',
          jsonb_build_object('payment', p_provider_payment, 'amount_minor', p_amount, 'currency', p_currency, 'method', p_method))
  on conflict (provider, event_key) do nothing;
  get diagnostics v_new_event = row_count;

  if v_o.status in ('paid', 'partially_refunded', 'refunded') then
    return jsonb_build_object('ok', true, 'already', true, 'order_id', v_o.id);
  end if;

  -- The amount and currency the gateway reports must be exactly what we asked it to charge.
  if p_amount is distinct from v_o.total_minor or upper(coalesce(p_currency, '')) is distinct from v_o.currency then
    insert into public.academy_payment_events(order_id, provider, event_key, type, detail)
    values (v_o.id, p_provider, 'mismatch:' || p_provider_payment, 'payment.mismatch',
            jsonb_build_object('payment', p_provider_payment, 'expected', v_o.total_minor, 'got', p_amount, 'currency', p_currency))
    on conflict (provider, event_key) do nothing;
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch', 'order_id', v_o.id);
  end if;

  insert into public.academy_payments(order_id, provider, provider_payment_id, amount_minor, currency, method)
  values (v_o.id, p_provider, p_provider_payment, p_amount, v_o.currency, left(p_method, 40))
  on conflict (provider_payment_id) do nothing
  returning id into v_pay;

  update public.academy_orders set status = 'paid', paid_at = now() where id = v_o.id;
  update public.academy_coupon_redemptions set status = 'redeemed' where order_id = v_o.id;

  select * into v_item from public.academy_order_items where order_id = v_o.id limit 1;
  if exists (select 1 from public.academy_enrollments e where e.user_id = v_o.user_id and e.course_id = v_item.course_id and e.status in ('active', 'completed', 'suspended')) then
    -- They already hold this course (bought twice, or enrolled by an administrator in between): keep one enrolment, return the money.
    v_dup := true;
    insert into public.academy_payment_events(order_id, provider, event_key, type, detail)
    values (v_o.id, p_provider, 'duplicate:' || p_provider_payment, 'payment.duplicate', jsonb_build_object('payment', p_provider_payment))
    on conflict (provider, event_key) do nothing;
  elsif v_o.user_id is not null then
    v_enr := public._academy_enroll(v_o.user_id, v_item.course_id, v_item.cohort_id, 'paid', v_o.id, null, null, coalesce((v_o.snapshot ->> 'consent')::boolean, false));
  end if;

  if v_o.user_id is not null then
    perform public.notify(v_o.user_id, 'academy_payment', null, 'academy_order', v_o.id,
      jsonb_build_object('event', 'received', 'order_no', v_o.order_no, 'title', v_item.title, 'course_id', v_item.course_id, 'amount_minor', v_o.total_minor),
      'acad-pay:' || v_o.id::text);
  end if;
  perform public.write_audit_log(null, 'academy.order.paid', 'academy_order', v_o.id::text, null, jsonb_build_object('order_no', v_o.order_no, 'amount_minor', p_amount, 'duplicate', v_dup));
  return jsonb_build_object('ok', true, 'order_id', v_o.id, 'duplicate', v_dup, 'payment_id', coalesce(v_pay, (select id from public.academy_payments where provider_payment_id = p_provider_payment)),
                            'enrollment_id', v_enr ->> 'enrollment_id');
end;
$$;
revoke execute on function public.academy_fulfil_order(text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.academy_fulfil_order(text, text, text, bigint, text, text) to service_role;

-- The gateway says the attempt failed. The order can still be paid on a retry.
create or replace function public.academy_fail_order(p_provider text, p_provider_order text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_o public.academy_orders%rowtype; v_title text; v_new integer;
begin
  select * into v_o from public.academy_orders where provider = p_provider and provider_order_id = p_provider_order for update;
  if not found or v_o.status not in ('pending') then return; end if;
  insert into public.academy_payment_events(order_id, provider, event_key, type, detail)
  values (v_o.id, p_provider, 'failed:' || p_provider_order || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI'), 'payment.failed', jsonb_build_object('reason', left(p_reason, 120)))
  on conflict (provider, event_key) do nothing;
  update public.academy_orders set status = 'failed' where id = v_o.id;
  update public.academy_coupon_redemptions set status = 'released' where order_id = v_o.id and status = 'reserved';
  select title into v_title from public.academy_order_items where order_id = v_o.id limit 1;
  if v_o.user_id is not null then
    perform public.notify(v_o.user_id, 'academy_payment', null, 'academy_order', v_o.id,
      jsonb_build_object('event', 'failed', 'order_no', v_o.order_no, 'title', v_title), 'acad-payfail:' || v_o.id::text);
  end if;
end;
$$;
revoke execute on function public.academy_fail_order(text, text, text) from public, anon, authenticated;
grant execute on function public.academy_fail_order(text, text, text) to service_role;

-- ═══════════════ 6. Refunds ═══════════════
-- A refund has two steps that must not be confused: a decision (here) and the money actually moving (the gateway). An order is
-- only marked refunded after the gateway says so (academy_complete_refund, called by the server with the service role).
create or replace function public._academy_refundable(p_order uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(p.amount_minor - p.refunded_minor), 0) from public.academy_payments p where p.order_id = p_order and p.status <> 'refunded';
$$;
revoke execute on function public._academy_refundable(uuid) from public, anon, authenticated;
grant execute on function public._academy_refundable(uuid) to service_role;

create or replace function public.academy_request_refund(p_order uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_o public.academy_orders%rowtype;
  v_course public.academy_courses%rowtype;
  v_days integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_pay uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_o from public.academy_orders where id = p_order and user_id = v_user for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_o.status <> 'paid' or v_o.total_minor = 0 then raise exception 'not_refundable' using errcode = '22023'; end if;
  select c.* into v_course from public.academy_courses c join public.academy_order_items i on i.course_id = c.id where i.order_id = p_order limit 1;
  v_days := coalesce(v_course.refund_days, (public._academy_setting('refund_window_days') #>> '{}')::integer, 7);
  if v_o.paid_at + make_interval(days => v_days) < now() then raise exception 'refund_window_closed' using errcode = '22023'; end if;
  select id into v_pay from public.academy_payments where order_id = p_order order by created_at limit 1;
  insert into public.academy_refunds(order_id, payment_id, amount_minor, reason, status, initiated_by, requested_by)
  values (p_order, v_pay, v_o.total_minor, left(v_reason, 500), 'requested', 'student', v_user) returning id into v_id;
  perform public.write_audit_log(v_user, 'academy.refund.requested', 'academy_refund', v_id::text, null, jsonb_build_object('order_no', v_o.order_no));
  return v_id;
end;
$$;
grant execute on function public.academy_request_refund(uuid, text) to authenticated;

-- Staff decide a student's request.
create or replace function public.academy_review_refund(p_refund uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_r public.academy_refunds%rowtype;
  v_o public.academy_orders%rowtype;
begin
  if not public.has_permission('academy.refunds.process', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_r from public.academy_refunds where id = p_refund for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_r.status <> 'requested' then raise exception 'invalid_state' using errcode = '22023'; end if;
  if v_r.requested_by = v_actor then raise exception 'cannot_review_own_request' using errcode = '42501'; end if;
  if not p_approve and (p_note is null or char_length(btrim(p_note)) < 3) then raise exception 'note_required' using errcode = '22023'; end if;
  update public.academy_refunds set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = v_actor, reviewed_at = now(), review_note = left(btrim(p_note), 500)
   where id = p_refund;
  select * into v_o from public.academy_orders where id = v_r.order_id;
  perform public.write_audit_log(v_actor, case when p_approve then 'academy.refund.approved' else 'academy.refund.rejected' end, 'academy_refund', p_refund::text, null,
    jsonb_build_object('order_no', v_o.order_no, 'amount_minor', v_r.amount_minor));
  if not p_approve and v_o.user_id is not null then
    perform public.notify(v_o.user_id, 'academy_refund', null, 'academy_order', v_o.id, jsonb_build_object('status', 'rejected', 'order_no', v_o.order_no), 'acad-refund-rej:' || p_refund::text);
  end if;
end;
$$;
grant execute on function public.academy_review_refund(uuid, boolean, text) to authenticated;

-- Staff start a refund themselves (full or part), already approved.
create or replace function public.academy_staff_refund(p_order uuid, p_amount bigint, p_reason text, p_revoke_access boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_o public.academy_orders%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_pay uuid;
  v_id uuid;
begin
  if not public.has_permission('academy.refunds.process', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_o from public.academy_orders where id = p_order for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_o.status not in ('paid', 'partially_refunded') then raise exception 'not_refundable' using errcode = '22023'; end if;
  if p_amount is null or p_amount < 1 or p_amount > public._academy_refundable(p_order) then raise exception 'invalid_amount' using errcode = '22023'; end if;
  select id into v_pay from public.academy_payments where order_id = p_order and status <> 'refunded' order by created_at limit 1;
  insert into public.academy_refunds(order_id, payment_id, amount_minor, reason, status, initiated_by, requested_by, reviewed_by, reviewed_at, revoke_access)
  values (p_order, v_pay, p_amount, left(v_reason, 500), 'approved', 'staff', v_actor, v_actor, now(), coalesce(p_revoke_access, true)) returning id into v_id;
  perform public.write_audit_log(v_actor, 'academy.refund.initiated', 'academy_refund', v_id::text, null, jsonb_build_object('order_no', v_o.order_no, 'amount_minor', p_amount));
  return v_id;
end;
$$;
grant execute on function public.academy_staff_refund(uuid, bigint, text, boolean) to authenticated;

-- What the server needs to ask the gateway for an approved refund. Permission is checked here.
create or replace function public.academy_refund_target(p_refund uuid)
returns table (refund_id uuid, order_id uuid, provider_payment_id text, amount_minor bigint, reason text, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('academy.refunds.process', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select r.id, r.order_id, p.provider_payment_id, r.amount_minor, r.reason, r.status
    from public.academy_refunds r join public.academy_payments p on p.id = r.payment_id where r.id = p_refund;
end;
$$;
grant execute on function public.academy_refund_target(uuid) to authenticated;

-- Server only, after the gateway accepted the refund (or told us it happened).
create or replace function public.academy_complete_refund(p_refund uuid, p_provider_refund text, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_r public.academy_refunds%rowtype;
  v_o public.academy_orders%rowtype;
  v_p public.academy_payments%rowtype;
  v_left bigint;
  v_title text;
  v_course uuid;
begin
  select * into v_r from public.academy_refunds where id = p_refund for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_r.status = 'completed' then return jsonb_build_object('ok', true, 'already', true); end if;
  select * into v_o from public.academy_orders where id = v_r.order_id for update;
  select * into v_p from public.academy_payments where id = v_r.payment_id for update;

  update public.academy_refunds set status = 'completed', completed_at = now(), provider_refund_id = left(p_provider_refund, 120),
         reviewed_by = coalesce(reviewed_by, p_actor), reviewed_at = coalesce(reviewed_at, now())
   where id = p_refund;
  update public.academy_payments set refunded_minor = least(refunded_minor + v_r.amount_minor, amount_minor),
         status = case when refunded_minor + v_r.amount_minor >= amount_minor then 'refunded' else 'partially_refunded' end
   where id = v_p.id;
  select coalesce(sum(amount_minor - refunded_minor), 0) into v_left from public.academy_payments where order_id = v_o.id;
  update public.academy_orders set status = case when v_left = 0 then 'refunded' else 'partially_refunded' end where id = v_o.id;
  insert into public.academy_payment_events(order_id, provider, event_key, type, detail)
  values (v_o.id, v_p.provider, 'refund:' || p_refund::text, 'refund.completed', jsonb_build_object('refund', p_refund, 'amount_minor', v_r.amount_minor))
  on conflict (provider, event_key) do nothing;

  select i.title, i.course_id into v_title, v_course from public.academy_order_items i where i.order_id = v_o.id limit 1;
  -- Access ends with a full refund unless staff chose otherwise. A certificate already issued is left for a person to decide.
  if v_left = 0 and v_r.revoke_access and v_course is not null then
    update public.academy_enrollments set status = 'refunded', ended_at = now(), end_reason = 'Refunded'
     where order_id = v_o.id and course_id = v_course and status in ('active', 'completed', 'suspended');
  end if;
  if v_o.user_id is not null then
    perform public.notify(v_o.user_id, 'academy_refund', null, 'academy_order', v_o.id,
      jsonb_build_object('status', 'completed', 'order_no', v_o.order_no, 'title', v_title, 'amount_minor', v_r.amount_minor), 'acad-refund:' || p_refund::text);
  end if;
  perform public.write_audit_log(p_actor, 'academy.refund.completed', 'academy_refund', p_refund::text, null, jsonb_build_object('order_no', v_o.order_no, 'amount_minor', v_r.amount_minor));
  return jsonb_build_object('ok', true, 'order_id', v_o.id);
end;
$$;
revoke execute on function public.academy_complete_refund(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.academy_complete_refund(uuid, text, uuid) to service_role;

create or replace function public.academy_fail_refund(p_refund uuid, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.academy_refunds set status = 'failed', review_note = left(coalesce(review_note || E'\n', '') || 'Gateway: ' || coalesce(p_error, 'refused'), 500)
   where id = p_refund and status = 'approved';
end;
$$;
revoke execute on function public.academy_fail_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.academy_fail_refund(uuid, text) to service_role;

-- The gateway's own dashboard (or its webhook) says a payment was refunded. If we asked for it, finish that refund;
-- otherwise record it as a gateway-initiated refund of whatever was left.
create or replace function public.academy_record_gateway_refund(p_provider text, p_provider_payment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_p public.academy_payments%rowtype; v_r uuid; v_left bigint;
begin
  select * into v_p from public.academy_payments where provider = p_provider and provider_payment_id = p_provider_payment;
  if not found then return jsonb_build_object('ok', true, 'ignored', true); end if;
  select id into v_r from public.academy_refunds where payment_id = v_p.id and status = 'approved' order by requested_at limit 1;
  if v_r is null then
    v_left := v_p.amount_minor - v_p.refunded_minor;
    if v_left <= 0 then return jsonb_build_object('ok', true, 'already', true); end if;
    insert into public.academy_refunds(order_id, payment_id, amount_minor, reason, status, initiated_by, revoke_access)
    values (v_p.order_id, v_p.id, v_left, 'Refunded in the payment gateway''s dashboard', 'approved', 'gateway', true) returning id into v_r;
  end if;
  return public.academy_complete_refund(v_r, null, null);
end;
$$;
revoke execute on function public.academy_record_gateway_refund(text, text) from public, anon, authenticated;
grant execute on function public.academy_record_gateway_refund(text, text) to service_role;

-- ═══════════════ 7. Finance staff: finding orders ═══════════════
-- One search for orders, payments and refunds: by order number, student name or username, email, course code or title,
-- or a gateway reference. Permission academy.finance.view.
create or replace function public.academy_admin_orders(
  p_search text default null, p_status text default null, p_course uuid default null,
  p_from timestamptz default null, p_to timestamptz default null, p_min bigint default null, p_max bigint default null,
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, order_no text, user_id uuid, buyer_name text, buyer_username text, buyer_email text, status text, currency text,
  list_minor bigint, sale_discount_minor bigint, coupon_discount_minor bigint, net_minor bigint, tax_minor bigint, total_minor bigint,
  tax_mode text, tax_rate_bps integer, coupon_code text, course_id uuid, course_code text, course_title text,
  provider text, provider_order_id text, provider_payment_id text, paid_at timestamptz, created_at timestamptz,
  refunded_minor bigint, refund_status text, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.has_permission('academy.finance.view', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select o.id, o.order_no, o.user_id, o.buyer_name, o.buyer_username, u.email::text, o.status, o.currency,
         o.list_minor, o.sale_discount_minor, o.coupon_discount_minor, o.net_minor, o.tax_minor, o.total_minor, o.tax_mode, o.tax_rate_bps, o.coupon_code,
         i.course_id, i.course_code, i.title, o.provider, o.provider_order_id, pay.provider_payment_id, o.paid_at, o.created_at,
         coalesce(pay.refunded_minor, 0)::bigint, (select r.status from public.academy_refunds r where r.order_id = o.id order by r.requested_at desc limit 1),
         count(*) over ()
  from public.academy_orders o
  left join auth.users u on u.id = o.user_id
  left join lateral (select * from public.academy_order_items x where x.order_id = o.id limit 1) i on true
  left join lateral (select p.provider_payment_id, sum(p.refunded_minor) as refunded_minor from public.academy_payments p where p.order_id = o.id group by p.provider_payment_id limit 1) pay on true
  where (p_status is null or o.status = p_status)
    and (p_course is null or i.course_id = p_course)
    and (p_from is null or o.created_at >= p_from) and (p_to is null or o.created_at < p_to)
    and (p_min is null or o.total_minor >= p_min) and (p_max is null or o.total_minor <= p_max)
    and (v_q is null or o.order_no ilike '%' || v_q || '%' or o.buyer_name ilike '%' || v_q || '%' or o.buyer_username ilike '%' || v_q || '%'
         or u.email ilike '%' || v_q || '%' or i.course_code ilike '%' || v_q || '%' or i.title ilike '%' || v_q || '%'
         or o.provider_order_id = v_q or pay.provider_payment_id = v_q)
  order by o.created_at desc
  limit least(greatest(p_limit, 1), 5000) offset greatest(p_offset, 0);
end;
$$;
grant execute on function public.academy_admin_orders(text, text, uuid, timestamptz, timestamptz, bigint, bigint, integer, integer) to authenticated;

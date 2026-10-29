-- UniSphere Academy, phase 4: offers that apply by themselves.
--
-- A scheduled price (academy_price_rules) already applies on its own between its dates. This adds the second kind: an AUTOMATIC
-- COUPON. It has no code to type; the pricing engine finds the best one the signed-in student is eligible for and applies it, using
-- exactly the same checks as a typed code (dates, courses, first purchase, per-person and total limits, minimum spend, stacking).
-- A code the student types always wins over the automatic offer; the two are never added together.
--
-- Honesty is built in: the figures shown (time left, places left at a price) come from the real end date and the real count of
-- orders, never from a number somebody typed in.

alter table public.academy_coupons
  add column auto_apply boolean not null default false,
  -- What the student sees ("Welcome offer", "Early supporter"). Required for an automatic coupon, because it is shown without a code.
  add column public_label text check (public_label is null or char_length(public_label) between 2 and 60),
  add constraint academy_coupons_auto_label check (not auto_apply or public_label is not null);
create index academy_coupons_auto_idx on public.academy_coupons(created_at) where auto_apply and active;

-- ── The checks every coupon goes through, in one place ─────────────────────
-- Returns {"ok":true,"discount":n} or {"ok":false,"error":"..."}. Pure: it reads, it never writes or locks.
create or replace function public._academy_coupon_eval(
  p_cp public.academy_coupons, p_user uuid, p_course public.academy_courses, p_after_sale bigint, p_sale bigint,
  p_stack text, p_now timestamptz, p_own_pending uuid[]
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cnt integer;
  v_has_course_rows boolean;
  v_has_cat_rows boolean;
  v_disc bigint;
begin
  if not p_cp.active then return jsonb_build_object('ok', false, 'error', 'coupon_invalid'); end if;
  if exists (select 1 from public.academy_coupon_users u where u.coupon_id = p_cp.id)
     and not exists (select 1 from public.academy_coupon_users u where u.coupon_id = p_cp.id and u.user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'coupon_invalid');
  end if;
  if p_cp.starts_at is not null and p_cp.starts_at > p_now then return jsonb_build_object('ok', false, 'error', 'coupon_not_started'); end if;
  if p_cp.expires_at is not null and p_cp.expires_at <= p_now then return jsonb_build_object('ok', false, 'error', 'coupon_expired'); end if;
  select exists (select 1 from public.academy_coupon_courses x where x.coupon_id = p_cp.id),
         exists (select 1 from public.academy_coupon_categories x where x.coupon_id = p_cp.id) into v_has_course_rows, v_has_cat_rows;
  if not (p_course.kind = any (p_cp.kinds)) then return jsonb_build_object('ok', false, 'error', 'coupon_not_eligible'); end if;
  if (v_has_course_rows or v_has_cat_rows) and not (
       exists (select 1 from public.academy_coupon_courses x where x.coupon_id = p_cp.id and x.course_id = p_course.id)
    or exists (select 1 from public.academy_coupon_categories x where x.coupon_id = p_cp.id and x.category_id = p_course.category_id)) then
    return jsonb_build_object('ok', false, 'error', 'coupon_not_eligible');
  end if;
  if p_after_sale = 0 then return jsonb_build_object('ok', false, 'error', 'coupon_not_needed'); end if;
  if p_sale > 0 and (p_stack = 'block' or not p_cp.stackable_with_sale) then return jsonb_build_object('ok', false, 'error', 'coupon_no_stack'); end if;
  if p_after_sale < p_cp.min_purchase_minor then return jsonb_build_object('ok', false, 'error', 'coupon_min_spend'); end if;
  if p_cp.usage_limit is not null then
    select count(*) into v_cnt from public.academy_coupon_redemptions where coupon_id = p_cp.id and status in ('reserved', 'redeemed') and not (order_id = any (p_own_pending));
    if v_cnt >= p_cp.usage_limit then return jsonb_build_object('ok', false, 'error', 'coupon_exhausted'); end if;
  end if;
  select count(*) into v_cnt from public.academy_coupon_redemptions where coupon_id = p_cp.id and user_id = p_user and status in ('reserved', 'redeemed') and not (order_id = any (p_own_pending));
  if v_cnt >= p_cp.per_user_limit then return jsonb_build_object('ok', false, 'error', 'coupon_user_limit'); end if;
  if p_cp.first_purchase_only and exists (
    select 1 from public.academy_orders o where o.user_id = p_user and o.total_minor > 0 and o.status in ('paid', 'refunded', 'partially_refunded')) then
    return jsonb_build_object('ok', false, 'error', 'coupon_first_purchase');
  end if;

  if p_cp.kind = 'percent' then
    v_disc := (p_after_sale * p_cp.percent_bps + 5000) / 10000;            -- round half up, integers only
    if p_cp.max_discount_minor is not null then v_disc := least(v_disc, p_cp.max_discount_minor); end if;
  else
    v_disc := p_cp.amount_minor;
  end if;
  return jsonb_build_object('ok', true, 'discount', least(v_disc, p_after_sale));
end;
$$;
revoke execute on function public._academy_coupon_eval(public.academy_coupons, uuid, public.academy_courses, bigint, bigint, text, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public._academy_coupon_eval(public.academy_coupons, uuid, public.academy_courses, bigint, bigint, text, timestamptz, uuid[]) to service_role;

-- ── The pricing engine, now with automatic coupons ─────────────────────────
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
  v_cand public.academy_coupons%rowtype;
  v_hint public.academy_coupons%rowtype;
  v_ev jsonb;
  v_best bigint := 0;
  v_auto boolean := false;
  v_code text := upper(btrim(coalesce(p_coupon, '')));
  v_list bigint;
  v_sale bigint := 0;
  v_rule_used integer;
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
  if found then
    v_sale := v_list - v_rule.price_minor;
    if v_rule.max_uses is not null then
      select count(*) into v_rule_used from public.academy_order_items i join public.academy_orders o on o.id = i.order_id
       where i.price_rule_id = v_rule.id and (o.status in ('paid', 'partially_refunded') or (o.status = 'pending' and o.expires_at > now()));
    end if;
  end if;
  v_after_sale := v_list - v_sale;

  -- 3. the coupon. The student's own unpaid orders for this course are about to be replaced by the new attempt, so they do not
  -- count against the coupon's limits.
  if p_user is not null then
    select coalesce(array_agg(o.id), '{}') into v_own_pending from public.academy_orders o
     where o.user_id = p_user and o.status = 'pending' and exists (select 1 from public.academy_order_items i where i.order_id = o.id and i.course_id = p_course);
  end if;

  if v_code <> '' then
    if p_user is null then return jsonb_build_object('ok', false, 'error', 'sign_in_required'); end if;
    if p_lock then
      select * into v_cp from public.academy_coupons where code = v_code for update;
    else
      select * into v_cp from public.academy_coupons where code = v_code;
    end if;
    -- An unknown, switched-off or someone-else's coupon all answer the same, so a code cannot be probed.
    if not found then return jsonb_build_object('ok', false, 'error', 'coupon_invalid'); end if;
    v_ev := public._academy_coupon_eval(v_cp, p_user, v_c, v_after_sale, v_sale, v_stack, v_now, v_own_pending);
    if not (v_ev ->> 'ok')::boolean then return v_ev; end if;
    v_disc := (v_ev ->> 'discount')::bigint;
  elsif p_user is not null then
    -- No code typed: the best automatic coupon this student qualifies for, if any. A failing one is just skipped.
    for v_cand in select * from public.academy_coupons where active and auto_apply order by created_at, id loop
      v_ev := public._academy_coupon_eval(v_cand, p_user, v_c, v_after_sale, v_sale, v_stack, v_now, v_own_pending);
      if (v_ev ->> 'ok')::boolean and (v_ev ->> 'discount')::bigint > v_best then
        v_best := (v_ev ->> 'discount')::bigint;
        v_cp := v_cand;
      end if;
    end loop;
    if v_cp.id is not null then
      v_auto := true;
      if p_lock then
        -- Lock the chosen coupon and check it again, so two buyers cannot both take its last use.
        select * into v_cp from public.academy_coupons where id = v_cp.id for update;
        v_ev := public._academy_coupon_eval(v_cp, p_user, v_c, v_after_sale, v_sale, v_stack, v_now, v_own_pending);
        if (v_ev ->> 'ok')::boolean then v_best := (v_ev ->> 'discount')::bigint; else v_cp := null; v_auto := false; v_best := 0; end if;
      end if;
      v_disc := v_best;
    end if;
  else
    -- A visitor: not told what they would get, only that an offer exists (and only if it is open to everyone and has room left).
    select * into v_hint from public.academy_coupons c
     where c.active and c.auto_apply and not exists (select 1 from public.academy_coupon_users u where u.coupon_id = c.id)
       and (c.starts_at is null or c.starts_at <= v_now) and (c.expires_at is null or c.expires_at > v_now)
       and v_c.kind = any (c.kinds) and v_after_sale >= c.min_purchase_minor
       and (c.usage_limit is null or (select count(*) from public.academy_coupon_redemptions r where r.coupon_id = c.id and r.status in ('reserved', 'redeemed')) < c.usage_limit)
       and (not exists (select 1 from public.academy_coupon_courses x where x.coupon_id = c.id) and not exists (select 1 from public.academy_coupon_categories x where x.coupon_id = c.id)
            or exists (select 1 from public.academy_coupon_courses x where x.coupon_id = c.id and x.course_id = p_course)
            or exists (select 1 from public.academy_coupon_categories x where x.coupon_id = c.id and x.category_id = v_c.category_id))
       and (v_sale = 0 or (c.stackable_with_sale and v_stack <> 'block'))
     order by c.created_at, c.id limit 1;
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
    'sale', case when v_rule.id is not null then jsonb_build_object('rule_id', v_rule.id, 'label', v_rule.label, 'kind', v_rule.kind, 'price_minor', v_rule.price_minor, 'discount_minor', v_sale, 'ends_at', v_rule.ends_at,
                                                                      'uses_left', case when v_rule.max_uses is not null then greatest(v_rule.max_uses - v_rule_used, 0) end) end,
    'after_sale_minor', v_after_sale,
    'coupon', case when v_cp.id is not null then jsonb_build_object('id', v_cp.id, 'code', v_cp.code, 'kind', v_cp.kind, 'percent_bps', v_cp.percent_bps, 'amount_minor', v_cp.amount_minor, 'discount_minor', v_disc,
                                                                      'auto', v_auto, 'label', case when v_auto then v_cp.public_label end) end,
    'auto_hint', case when v_hint.id is not null then jsonb_build_object('label', v_hint.public_label, 'kind', v_hint.kind, 'percent_bps', v_hint.percent_bps, 'amount_minor', v_hint.amount_minor, 'first_purchase_only', v_hint.first_purchase_only) end,
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

-- The catalogue and course pages also need to know how long a sale has left and how many places remain at its price.
create or replace function public.academy_catalog_prices(p_courses uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb := '{}'::jsonb; v_id uuid; v_q jsonb;
begin
  foreach v_id in array coalesce(p_courses[1:60], '{}') loop
    v_q := public._academy_quote(null, v_id, null, null, false, null, false);
    if (v_q ->> 'ok')::boolean then
      v_out := v_out || jsonb_build_object(v_id::text, jsonb_build_object(
        'list_minor', v_q -> 'list_minor', 'after_sale_minor', v_q -> 'after_sale_minor', 'total_minor', v_q -> 'total_minor',
        'sale', v_q -> 'sale', 'tax', v_q -> 'tax', 'free', v_q -> 'free', 'seats_left', v_q -> 'seats_left', 'auto_hint', v_q -> 'auto_hint'));
    elsif v_q ->> 'error' = 'sold_out' then
      v_out := v_out || jsonb_build_object(v_id::text, jsonb_build_object('sold_out', true));
    end if;
  end loop;
  return v_out;
end;
$$;
grant execute on function public.academy_catalog_prices(uuid[]) to anon, authenticated, service_role;

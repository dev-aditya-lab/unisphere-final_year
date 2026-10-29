-- 0065: UniSphere Academy, part 1 of 4: roles, settings, categories, courses, curriculum, mentors, cohorts, price rules.
--
-- The Academy is the learning vertical of UniSphere (docs/ACADEMY.md). It reuses the existing accounts (`profiles`), the
-- role/permission model (`user_roles`, `role_permissions`, `has_permission`), the audit log, the private file store (`files`)
-- and the notification pipeline (`notify`). Nothing here creates a second user table or a second role system.
--
-- Rules this migration follows, because every later part relies on them:
--   * Clients only SELECT through row level security. Every state change that matters (money, enrolment, grading, certificates)
--     is a SECURITY DEFINER function that checks `auth.uid()` and the permission itself.
--   * Catalogue editing (courses, lessons, categories...) is plain table writes guarded by RLS policies that call
--     `has_permission`, plus triggers that enforce what a policy cannot: price and publication changes need their own permission,
--     a course code can never change, and everything is audited with who/what/when.
--   * A trigger treats a call with no signed-in user (`auth.uid() is null`: the server's service role, a migration) as trusted.
--     Anonymous visitors never reach it: they hold no write grant and no write policy.
--   * Money is stored as integer minor units (paise) in `bigint`. No floats anywhere.

-- ═══════════════ 1. Roles and permissions ═══════════════
-- Academy roles are platform-wide (college_id null). Least privilege: a mentor has no payment access, a finance manager cannot
-- issue certificates, and the platform owner (global_admin) holds everything.
alter table public.user_roles drop constraint if exists user_roles_check;
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('global_admin', 'college_admin', 'moderator', 'verification_staff', 'support_agent', 'privacy_officer',
                  'academy_admin', 'course_manager', 'finance_manager', 'academy_mentor', 'academy_support'));
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('global_admin', 'college_admin', 'moderator', 'verification_staff', 'support_agent', 'privacy_officer',
                  'academy_admin', 'course_manager', 'finance_manager', 'academy_mentor', 'academy_support'));
alter table public.user_roles add constraint user_roles_check check (
  (role = 'global_admin' and college_id is null) or
  (role = 'college_admin' and college_id is not null) or
  (role in ('privacy_officer', 'academy_admin', 'course_manager', 'finance_manager', 'academy_mentor', 'academy_support') and college_id is null) or
  (role in ('moderator', 'verification_staff', 'support_agent'))
);

--   academy.courses.manage       create and edit courses, curriculum, resources, categories, cohorts
--   academy.courses.publish      publish, unpublish and archive a course
--   academy.pricing.manage       change prices, sale prices, tax and currency settings
--   academy.coupons.manage       create and edit coupons
--   academy.finance.view         see orders, payments and refunds
--   academy.refunds.process      approve a refund and send it to the payment gateway
--   academy.students.view        see students and their progress
--   academy.students.manage      enrol or remove someone by hand (complimentary, scholarship), suspend access
--   academy.assignments.review   grade submissions (a mentor: only in the courses they are assigned to)
--   academy.certificates.issue   issue and re-issue certificates
--   academy.certificates.revoke  revoke a certificate
--   academy.templates.manage     upload and edit certificate templates
--   academy.live.manage          schedule live sessions
--   academy.announce             post announcements to a course
--   academy.analytics.view       reports
--   academy.export               download CSV exports
--   academy.audit.view           the Academy audit log
--   academy.settings.manage      Academy settings (organisation name, refund window, verification contact...)
insert into public.role_permissions(role, permission)
select r.role, p.permission
from (values ('global_admin'), ('academy_admin')) as r(role)
cross join (values
  ('academy.courses.manage'), ('academy.courses.publish'), ('academy.pricing.manage'), ('academy.coupons.manage'),
  ('academy.finance.view'), ('academy.refunds.process'), ('academy.students.view'), ('academy.students.manage'),
  ('academy.assignments.review'), ('academy.certificates.issue'), ('academy.certificates.revoke'), ('academy.templates.manage'),
  ('academy.live.manage'), ('academy.announce'), ('academy.analytics.view'), ('academy.export'), ('academy.audit.view'),
  ('academy.settings.manage')
) as p(permission)
on conflict do nothing;

insert into public.role_permissions(role, permission) values
  ('course_manager', 'academy.courses.manage'), ('course_manager', 'academy.courses.publish'), ('course_manager', 'academy.live.manage'),
  ('course_manager', 'academy.announce'), ('course_manager', 'academy.students.view'), ('course_manager', 'academy.analytics.view'),
  ('finance_manager', 'academy.pricing.manage'), ('finance_manager', 'academy.coupons.manage'), ('finance_manager', 'academy.finance.view'),
  ('finance_manager', 'academy.refunds.process'), ('finance_manager', 'academy.analytics.view'), ('finance_manager', 'academy.export'),
  ('academy_mentor', 'academy.assignments.review'), ('academy_mentor', 'academy.live.manage'),
  ('academy_support', 'academy.students.view'), ('academy_support', 'academy.announce')
on conflict do nothing;

-- Granting the Academy roles stays with global administrators (roles.manage), platform-wide, never to oneself.
create or replace function public.grant_role(p_user uuid, p_role text, p_college uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_target public.profiles%rowtype;
  v_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_user = v_actor then raise exception 'cannot_grant_to_self' using errcode = '42501'; end if;

  select * into v_target from public.profiles where id = p_user;
  if not found or v_target.status <> 'active' then raise exception 'target_unavailable' using errcode = '22023'; end if;

  if p_role in ('global_admin', 'privacy_officer', 'academy_admin', 'course_manager', 'finance_manager', 'academy_mentor', 'academy_support') then
    if p_college is not null then raise exception 'invalid_scope' using errcode = '22023'; end if;
    if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif p_role = 'college_admin' then
    if p_college is null then raise exception 'invalid_scope' using errcode = '22023'; end if;
    if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif p_role in ('moderator', 'verification_staff', 'support_agent') then
    if p_college is null then
      if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
    else
      if not (public.has_permission('roles.manage', p_college) or public.has_permission('roles.manage_limited', p_college)) then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    end if;
  else
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_college is not null and v_target.college_id is distinct from p_college then
    raise exception 'target_not_in_college' using errcode = '22023';
  end if;

  insert into public.user_roles(user_id, role, college_id, granted_by)
  values (p_user, p_role, p_college, v_actor)
  returning id into v_id;

  perform public.write_audit_log(v_actor, 'role.granted', 'user', p_user::text, p_college, jsonb_build_object('role', p_role));
  return v_id;
end;
$$;
grant execute on function public.grant_role(uuid, text, uuid) to authenticated, service_role;

-- "Does the caller hold any Academy permission?" Used by RLS so staff can see drafts, and by the Academy console's gate.
create or replace function public.academy_is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    join public.profiles me on me.id = ur.user_id
    where ur.user_id = (select auth.uid()) and me.status = 'active' and rp.permission like 'academy.%'
  );
$$;
grant execute on function public.academy_is_staff() to anon, authenticated, service_role;

-- ═══════════════ 2. Notifications: one new category ═══════════════
-- "academy": enrolments, payments, refunds, live-class and deadline reminders, feedback, completion, certificates, announcements.
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('social', 'connections', 'projects', 'mentorship', 'messages', 'events', 'moderation', 'announcements', 'rewards', 'promotions', 'communities', 'academy'));

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
    when p_type like 'academy\_%' then 'academy'
    else 'social' end;
$$;

-- Payments, deadlines and certificates are things a missed email costs something for, so the Academy's email switch starts on.
create or replace function public.notification_email_default(p_category text)
returns boolean language sql immutable set search_path = '' as $$
  select p_category in ('projects', 'mentorship', 'moderation', 'events', 'academy');
$$;

-- ═══════════════ 3. Settings ═══════════════
-- Every Academy knob lives here, edited in the Academy console (permission academy.settings.manage; money and tax keys need
-- academy.pricing.manage as well). Nothing is hard-coded in a page.
create table public.academy_settings (
  key text primary key,
  value jsonb not null,
  public_read boolean not null default false,
  description text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.academy_settings enable row level security;
grant select on public.academy_settings to authenticated;
create policy academy_settings_staff_read on public.academy_settings for select to authenticated using (public.academy_is_staff());

insert into public.academy_settings(key, value, public_read, description) values
  ('sales_enabled', 'false', true, 'Paid enrolment is open. Free courses can be taken without it. Off until a payment gateway is connected and tested.'),
  ('currency', '"INR"', true, 'Currency of every price. The payment layer currently supports INR only.'),
  ('tax_mode', '"none"', true, 'none | inclusive (listed prices already contain tax) | exclusive (tax is added at checkout). Set with professional advice.'),
  ('tax_rate_bps', '0', true, 'Tax rate in basis points (1800 = 18.00%). Ignored when tax_mode is none.'),
  ('tax_label', '"GST"', true, 'Name of the tax on receipts and the checkout summary.'),
  ('coupon_with_sale', '"allow"', true, 'allow | block. Whether a coupon may be used on top of a scheduled sale price. A coupon can also forbid it for itself.'),
  ('refund_window_days', '7', true, 'Days after payment during which a student may ask for a refund (a course can set its own).'),
  ('order_hold_minutes', '60', false, 'How long an unpaid order holds its seat and coupon before it expires.'),
  ('issuing_organization', '"UniSphere Academy"', true, 'Name printed on certificates and shown when one is verified.'),
  ('support_email', '""', true, 'Where students and verifiers write about a payment, a course or a disputed certificate.'),
  ('code_prefix', '"USA"', false, 'First part of every new course code (USA-WD-001). Existing codes never change.'),
  ('certificate_prefix', '"US"', false, 'First part of every new certificate ID (US-2026-WD-00142). Existing IDs never change.'),
  ('live_reminder_hours', '[24, 1]', false, 'How many hours before a live class students are reminded.'),
  ('assignment_reminder_hours', '24', false, 'How many hours before a deadline students who have not submitted are reminded.'),
  ('recording_retention_days', '180', false, 'How long a class recording stays available after the class. Documented policy, enforced by an administrator.'),
  ('enrollment_default_access_days', 'null', false, 'Default access period in days for new enrolments (null = no expiry). A course can set its own.')
on conflict (key) do nothing;

-- The settings a visitor may see (currency, tax display, the support address...).
create or replace function public.academy_public_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.academy_settings where public_read;
$$;
grant execute on function public.academy_public_settings() to anon, authenticated, service_role;

create or replace function public._academy_setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.academy_settings where key = p_key;
$$;
revoke execute on function public._academy_setting(text) from public, anon, authenticated;
grant execute on function public._academy_setting(text) to service_role;

create or replace function public.academy_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old jsonb;
  v_money boolean := p_key in ('currency', 'tax_mode', 'tax_rate_bps', 'tax_label', 'coupon_with_sale', 'sales_enabled');
begin
  if not public.has_permission('academy.settings.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_money and not public.has_permission('academy.pricing.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_old from public.academy_settings where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = 'P0002'; end if;

  -- Each key has a shape; a wrong one would break checkout or certificates, so it is refused here, not discovered later.
  if p_key in ('sales_enabled') and jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key = 'currency' and p_value <> '"INR"'::jsonb then raise exception 'unsupported_currency' using errcode = '22023'; end if;
  if p_key = 'tax_mode' and not (p_value in ('"none"'::jsonb, '"inclusive"'::jsonb, '"exclusive"'::jsonb)) then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key = 'tax_rate_bps' and not (jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 10000 and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)) then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key = 'coupon_with_sale' and not (p_value in ('"allow"'::jsonb, '"block"'::jsonb)) then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key in ('refund_window_days', 'order_hold_minutes', 'recording_retention_days', 'assignment_reminder_hours')
     and not (jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 3650) then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key in ('tax_label', 'issuing_organization', 'support_email', 'code_prefix', 'certificate_prefix')
     and not (jsonb_typeof(p_value) = 'string' and char_length(p_value #>> '{}') <= 120) then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key in ('code_prefix', 'certificate_prefix') and (p_value #>> '{}') !~ '^[A-Z][A-Z0-9]{1,5}$' then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key = 'support_email' and (p_value #>> '{}') <> '' and (p_value #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_value' using errcode = '22023'; end if;
  if p_key = 'live_reminder_hours' and not (jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) <= 4) then raise exception 'invalid_value' using errcode = '22023'; end if;

  update public.academy_settings set value = p_value, updated_by = v_actor, updated_at = now() where key = p_key;
  perform public.write_audit_log(v_actor, 'academy.setting.updated', 'academy_setting', p_key, null,
    jsonb_build_object('from', v_old, 'to', p_value));
end;
$$;
grant execute on function public.academy_set_setting(text, jsonb) to authenticated, service_role;

-- ═══════════════ 4. Audit trigger (used by the catalogue tables) ═══════════════
-- Writes "who changed what" to the existing append-only audit log. Short scalar values are recorded as from/to, anything long
-- is recorded as "changed" only, so a lesson body or a rubric never ends up in the log.
create or replace function public.academy_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old jsonb;
  v_new jsonb;
  v_meta jsonb := '{}'::jsonb;
  v_key text;
  v_ov jsonb;
  v_nv jsonb;
  v_label text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    perform public.write_audit_log(v_actor, 'academy.' || v_label || '.created', v_label, v_new ->> 'id', null,
      jsonb_build_object('ref', coalesce(v_new ->> 'code', v_new ->> 'name', v_new ->> 'title', v_new ->> 'label')));
    return new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    perform public.write_audit_log(v_actor, 'academy.' || v_label || '.deleted', v_label, v_old ->> 'id', null,
      jsonb_build_object('ref', coalesce(v_old ->> 'code', v_old ->> 'name', v_old ->> 'title', v_old ->> 'label')));
    return old;
  end if;

  v_old := to_jsonb(old); v_new := to_jsonb(new);
  for v_key in select jsonb_object_keys(v_new) loop
    if v_key in ('updated_at', 'uses', 'redeemed_count') then continue; end if;
    v_ov := v_old -> v_key; v_nv := v_new -> v_key;
    if v_ov is distinct from v_nv then
      if jsonb_typeof(v_nv) in ('number', 'boolean', 'null') or (jsonb_typeof(v_nv) = 'string' and char_length(v_nv #>> '{}') <= 60) then
        v_meta := v_meta || jsonb_build_object(v_key, jsonb_build_object('from', v_ov, 'to', v_nv));
      else
        v_meta := v_meta || jsonb_build_object(v_key, 'changed');
      end if;
    end if;
  end loop;
  if v_meta = '{}'::jsonb then return new; end if;
  perform public.write_audit_log(v_actor, 'academy.' || v_label || '.updated', v_label, v_new ->> 'id', null,
    v_meta || jsonb_build_object('ref', coalesce(v_new ->> 'code', v_new ->> 'name', v_new ->> 'title', v_new ->> 'label')));
  return new;
end;
$$;

-- ═══════════════ 5. Categories ═══════════════
create table public.academy_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 2 and 60),
  code_prefix text not null unique check (code_prefix ~ '^[A-Z][A-Z0-9]{1,7}$'),
  description text check (description is null or char_length(description) <= 300),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_academy_categories_updated before update on public.academy_categories for each row execute function public.set_updated_at();
create trigger trg_academy_categories_audit after insert or update or delete on public.academy_categories for each row execute function public.academy_audit('category');
alter table public.academy_categories enable row level security;
grant select on public.academy_categories to anon, authenticated;
grant insert, update, delete on public.academy_categories to authenticated;
create policy academy_categories_read on public.academy_categories for select to anon, authenticated using (active or public.academy_is_staff());
create policy academy_categories_ins on public.academy_categories for insert to authenticated with check (public.has_permission('academy.courses.manage', null));
create policy academy_categories_upd on public.academy_categories for update to authenticated using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));
create policy academy_categories_del on public.academy_categories for delete to authenticated using (public.has_permission('academy.courses.manage', null));

-- Real, editable starting categories (an administrator can rename, add or switch off any of them).
insert into public.academy_categories(slug, name, code_prefix, position) values
  ('web-development', 'Web Development', 'WD', 1),
  ('python', 'Python', 'PY', 2),
  ('ui-ux-design', 'UI/UX Design', 'UIUX', 3),
  ('data-science', 'Data Science', 'DS', 4),
  ('mobile-development', 'Mobile Development', 'MD', 5),
  ('career-skills', 'Career Skills', 'CS', 6)
on conflict do nothing;

-- ═══════════════ 6. Courses (courses, programs and internships share one table: `kind`) ═══════════════
create sequence public.academy_course_seq;

create table public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  -- Human-readable, unique and immutable (USA-WD-001). Never an access secret; the id is what authorises anything.
  code text not null unique,
  kind text not null default 'course' check (kind in ('course', 'program', 'internship')),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  title text not null check (char_length(title) between 3 and 120),
  short_description text check (short_description is null or char_length(short_description) <= 280),
  description_md text check (description_md is null or char_length(description_md) <= 20000),
  category_id uuid not null references public.academy_categories(id) on delete restrict,
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced', 'all')),
  language text not null default 'English' check (char_length(language) between 2 and 40),
  objectives text[] not null default '{}' check (cardinality(objectives) <= 20),
  prerequisites text[] not null default '{}' check (cardinality(prerequisites) <= 20),
  skills text[] not null default '{}' check (cardinality(skills) <= 30),
  outcomes text[] not null default '{}' check (cardinality(outcomes) <= 12),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 600000),
  duration_label text check (duration_label is null or char_length(duration_label) <= 60),
  cover_key text check (cover_key is null or cover_key ~ '^academy_cover/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  promo_video_url text check (promo_video_url is null or (promo_video_url ~ '^https://[^\s]+$' and char_length(promo_video_url) <= 500)),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived')),
  enrollment_limit integer check (enrollment_limit is null or enrollment_limit between 1 and 100000),
  starts_at timestamptz,
  ends_at timestamptz,
  -- Money. null = not priced yet (cannot be published); 0 = free on purpose.
  price_minor bigint check (price_minor is null or price_minor between 0 and 100000000),
  currency text not null default 'INR' check (currency = 'INR'),
  refund_days integer check (refund_days is null or refund_days between 0 and 365),
  access_days integer check (access_days is null or access_days between 1 and 3650),
  -- How a student qualifies for a certificate: { "min_completion_pct":100, "require_assignments":true, "min_score_pct":60, "manual_approval":false }
  certificate_criteria jsonb not null default '{"min_completion_pct":100,"require_assignments":true,"min_score_pct":0,"manual_approval":false}'::jsonb
    check (jsonb_typeof(certificate_criteria) = 'object'),
  certificate_template_id uuid,           -- foreign key added with the certificate tables (0068)
  seo_title text check (seo_title is null or char_length(seo_title) <= 70),
  seo_description text check (seo_description is null or char_length(seo_description) <= 170),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index academy_courses_catalog_idx on public.academy_courses(status, kind, category_id);
create index academy_courses_published_idx on public.academy_courses(published_at desc) where status = 'published';

create or replace function public.academy_courses_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_trusted boolean := (select auth.uid()) is null;
  v_prefix text;
  v_org text;
begin
  if tg_op = 'INSERT' then
    select code_prefix into v_prefix from public.academy_categories where id = new.category_id;
    v_org := coalesce(public._academy_setting('code_prefix') #>> '{}', 'USA');
    -- Generated here, on the server, from a sequence: two courses can never receive the same number.
    new.code := v_org || '-' || v_prefix || '-' || lpad(nextval('public.academy_course_seq')::text, 3, '0');
    if not v_trusted then
      new.status := 'draft'; new.published_at := null;
      if new.price_minor is not null and not public.has_permission('academy.pricing.manage', null) then new.price_minor := null; end if;
    end if;
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    if new.code is distinct from old.code then raise exception 'code_immutable' using errcode = '22023'; end if;
    if not v_trusted then
      if (new.price_minor is distinct from old.price_minor or new.refund_days is distinct from old.refund_days)
         and not public.has_permission('academy.pricing.manage', null) then
        raise exception 'forbidden_pricing' using errcode = '42501';
      end if;
      if new.status is distinct from old.status and not public.has_permission('academy.courses.publish', null) then
        raise exception 'forbidden_publish' using errcode = '42501';
      end if;
      if new.cover_key is distinct from old.cover_key and new.cover_key is not null and not exists (
        select 1 from public.files f where f.storage_key = new.cover_key and f.purpose = 'academy_cover' and f.status = 'ready'
      ) then raise exception 'invalid_image' using errcode = '22023'; end if;
    end if;
    if new.kind is distinct from old.kind and exists (select 1 from public.academy_enrollments e where e.course_id = old.id) then
      raise exception 'kind_locked' using errcode = '22023';
    end if;
    if new.status = 'published' and old.status <> 'published' then
      if new.price_minor is null then raise exception 'price_required' using errcode = '22023'; end if;
      if new.kind = 'course' and not exists (select 1 from public.academy_lessons l where l.course_id = new.id) then
        raise exception 'lessons_required' using errcode = '22023';
      end if;
      new.published_at := coalesce(old.published_at, now());
    end if;
  end if;
  return new;
end;
$$;
-- (academy_enrollments and academy_lessons are created below / in 0066; the function body only runs on a write, after they exist.)
create trigger trg_academy_courses_guard before insert or update on public.academy_courses for each row execute function public.academy_courses_guard();
create trigger trg_academy_courses_updated before update on public.academy_courses for each row execute function public.set_updated_at();
create trigger trg_academy_courses_audit after insert or update or delete on public.academy_courses for each row execute function public.academy_audit('course');

-- ═══════════════ 7. Mentors ═══════════════
-- The public name and headline are copied here when an administrator adds the mentor, so the public course page never has to read
-- a member's profile.
create table public.academy_mentors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  headline text check (headline is null or char_length(headline) <= 120),
  bio text check (bio is null or char_length(bio) <= 800),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_academy_mentors_updated before update on public.academy_mentors for each row execute function public.set_updated_at();
create trigger trg_academy_mentors_audit after insert or update or delete on public.academy_mentors for each row execute function public.academy_audit('mentor');

create table public.academy_course_mentors (
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  user_id uuid not null references public.academy_mentors(user_id) on delete cascade,
  role text not null default 'mentor' check (role in ('lead', 'mentor')),
  position integer not null default 0,
  primary key (course_id, user_id)
);
create index academy_course_mentors_user_idx on public.academy_course_mentors(user_id);
create trigger trg_academy_course_mentors_audit after insert or update or delete on public.academy_course_mentors for each row execute function public.academy_audit('course_mentor');

-- ═══════════════ 8. Curriculum ═══════════════
create table public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  summary text check (summary is null or char_length(summary) <= 400),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index academy_modules_course_idx on public.academy_modules(course_id, position);

create table public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  module_id uuid not null references public.academy_modules(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  kind text not null default 'video' check (kind in ('video', 'text', 'resource', 'quiz', 'assignment')),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  position integer not null default 0,
  -- A preview lesson can be opened by anyone before enrolling.
  is_preview boolean not null default false,
  -- Quiz lessons only: the score (percent) that counts as passed.
  pass_pct integer not null default 70 check (pass_pct between 1 and 100),
  created_at timestamptz not null default now()
);
create index academy_lessons_course_idx on public.academy_lessons(course_id, module_id, position);

-- The body of a lesson lives apart from its outline, so a visitor can read the syllabus without being able to read the lessons.
create table public.academy_lesson_content (
  lesson_id uuid primary key references public.academy_lessons(id) on delete cascade,
  body_md text check (body_md is null or char_length(body_md) <= 60000),
  video_provider text check (video_provider is null or video_provider in ('youtube', 'vimeo', 'url')),
  -- youtube/vimeo: the video id. url: an https address of a video file you host.
  video_ref text check (video_ref is null or char_length(video_ref) <= 500),
  updated_at timestamptz not null default now()
);
create trigger trg_academy_lesson_content_updated before update on public.academy_lesson_content for each row execute function public.set_updated_at();

create table public.academy_resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid references public.academy_lessons(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  file_id uuid not null references public.files(id) on delete restrict,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index academy_resources_course_idx on public.academy_resources(course_id, position);

create table public.academy_cohorts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity between 1 and 100000),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index academy_cohorts_course_idx on public.academy_cohorts(course_id, starts_at);
create trigger trg_academy_cohorts_updated before update on public.academy_cohorts for each row execute function public.set_updated_at();
create trigger trg_academy_cohorts_audit after insert or update or delete on public.academy_cohorts for each row execute function public.academy_audit('cohort');

-- ═══════════════ 9. Price rules ═══════════════
-- A rule lowers the price for a window (scheduled sale, early bird, one cohort, a promotion). The pricing engine picks the lowest
-- price among the rules valid right now; a rule never raises a price above the course's list price.
create table public.academy_price_rules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  kind text not null default 'sale' check (kind in ('sale', 'early_bird', 'cohort', 'promotion')),
  label text not null check (char_length(label) between 2 and 60),
  price_minor bigint not null check (price_minor between 0 and 100000000),
  starts_at timestamptz,
  ends_at timestamptz,
  cohort_id uuid references public.academy_cohorts(id) on delete cascade,
  -- Seats at this price. Counted from orders (paid, or still held), never from a counter that could drift.
  max_uses integer check (max_uses is null or max_uses between 1 and 100000),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index academy_price_rules_course_idx on public.academy_price_rules(course_id, active);
create trigger trg_academy_price_rules_updated before update on public.academy_price_rules for each row execute function public.set_updated_at();
create trigger trg_academy_price_rules_audit after insert or update or delete on public.academy_price_rules for each row execute function public.academy_audit('price_rule');

-- ═══════════════ 10. Access helpers and row level security for the catalogue ═══════════════
-- Does the signed-in student have a valid enrolment in this course right now? Written in plpgsql so it can name the enrolment
-- table that 0066 creates. Expired, revoked, suspended and refunded enrolments do not count. An archived or unpublished course
-- stays open to the people who already hold a valid enrolment.
create or replace function public.academy_has_access(p_course uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return false; end if;
  return exists (
    select 1 from public.academy_enrollments e
    where e.user_id = v_user and e.course_id = p_course and e.status in ('active', 'completed')
      and (e.access_expires_at is null or e.access_expires_at > now())
  );
end;
$$;
grant execute on function public.academy_has_access(uuid) to anon, authenticated, service_role;

-- Same question for a named student, for server code and the database's own functions. Not callable by API roles.
create or replace function public._academy_has_access(p_user uuid, p_course uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from public.academy_enrollments e
    where e.user_id = p_user and e.course_id = p_course and e.status in ('active', 'completed')
      and (e.access_expires_at is null or e.access_expires_at > now())
  );
end;
$$;
revoke execute on function public._academy_has_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public._academy_has_access(uuid, uuid) to service_role;

-- May the caller open this lesson's content? A preview lesson of a published course: anyone. Otherwise: an enrolled student or staff.
create or replace function public.academy_can_open_lesson(p_lesson uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_course uuid;
  v_preview boolean;
  v_status text;
begin
  select l.course_id, l.is_preview, c.status into v_course, v_preview, v_status
  from public.academy_lessons l join public.academy_courses c on c.id = l.course_id where l.id = p_lesson;
  if not found then return false; end if;
  if public.academy_is_staff() then return true; end if;
  if v_preview and v_status = 'published' then return true; end if;
  return public.academy_has_access(v_course);
end;
$$;
grant execute on function public.academy_can_open_lesson(uuid) to anon, authenticated, service_role;

-- Who may see a course: anyone if it is published; staff always; a student who still has access, even after it is archived.
alter table public.academy_courses enable row level security;
alter table public.academy_mentors enable row level security;
alter table public.academy_course_mentors enable row level security;
alter table public.academy_modules enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_lesson_content enable row level security;
alter table public.academy_resources enable row level security;
alter table public.academy_cohorts enable row level security;
alter table public.academy_price_rules enable row level security;

grant select on public.academy_courses, public.academy_mentors, public.academy_course_mentors, public.academy_modules, public.academy_lessons, public.academy_cohorts to anon, authenticated;
grant select on public.academy_lesson_content to anon;
grant select on public.academy_lesson_content, public.academy_resources, public.academy_price_rules to authenticated;
grant insert, update, delete on public.academy_courses, public.academy_mentors, public.academy_course_mentors, public.academy_modules, public.academy_lessons,
  public.academy_lesson_content, public.academy_resources, public.academy_cohorts, public.academy_price_rules to authenticated;
revoke delete on public.academy_courses from authenticated;   -- courses are archived, never deleted: orders and certificates refer to them

create policy academy_courses_read on public.academy_courses for select to anon, authenticated
  using (status = 'published' or public.academy_is_staff() or (status in ('unpublished', 'archived') and public.academy_has_access(id)));
create policy academy_courses_ins on public.academy_courses for insert to authenticated with check (public.has_permission('academy.courses.manage', null));
create policy academy_courses_upd on public.academy_courses for update to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));

create policy academy_mentors_read on public.academy_mentors for select to anon, authenticated using (active or public.academy_is_staff());
create policy academy_mentors_write on public.academy_mentors for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));
create policy academy_course_mentors_read on public.academy_course_mentors for select to anon, authenticated
  using (exists (select 1 from public.academy_courses c where c.id = course_id));
create policy academy_course_mentors_write on public.academy_course_mentors for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));

create policy academy_modules_read on public.academy_modules for select to anon, authenticated
  using (exists (select 1 from public.academy_courses c where c.id = course_id));
create policy academy_modules_write on public.academy_modules for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));
create policy academy_lessons_read on public.academy_lessons for select to anon, authenticated
  using (exists (select 1 from public.academy_courses c where c.id = course_id));
create policy academy_lessons_write on public.academy_lessons for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));

-- The lesson body is readable only where the lesson itself may be opened (see academy_can_open_lesson above).
create policy academy_lesson_content_read on public.academy_lesson_content for select to anon, authenticated using (public.academy_can_open_lesson(lesson_id));
create policy academy_lesson_content_write on public.academy_lesson_content for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));
create policy academy_resources_read on public.academy_resources for select to authenticated using (public.academy_has_access(course_id) or public.academy_is_staff());
create policy academy_resources_write on public.academy_resources for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));

create policy academy_cohorts_read on public.academy_cohorts for select to anon, authenticated
  using (status <> 'archived' and exists (select 1 from public.academy_courses c where c.id = course_id) or public.academy_is_staff());
create policy academy_cohorts_write on public.academy_cohorts for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));

-- Price rules are read by staff only; visitors see the resulting price through academy_catalog_prices() (0067).
create policy academy_price_rules_read on public.academy_price_rules for select to authenticated
  using (public.has_permission('academy.pricing.manage', null) or public.has_permission('academy.finance.view', null) or public.has_permission('academy.courses.manage', null));
create policy academy_price_rules_write on public.academy_price_rules for all to authenticated
  using (public.has_permission('academy.pricing.manage', null)) with check (public.has_permission('academy.pricing.manage', null));

-- ═══════════════ 11. Files the Academy uses ═══════════════
-- academy_cover       public image for a course page (uploaded by course managers)
-- academy_resource    a downloadable file for the people enrolled in a course (PDF or image; private)
-- academy_template    a certificate template PDF (private, certificate staff only)
-- academy_submission  a student's assignment file (private; the student and that course's reviewers)
alter table public.files drop constraint if exists files_purpose_check;
alter table public.files add constraint files_purpose_check check (purpose in (
  'avatar', 'cover', 'post_attachment', 'project_asset', 'community_image',
  'event_banner', 'message_attachment', 'verification_document', 'orbit_badge',
  'academy_cover', 'academy_resource', 'academy_template', 'academy_submission'
));
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to anon, authenticated
  using (
    (purpose in ('avatar', 'cover', 'project_asset', 'community_image', 'event_banner', 'orbit_badge', 'academy_cover') and status = 'ready')
    or owner_id = (select auth.uid())
  );
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending' and public.is_active_user()
              and (purpose <> 'orbit_badge' or public.has_permission('orbits.manage'))
              and (purpose not in ('academy_cover', 'academy_resource') or public.has_permission('academy.courses.manage', null))
              and (purpose <> 'academy_template' or public.has_permission('academy.templates.manage', null)));

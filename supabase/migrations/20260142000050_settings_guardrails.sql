-- 0050: settings guardrails (profile and notification settings)
--
-- The app limits what a member can put on their profile; the database did not, so the same limits are enforced here for
-- anyone calling the API directly:
--   1. at most 30 achievements and 20 experiences per member;
--   2. tag lists (skills, interests, roles, topics): each item at most 40 characters;
--   3. social links: only `linkedin` and `twitter`, http(s) addresses of at most 300 characters;
--   4. the "Moderation & account" notification category cannot be switched off in the app (decisions, warnings and the
--      appeal window would be missed); the server and this trigger both keep it on;
--   5. "My college" profile visibility needs a college (posts, projects and events already did).
--
-- Safe to re-run. Existing rows are checked when a constraint is added; the migration stops (and changes nothing) if a row
-- breaks a rule, so fix or clear that row first.

-- ── 1. Row caps ─────────────────────────────────────────────────────────────
create or replace function public.enforce_profile_list_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer := tg_argv[0]::integer;
  v_count integer;
begin
  -- One writer at a time per member, so two parallel inserts cannot both slip under the cap.
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ':' || new.user_id::text, 0));
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into v_count using new.user_id;
  if v_count >= v_cap then
    raise exception 'limit_reached' using errcode = '23514', detail = format('at most %s rows per member', v_cap);
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_profile_list_cap() from public, anon, authenticated;

drop trigger if exists trg_profile_achievements_cap on public.profile_achievements;
create trigger trg_profile_achievements_cap before insert on public.profile_achievements
  for each row execute function public.enforce_profile_list_cap(30);

drop trigger if exists trg_profile_experiences_cap on public.profile_experiences;
create trigger trg_profile_experiences_cap before insert on public.profile_experiences
  for each row execute function public.enforce_profile_list_cap(20);

-- ── 2. Tag items are short ──────────────────────────────────────────────────
create or replace function public.text_items_within(p_items text[], p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_items is null or not exists (select 1 from unnest(p_items) i where i is null or char_length(btrim(i)) = 0 or char_length(i) > p_max);
$$;

do $$
declare
  c record;
begin
  for c in select * from (values ('skills'), ('interests'), ('preferred_roles'), ('mentoring_topics')) as t(col) loop
    if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = format('profiles_%s_items_check', c.col)) then
      execute format('alter table public.profiles add constraint %I check (public.text_items_within(%I, 40))', format('profiles_%s_items_check', c.col), c.col);
    end if;
  end loop;
end $$;

-- ── 3. Social links ─────────────────────────────────────────────────────────
create or replace function public.social_links_ok(p_links jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_links is null or (
    jsonb_typeof(p_links) = 'object'
    and not exists (
      select 1 from jsonb_each(p_links) e
      where e.key not in ('linkedin', 'twitter')
         or jsonb_typeof(e.value) <> 'string'
         or char_length(e.value #>> '{}') > 300
         or (e.value #>> '{}') !~* '^https?://[^[:space:]<>"]+$'
    )
  );
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_social_links_content_check') then
    alter table public.profiles add constraint profiles_social_links_content_check check (public.social_links_ok(social_links));
  end if;
end $$;

-- ── 4. Account-safety notifications stay on ─────────────────────────────────
create or replace function public.keep_moderation_notifications_on()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category = 'moderation' then new.in_app := true; end if;
  return new;
end;
$$;

drop trigger if exists trg_notification_preferences_moderation on public.notification_preferences;
create trigger trg_notification_preferences_moderation before insert or update on public.notification_preferences
  for each row execute function public.keep_moderation_notifications_on();

update public.notification_preferences set in_app = true where category = 'moderation' and not in_app;

-- ── 5. "My college" profile visibility needs a college ─────────────────────
-- Posts, projects and events already refuse "my college" without a college (0019); the profile did not, so a member
-- could pick it and become visible to nobody. Choosing it without a college is refused with a clear error; if the member
-- later removes their last college while it is selected, the profile falls back to "Connections only" instead of
-- blocking the removal.
create or replace function public.profiles_college_visibility_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'college' and new.college_id is null then
    if tg_op = 'UPDATE' and old.visibility = 'college' then
      new.visibility := 'connections';
    else
      raise exception 'college_required' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_profiles_require_college on public.profiles;
create trigger trg_zz_profiles_require_college before insert or update of visibility, college_id on public.profiles
  for each row execute function public.profiles_college_visibility_guard();

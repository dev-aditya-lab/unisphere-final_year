-- Orbits: a badge can have its own picture, uploaded by an administrator and stored in R2 (the built-in artwork stays the default).
--
-- * files.purpose gains 'orbit_badge'. Anyone signed in may see such a file (a badge picture is shown to every member), but only a
--   member with orbits.manage may create one.
-- * orbit_achievements.image_key is the storage key of the current picture (null = built-in artwork). orbit_admin_set_achievement_image
--   sets or clears it, after checking the file really is a ready orbit_badge upload, and writes the audit log.
-- * The member-facing reads return image_key next to icon.

alter table public.files drop constraint if exists files_purpose_check;
alter table public.files add constraint files_purpose_check check (purpose in (
  'avatar', 'cover', 'post_attachment', 'project_asset', 'community_image',
  'event_banner', 'message_attachment', 'verification_document', 'orbit_badge'
));

drop policy if exists files_select on public.files;
create policy files_select on public.files for select to anon, authenticated
  using (
    (purpose in ('avatar', 'cover', 'project_asset', 'community_image', 'event_banner', 'orbit_badge') and status = 'ready')
    or owner_id = (select auth.uid())
  );
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending' and public.is_active_user()
              and (purpose <> 'orbit_badge' or public.has_permission('orbits.manage')));

alter table public.orbit_achievements add column if not exists image_key text
  check (image_key is null or image_key ~ '^orbit_badge/[0-9a-f-]{36}/[0-9a-f-]{36}.(png|jpg|webp)$');

create or replace function public.orbit_admin_set_achievement_image(p_id text, p_key text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.manage'); v_old text;
begin
  select image_key into v_old from public.orbit_achievements where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_key is not null and not exists (
    select 1 from public.files f where f.storage_key = p_key and f.purpose = 'orbit_badge' and f.status = 'ready'
  ) then raise exception 'invalid_image' using errcode = '22023'; end if;
  update public.orbit_achievements set image_key = p_key where id = p_id;
  perform public.write_audit_log(v_actor, 'orbits.badge_image', 'orbit_achievement', p_id, null, jsonb_build_object('from', v_old, 'to', p_key));
  return jsonb_build_object('previous', v_old, 'image_key', p_key);
end $$;

create or replace function public.orbit_my_achievements() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'category', a.category, 'title', a.title, 'description', a.description, 'icon', a.icon, 'image_key', a.image_key, 'tier', a.tier,
      'target', (a.criteria->>'value')::int, 'type', a.criteria->>'type',
      'earned', coalesce((select jsonb_agg(jsonb_build_object('earned_at', u.earned_at, 'scope', u.scope, 'period', u.period, 'rank', u.rank, 'score', u.score) order by u.earned_at desc)
                          from public.orbit_user_achievements u where u.user_id = v_me and u.achievement_id = a.id), '[]'::jsonb)) order by a.sort_order)
    from public.orbit_achievements a where a.active), '[]'::jsonb);
end $$;

create or replace function public.orbit_profile_summary(p_username text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); p public.profiles%rowtype; s public.orbit_streaks%rowtype; v_today date := public.orbit_today(); v_self boolean;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into p from public.profiles where username = lower(p_username);
  if not found or not public.can_view_profile(p.id, p.visibility, p.college_id, p.status) then return null; end if;
  v_self := (p.id = v_me);
  select * into s from public.orbit_streaks where user_id = p.id;
  return jsonb_build_object(
    'user', jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_key', p.avatar_key),
    'self', v_self,
    'balance', case when v_self or p.orbits_show_balance then coalesce((select balance from public.orbit_balances where user_id = p.id), 0) else null end,
    'show_achievements', v_self or p.orbits_show_achievements,
    'cards_public', v_self or p.orbits_cards_public,
    'streak', case when v_self or p.orbits_show_achievements then jsonb_build_object('current', case when s.last_day >= v_today - 1 then s.current_streak else 0 end, 'best', coalesce(s.best_streak, 0)) else null end,
    'achievements', case when v_self or p.orbits_show_achievements then coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'description', a.description, 'icon', a.icon, 'image_key', a.image_key, 'tier', a.tier, 'category', a.category,
          'earned_at', u.earned_at, 'scope', u.scope, 'period', u.period, 'rank', u.rank) order by u.earned_at desc)
        from (select * from public.orbit_user_achievements where user_id = p.id order by earned_at desc limit 60) u join public.orbit_achievements a on a.id = u.achievement_id), '[]'::jsonb)
      else null end);
end $$;

create or replace function public.orbit_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid()); v_today date := public.orbit_today();
  v_week date := date_trunc('week', public.orbit_today()::timestamp)::date;
  s public.orbit_streaks%rowtype; v_alive int := 0; v_bonus jsonb := public._orbit_cfg('streak_bonus'); v_next int; v_next_bonus int;
  v_answered int; v_correct int; v_days int; v_helpful int; v_projects int; v_earned int;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into s from public.orbit_streaks where user_id = v_me;
  if found and s.last_day >= v_today - 1 then v_alive := s.current_streak; end if;
  select min(k::int) into v_next from jsonb_object_keys(v_bonus) k where k::int > v_alive;
  v_next_bonus := coalesce((v_bonus ->> v_next::text)::int, 0);
  select count(*), count(*) filter (where is_correct) into v_answered, v_correct from public.orbit_answers where user_id = v_me;
  select count(*) into v_days from public.orbit_streak_days where user_id = v_me and kind in ('post', 'helpful');
  select count(*) into v_helpful from public.orbit_ledger where user_id = v_me and kind = 'helpful_answer';
  select count(*) into v_projects from public.project_members where user_id = v_me;
  select coalesce(earned_total, 0) into v_earned from public.orbit_balances where user_id = v_me;
  return jsonb_build_object(
    'today', v_today,
    'balance', coalesce((select balance from public.orbit_balances where user_id = v_me), 0),
    'earned_today', greatest(coalesce((select sum(earned_amount) from public.orbit_ledger where user_id = v_me and day = v_today), 0), 0),
    'earned_week', greatest(coalesce((select sum(earned_amount) from public.orbit_ledger where user_id = v_me and day >= v_week), 0), 0),
    'week_days', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'earned', coalesce((select sum(l.earned_amount) from public.orbit_ledger l where l.user_id = v_me and l.day = d::date), 0),
                    'contributed', exists (select 1 from public.orbit_streak_days sd where sd.user_id = v_me and sd.day = d::date)) order by d)
                    from generate_series(v_today - 6, v_today, interval '1 day') d), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'amount', r.amount, 'created_at', r.created_at, 'reason', r.reason) order by r.created_at desc)
                    from (select * from public.orbit_ledger where user_id = v_me order by created_at desc, id desc limit 5) r), '[]'::jsonb),
    'checkin', jsonb_build_object('claimed_today', exists (select 1 from public.orbit_checkins where user_id = v_me and day = v_today), 'reward', public._orbit_num('checkin')),
    'streak', jsonb_build_object('current', v_alive, 'best', coalesce(s.best_streak, 0), 'last_day', s.last_day, 'contributed_today', coalesce(s.last_day = v_today, false),
                'next_milestone', v_next, 'next_bonus', v_next_bonus),
    'next_achievement', (
      select jsonb_build_object('id', a.id, 'title', a.title, 'icon', a.icon, 'image_key', a.image_key, 'progress', pr.p, 'target', (a.criteria->>'value')::int)
      from public.orbit_achievements a
      cross join lateral (select case a.criteria->>'type' when 'answered' then v_answered when 'correct' then v_correct when 'contribution_days' then v_days
                                  when 'streak' then coalesce(s.best_streak, 0) when 'helpful' then v_helpful when 'projects' then v_projects when 'earned' then v_earned else null end as p) pr
      where a.active and a.criteria->>'type' <> 'season' and pr.p is not null and pr.p < (a.criteria->>'value')::int
        and not exists (select 1 from public.orbit_user_achievements u where u.user_id = v_me and u.achievement_id = a.id and u.season_id is null)
      order by pr.p::numeric / (a.criteria->>'value')::int desc, a.sort_order limit 1),
    'rewards', jsonb_build_object('checkin', public._orbit_num('checkin'), 'participation', public._orbit_num('challenge_participation'),
                'correct', public._orbit_num('challenge_correct'), 'post', public._orbit_num('post'), 'helpful', public._orbit_num('helpful_answer'),
                'helpful_cap', public._orbit_num('helpful_daily_cap'), 'post_min_chars', public._orbit_num('post_min_chars'))
  );
end $$;

create or replace function public.orbit_take_celebrations() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_out jsonb;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  with t as (
    update public.orbit_user_achievements u set celebrated_at = now()
    from public.orbit_achievements a
    where u.user_id = v_me and u.celebrated_at is null and a.id = u.achievement_id and a.active
    returning u.id, u.earned_at, u.rank, u.scope, u.period, a.id as achievement_id, a.title, a.description, a.icon, a.image_key, a.tier, a.bonus, a.sort_order, a.category, (a.criteria->>'value')::int as target
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'achievement_id', t.achievement_id, 'title', t.title, 'description', t.description,
           'icon', t.icon, 'image_key', t.image_key, 'tier', t.tier, 'bonus', t.bonus, 'category', t.category, 'target', t.target, 'rank', t.rank, 'scope', t.scope, 'period', t.period, 'earned_at', t.earned_at)
           order by t.earned_at, t.sort_order), '[]'::jsonb) into v_out from t;
  return v_out;
end $$;

revoke execute on function public.orbit_admin_set_achievement_image(text, text) from public, anon;
grant execute on function public.orbit_admin_set_achievement_image(text, text) to authenticated;
revoke execute on function public.orbit_my_achievements(), public.orbit_profile_summary(text), public.orbit_overview(), public.orbit_take_celebrations() from public, anon;
grant execute on function public.orbit_my_achievements(), public.orbit_profile_summary(text), public.orbit_overview(), public.orbit_take_celebrations() to authenticated;

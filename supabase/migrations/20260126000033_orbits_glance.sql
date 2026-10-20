-- Orbits, presentation layer: a lean "at a glance" read for the header and the feed, and once-only celebrations.
--
-- * orbit_glance(): everything the header pill, the feed widget and the mobile strip show, in one cheap call (no ranking,
--   no history). The balance, streak and bonus state come from the same tables the Orbits page reads.
-- * orbit_user_achievements.celebrated_at: a badge is celebrated exactly once. orbit_take_celebrations() marks the member's
--   unacknowledged badges and returns them in one atomic statement, so two tabs (or a refresh) cannot celebrate it twice.
--   Badges that existed before this migration are marked as already seen: nobody gets a pile of old confetti.

alter table public.orbit_user_achievements add column if not exists celebrated_at timestamptz;
update public.orbit_user_achievements set celebrated_at = earned_at where celebrated_at is null;

create or replace function public.orbit_glance() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid()); v_today date := public.orbit_today();
  s public.orbit_streaks%rowtype; v_alive int := 0; v_bonus jsonb := public._orbit_cfg('streak_bonus'); v_next int; v_next_bonus int;
  cur record; v_has_q boolean := false; v_answered boolean := false;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into s from public.orbit_streaks where user_id = v_me;
  if found and s.last_day >= v_today - 1 then v_alive := s.current_streak; end if;
  select min(k::int) into v_next from jsonb_object_keys(v_bonus) k where k::int > v_alive;
  v_next_bonus := coalesce((v_bonus ->> v_next::text)::int, 0);
  select * into cur from public._orbit_current_question(v_me);
  if found then
    v_has_q := true;
    v_answered := exists (select 1 from public.orbit_answers where user_id = v_me and question_id = cur.id);
  end if;
  return jsonb_build_object(
    'at', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'balance', coalesce((select balance from public.orbit_balances where user_id = v_me), 0),
    'checkin', jsonb_build_object('claimed_today', exists (select 1 from public.orbit_checkins where user_id = v_me and day = v_today), 'reward', public._orbit_num('checkin')),
    'streak', jsonb_build_object('current', v_alive, 'best', coalesce(s.best_streak, 0), 'contributed_today', coalesce(s.last_day = v_today, false),
                'next_milestone', v_next, 'next_bonus', v_next_bonus),
    'challenge', case when v_has_q then jsonb_build_object('answered', v_answered, 'fallback', cur.fallback,
                'reward', public._orbit_num('challenge_participation') + public._orbit_num('challenge_correct')) else null end,
    'pending', (select count(*) from public.orbit_user_achievements u join public.orbit_achievements a on a.id = u.achievement_id
                where u.user_id = v_me and u.celebrated_at is null and a.active)
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
    returning u.id, u.earned_at, u.rank, u.scope, u.period, a.id as achievement_id, a.title, a.description, a.icon, a.tier, a.bonus, a.sort_order, a.category, (a.criteria->>'value')::int as target
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'achievement_id', t.achievement_id, 'title', t.title, 'description', t.description,
           'icon', t.icon, 'tier', t.tier, 'bonus', t.bonus, 'category', t.category, 'target', t.target, 'rank', t.rank, 'scope', t.scope, 'period', t.period, 'earned_at', t.earned_at)
           order by t.earned_at, t.sort_order), '[]'::jsonb) into v_out from t;
  return v_out;
end $$;

revoke execute on function public.orbit_glance(), public.orbit_take_celebrations() from public, anon;
grant execute on function public.orbit_glance(), public.orbit_take_celebrations() to authenticated;

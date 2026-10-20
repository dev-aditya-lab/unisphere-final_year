-- Orbits: "earned" means earned. A correction made by staff changes the balance (and is shown in the history) but is not an Orbit
-- the member earned, so it must not count toward "earned today", the weekly bars, leaderboards or the "Orbits earned" badges.
-- Before this, a +1000 correction showed as "+1,025 today" next to "20 this week", and moved a member 1,000 Orbits toward a badge.
--
-- orbit_ledger.earned_amount is the part of an entry that counts as earned, fixed when the entry is written:
--   manual_adjustment                       0   (a correction is not earning)
--   reversal of a manual_adjustment         0   (taking back a correction is not un-earning)
--   reversal of any reward                  its (negative) amount
--   every reward                            its amount
-- balance still equals the sum of amount; earned_total now equals the sum of earned_amount.

alter table public.orbit_ledger add column if not exists earned_amount integer;

create or replace function public.orbit_ledger_set_earned() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.earned_amount := case
    when new.kind = 'manual_adjustment' then 0
    when new.kind = 'reversal' and exists (select 1 from public.orbit_ledger o where o.id = new.reverses_id and o.kind = 'manual_adjustment') then 0
    else new.amount end;
  return new;
end $$;
drop trigger if exists trg_orbit_ledger_earned on public.orbit_ledger;
create trigger trg_orbit_ledger_earned before insert on public.orbit_ledger for each row execute function public.orbit_ledger_set_earned();

-- Backfill. The ledger is append-only for everyone; this one-off, run by the migration owner, fills the new column only.
alter table public.orbit_ledger disable trigger trg_orbit_ledger_no_change;
update public.orbit_ledger l set earned_amount = case
    when l.kind = 'manual_adjustment' then 0
    when l.kind = 'reversal' and exists (select 1 from public.orbit_ledger o where o.id = l.reverses_id and o.kind = 'manual_adjustment') then 0
    else l.amount end
  where l.earned_amount is null;
alter table public.orbit_ledger enable trigger trg_orbit_ledger_no_change;
alter table public.orbit_ledger alter column earned_amount set not null;

create or replace function public.orbit_ledger_apply() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- update first: an upsert would test the CHECK (balance >= 0) on the proposed new row, which is negative for a reversal
  update public.orbit_balances set balance = balance + new.amount, earned_total = greatest(earned_total + new.earned_amount, 0), updated_at = now()
  where user_id = new.user_id;
  if not found then
    insert into public.orbit_balances(user_id, balance, earned_total) values (new.user_id, new.amount, greatest(new.earned_amount, 0));
  end if;
  return null;
end $$;

update public.orbit_balances b set earned_total = coalesce((select greatest(sum(l.earned_amount), 0) from public.orbit_ledger l where l.user_id = b.user_id), 0);

-- Badges for "Orbits earned" that were only reached through a correction are taken back, with their bonus.
do $fix$
declare r record; v_take int;
begin
  for r in
    select u.id, u.user_id, u.achievement_id, a.bonus, l.id as ledger_id, l.amount as paid
    from public.orbit_user_achievements u
    join public.orbit_achievements a on a.id = u.achievement_id and a.criteria->>'type' = 'earned'
    left join public.orbit_ledger l on l.idempotency_key = 'ach:' || u.user_id || ':' || u.achievement_id
    where u.season_id is null
      and coalesce((select earned_total from public.orbit_balances b where b.user_id = u.user_id), 0) < (a.criteria->>'value')::int
  loop
    if r.ledger_id is not null and not exists (select 1 from public.orbit_ledger x where x.reverses_id = r.ledger_id) then
      v_take := least(r.paid, coalesce((select balance from public.orbit_balances b where b.user_id = r.user_id), 0));
      if v_take > 0 then
        insert into public.orbit_ledger(user_id, kind, amount, idempotency_key, day, source_type, source_id, reverses_id, reason)
        values (r.user_id, 'reversal', -v_take, 'rev:' || r.ledger_id, public.orbit_today(), 'achievement', r.achievement_id, r.ledger_id, 'Badge withdrawn: it was reached through a staff correction, not earned Orbits.');
      end if;
    end if;
    delete from public.orbit_user_achievements where id = r.id;
  end loop;
end $fix$;

create or replace function public._orbit_ranked(p_scope text, p_period text)
returns table (rank bigint, user_id uuid, score bigint, prev_rank bigint, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid()); v_today date := public.orbit_today(); v_from date; v_to date; v_college uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_scope not in ('global', 'college', 'connections') or p_period not in ('weekly', 'monthly', 'alltime') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  if p_period = 'weekly' then v_from := date_trunc('week', v_today::timestamp)::date; v_to := v_from + 6;
  elsif p_period = 'monthly' then v_from := date_trunc('month', v_today::timestamp)::date; v_to := (v_from + interval '1 month' - interval '1 day')::date; end if;
  select college_id into v_college from public.profiles where id = v_me;
  if p_scope = 'college' and v_college is null then return; end if;

  return query
  with eligible as (
    select p.id from public.profiles p
    where p.status = 'active' and p.orbits_on_leaderboard
      and public.can_view_profile(p.id, p.visibility, p.college_id, p.status)
      and (p_scope = 'global'
           or (p_scope = 'college' and p.college_id = v_college)
           or (p_scope = 'connections' and (p.id = v_me or exists (select 1 from public.connections c where c.user_a = least(p.id, v_me) and c.user_b = greatest(p.id, v_me)))))
  ),
  cur as (
    select e.id as uid, s.score, s.last_at from eligible e join lateral (
      select case when p_period = 'alltime' then (select b.earned_total::bigint from public.orbit_balances b where b.user_id = e.id)
                  else (select sum(l.earned_amount)::bigint from public.orbit_ledger l where l.user_id = e.id and l.day between v_from and v_to) end as score,
             (select max(l.created_at) from public.orbit_ledger l where l.user_id = e.id and l.earned_amount > 0) as last_at) s on true
    where s.score > 0
  ),
  prev as (
    select c.uid, case when p_period = 'alltime' then c.score - coalesce((select sum(l.earned_amount) from public.orbit_ledger l where l.user_id = c.uid and l.day = v_today), 0)
                       else c.score - coalesce((select sum(l.earned_amount) from public.orbit_ledger l where l.user_id = c.uid and l.day = v_today and l.day between v_from and v_to), 0) end as pscore,
           c.last_at
    from cur c
  ),
  r as (select c.uid, c.score, row_number() over (order by c.score desc, c.last_at asc, c.uid) as rk from cur c),
  pr as (select p.uid, row_number() over (order by p.pscore desc, p.last_at asc, p.uid) as rk from prev p where p.pscore > 0)
  select r.rk, r.uid, r.score, pr.rk, count(*) over () from r left join pr on pr.uid = r.uid order by r.rk;
end $$;

create or replace function public._orbit_finalize(p_season uuid, p_actor uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.orbit_seasons%rowtype; v_min int := public._orbit_num('min_group_size'); v_awarded int := 0; r record; v_ach text; v_bonus int;
begin
  select * into s from public.orbit_seasons where id = p_season for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if s.status <> 'active' then raise exception 'already_finalized' using errcode = '22023'; end if;
  if s.ends_on >= public.orbit_today() then raise exception 'season_not_ended' using errcode = '22023'; end if;

  drop table if exists _sc;
  create temporary table _sc on commit drop as
    select l.user_id as uid, sum(l.earned_amount)::int as score, max(l.created_at) as last_at, p.college_id
    from public.orbit_ledger l join public.profiles p on p.id = l.user_id
    where l.day between s.starts_on and s.ends_on and p.status = 'active' and p.orbits_on_leaderboard
    group by l.user_id, p.college_id having sum(l.earned_amount) > 0;

  insert into public.orbit_season_results(season_id, scope, scope_ref, user_id, rank, score, group_size)
  select p_season, 'global', '00000000-0000-0000-0000-000000000000', x.uid, x.rk, x.score, x.n from (
    select uid, score, row_number() over (order by score desc, last_at, uid) rk, count(*) over () n from _sc) x where x.rk <= 10;

  insert into public.orbit_season_results(season_id, scope, scope_ref, user_id, rank, score, group_size)
  select p_season, 'college', x.college_id, x.uid, x.rk, x.score, x.n from (
    select uid, score, college_id, row_number() over (partition by college_id order by score desc, last_at, uid) rk, count(*) over (partition by college_id) n
    from _sc where college_id is not null) x where x.rk <= 10 and x.n >= v_min;

  insert into public.orbit_season_results(season_id, scope, scope_ref, user_id, rank, score, group_size)
  select p_season, 'connections', u.uid, u.uid, 1 + count(*) filter (where n.score > u.score or (n.score = u.score and (n.last_at < u.last_at or (n.last_at = u.last_at and n.uid < u.uid)))),
         u.score, 1 + count(n.uid)
  from _sc u
  left join (select user_a as a, user_b as b from public.connections union all select user_b, user_a from public.connections) e on e.a = u.uid
  left join _sc n on n.uid = e.b
  group by u.uid, u.score, u.last_at
  having 1 + count(n.uid) >= v_min and 1 + count(*) filter (where n.score > u.score or (n.score = u.score and (n.last_at < u.last_at or (n.last_at = u.last_at and n.uid < u.uid)))) <= 10;

  for r in select * from public.orbit_season_results where season_id = p_season loop
    v_ach := case r.scope when 'global' then 'rank_global_top10' when 'college' then 'rank_college_top10' else 'rank_connections_top10' end;
    insert into public.orbit_user_achievements(user_id, achievement_id, season_id, scope, period, rank, score, criteria_version)
    values (r.user_id, v_ach, p_season, r.scope, s.name, r.rank, r.score, 1) on conflict do nothing;
    if found then
      v_awarded := v_awarded + 1;
      select bonus into v_bonus from public.orbit_achievements where id = v_ach;
      perform public._orbit_award(r.user_id, 'achievement', v_bonus, 'ach:' || r.user_id || ':' || v_ach || ':' || p_season, 'season', p_season::text, public.orbit_today());
    end if;
    if r.scope = 'global' and r.rank = 1 then
      insert into public.orbit_user_achievements(user_id, achievement_id, season_id, scope, period, rank, score, criteria_version)
      values (r.user_id, 'season_champion', p_season, 'global', s.name, 1, r.score, 1) on conflict do nothing;
      if found then
        select bonus into v_bonus from public.orbit_achievements where id = 'season_champion';
        perform public._orbit_award(r.user_id, 'achievement', v_bonus, 'ach:' || r.user_id || ':season_champion:' || p_season, 'season', p_season::text, public.orbit_today());
      end if;
    end if;
  end loop;
  update public.orbit_seasons set status = 'finalized', finalized_at = now(), finalized_by = p_actor where id = p_season;
  perform public.write_audit_log(p_actor, 'orbits.season_finalized', 'orbit_season', p_season::text, null, jsonb_build_object('badges', v_awarded));
  return jsonb_build_object('badges', v_awarded);
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
      select jsonb_build_object('id', a.id, 'title', a.title, 'icon', a.icon, 'progress', pr.p, 'target', (a.criteria->>'value')::int)
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

create or replace function public.orbit_admin_suspicious(p_days integer default 7)
returns table (user_id uuid, username text, earned bigint, entries bigint, best_day_earned bigint, posts_rewarded bigint, flagged boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_from date := public.orbit_today() - (least(greatest(p_days, 1), 60) - 1); v_limit int := public._orbit_num('suspicious_daily_orbits');
begin
  perform public._orbit_admin('orbits.ledger');
  return query
    select s.uid, p.username, s.earned, s.entries, s.best, s.posts, (s.best >= v_limit)
    from (select l.user_id as uid, sum(l.earned_amount) filter (where l.earned_amount > 0) as earned, count(*) as entries,
                 max(d.day_sum) as best, count(*) filter (where l.kind = 'post') as posts
          from public.orbit_ledger l
          join lateral (select sum(x.earned_amount) filter (where x.earned_amount > 0) as day_sum from public.orbit_ledger x where x.user_id = l.user_id and x.day = l.day) d on true
          where l.day >= v_from group by l.user_id) s
    join public.profiles p on p.id = s.uid
    order by (s.best >= v_limit) desc, s.earned desc nulls last limit 25;
end $$;

revoke execute on function public.orbit_ledger_set_earned(), public.orbit_ledger_apply(), public._orbit_ranked(text, text), public._orbit_finalize(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.orbit_overview(), public.orbit_admin_suspicious(integer) from public, anon;
grant execute on function public.orbit_overview(), public.orbit_admin_suspicious(integer) to authenticated;

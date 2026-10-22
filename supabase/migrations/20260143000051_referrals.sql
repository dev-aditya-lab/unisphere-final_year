-- 0051: Refer & Earn
--
-- One referral = one invited person who joins UniSphere through a member's link and then becomes an active member.
-- The referrer earns exactly 100 Orbits, once, through the EXISTING Orbits ledger. Nothing here trusts the browser:
-- the link only names a code; every relationship, every qualification condition and the reward itself are decided by
-- the functions below, inside one transaction, under a row lock, with a unique idempotency key.
--
--   1. Reward-source rules (orbit_reward_sources) and badge isolation. A source says whether the Orbits it pays count toward
--      badges and other activity-based milestones. Referral Orbits count toward the balance and the leaderboards but not
--      toward badges, "Orbits earned" badges or season (Elite) badges.
--   2. referral_codes / referrals / referral_events: codes, the state machine, an audit trail of every transition.
--   3. Qualification: email confirmed + onboarding done + recognised Orbits activity on N different days, within the window.
--   4. Referral leaderboard (weekly/all time, IST weeks like the Orbits board), the member dashboard read.
--   5. Reminder prompt state (per member, so the cooldown works across devices) and the one-time launch announcement.
--   6. Administration: metrics, search, evidence, review of held referrals, reversal with a compensating entry, settings.
--
-- Referral state machine (referrals.status):
--   registered ──▶ pending_qualification ──▶ rewarded ──▶ reversed
--        │                  │                  ▲
--        │                  └──▶ flagged ──────┘ (admin approves)   flagged ──▶ rejected (admin)
--        └──────────────────────▶ expired (qualification window ended)
-- "Qualified" is the instant of the transition to rewarded: qualification and the ledger entry are one atomic step.
-- A visitor who has only opened a link has no database row at all ("pending signup" lives in a cookie, never a reward).

-- ═══════════════ 1. Reward-source rules and badge isolation ═══════════════
create table public.orbit_reward_sources (
  kind text primary key,
  counts_for_badges boolean not null,
  description text not null
);
comment on table public.orbit_reward_sources is
  'Which ledger kinds count toward badge progress, Orbits-earned badges and season (Elite) badges. Every kind is listed on purpose; a kind that is not listed counts for nothing.';
insert into public.orbit_reward_sources(kind, counts_for_badges, description) values
  ('checkin', true, 'Daily Orbit Bonus'),
  ('challenge_participation', true, 'Answered the Daily Challenge'),
  ('challenge_correct', true, 'Correct Daily Challenge answer'),
  ('post', true, 'Eligible post'),
  ('helpful_answer', true, 'Helpful answer'),
  ('streak_milestone', true, 'Streak milestone bonus'),
  ('achievement', true, 'Badge bonus'),
  ('manual_adjustment', false, 'Staff correction (never earned)'),
  ('referral', false, 'Refer & Earn: counts for the balance and leaderboards, not for badges or milestones');
alter table public.orbit_reward_sources enable row level security;
grant select on public.orbit_reward_sources to authenticated;
create policy orbit_reward_sources_read on public.orbit_reward_sources for select to authenticated using (true);

alter table public.orbit_ledger drop constraint if exists orbit_ledger_kind_check;
alter table public.orbit_ledger add constraint orbit_ledger_kind_check check (kind in ('checkin', 'challenge_participation', 'challenge_correct', 'post',
  'helpful_answer', 'streak_milestone', 'achievement', 'manual_adjustment', 'reversal', 'referral'));

-- badge_amount: the part of an entry that counts toward badges. Fixed when the entry is written, like earned_amount.
alter table public.orbit_ledger add column if not exists badge_amount integer;
alter table public.orbit_balances add column if not exists badge_earned_total integer not null default 0 check (badge_earned_total >= 0);

create or replace function public.orbit_ledger_set_earned() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_source text;
begin
  new.earned_amount := case
    when new.kind = 'manual_adjustment' then 0
    when new.kind = 'reversal' and exists (select 1 from public.orbit_ledger o where o.id = new.reverses_id and o.kind = 'manual_adjustment') then 0
    else new.amount end;
  -- A reversal follows the source of the entry it takes back.
  v_source := case when new.kind = 'reversal' then (select o.kind from public.orbit_ledger o where o.id = new.reverses_id) else new.kind end;
  new.badge_amount := case when coalesce((select s.counts_for_badges from public.orbit_reward_sources s where s.kind = v_source), false) then new.earned_amount else 0 end;
  return new;
end $$;

-- Backfill (no referral rows exist yet, so every existing entry counts for badges exactly as it did). Same one-off pattern as 0034.
alter table public.orbit_ledger disable trigger trg_orbit_ledger_no_change;
update public.orbit_ledger l set badge_amount = case when coalesce((select s.counts_for_badges from public.orbit_reward_sources s
    where s.kind = case when l.kind = 'reversal' then (select o.kind from public.orbit_ledger o where o.id = l.reverses_id) else l.kind end), false) then l.earned_amount else 0 end
  where l.badge_amount is null;
alter table public.orbit_ledger enable trigger trg_orbit_ledger_no_change;
alter table public.orbit_ledger alter column badge_amount set not null;
update public.orbit_balances b set badge_earned_total = coalesce((select greatest(sum(l.badge_amount), 0) from public.orbit_ledger l where l.user_id = b.user_id), 0);

create or replace function public.orbit_ledger_apply() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- update first: an upsert would test the CHECK (balance >= 0) on the proposed new row, which is negative for a reversal
  update public.orbit_balances set balance = balance + new.amount, earned_total = greatest(earned_total + new.earned_amount, 0),
         badge_earned_total = greatest(badge_earned_total + new.badge_amount, 0), updated_at = now()
  where user_id = new.user_id;
  if not found then
    -- The first entries of a brand-new member can arrive in parallel (two tabs, two events): the loser of the race adds to the row
    -- the winner just created instead of failing on the primary key. (A first entry is always positive, so the CHECK holds.)
    insert into public.orbit_balances(user_id, balance, earned_total, badge_earned_total) values (new.user_id, new.amount, greatest(new.earned_amount, 0), greatest(new.badge_amount, 0))
    on conflict (user_id) do update set balance = public.orbit_balances.balance + excluded.balance,
      earned_total = public.orbit_balances.earned_total + excluded.earned_total,
      badge_earned_total = public.orbit_balances.badge_earned_total + excluded.badge_earned_total, updated_at = now();
  end if;
  return null;
end $$;

-- Badge progress reads badge_earned_total (not earned_total, which also feeds the leaderboards).
create or replace function public._orbit_check_achievements(p_user uuid) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_answered int; v_correct int; v_days int; v_best int; v_helpful int; v_projects int; v_earned int;
  d record; v_value int; v_ok boolean; v_new uuid;
begin
  select count(*), count(*) filter (where is_correct) into v_answered, v_correct from public.orbit_answers where user_id = p_user;
  select count(*) into v_days from public.orbit_streak_days where user_id = p_user and kind in ('post', 'helpful');
  select coalesce(best_streak, 0) into v_best from public.orbit_streaks where user_id = p_user;
  select count(*) into v_helpful from public.orbit_ledger where user_id = p_user and kind = 'helpful_answer';
  select count(*) into v_projects from public.project_members where user_id = p_user;
  select coalesce(badge_earned_total, 0) into v_earned from public.orbit_balances where user_id = p_user;
  v_best := coalesce(v_best, 0); v_earned := coalesce(v_earned, 0);
  for d in
    select a.* from public.orbit_achievements a
    where a.active and a.criteria->>'type' <> 'season'
      and not exists (select 1 from public.orbit_user_achievements u where u.user_id = p_user and u.achievement_id = a.id and u.season_id is null)
  loop
    v_value := (d.criteria->>'value')::int;
    v_ok := case d.criteria->>'type'
      when 'answered' then v_answered >= v_value
      when 'correct' then v_correct >= v_value
      when 'contribution_days' then v_days >= v_value
      when 'streak' then v_best >= v_value
      when 'helpful' then v_helpful >= v_value
      when 'projects' then v_projects >= v_value
      when 'earned' then v_earned >= v_value
      else false end;
    if v_ok then
      insert into public.orbit_user_achievements(user_id, achievement_id, criteria_version) values (p_user, d.id, d.criteria_version)
      on conflict do nothing returning id into v_new;
      if v_new is not null and d.bonus > 0 then
        perform public._orbit_award(p_user, 'achievement', d.bonus, 'ach:' || p_user || ':' || d.id, 'achievement', d.id);
      end if;
      v_new := null;
    end if;
  end loop;
end $$;

-- Season (Elite) badges rank members by badge_amount: referral Orbits do not buy a ranking badge.
create or replace function public._orbit_finalize(p_season uuid, p_actor uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.orbit_seasons%rowtype; v_min int := public._orbit_num('min_group_size'); v_awarded int := 0; r record; v_ach text; v_bonus int;
begin
  select * into s from public.orbit_seasons where id = p_season for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if s.status <> 'active' then raise exception 'already_finalized' using errcode = '22023'; end if;
  if s.ends_on >= public.orbit_today() then raise exception 'season_not_ended' using errcode = '22023'; end if;

  drop table if exists _sc;
  create temporary table _sc on commit drop as
    select l.user_id as uid, sum(l.badge_amount)::int as score, max(l.created_at) as last_at, p.college_id
    from public.orbit_ledger l join public.profiles p on p.id = l.user_id
    where l.day between s.starts_on and s.ends_on and p.status = 'active' and p.orbits_on_leaderboard
    group by l.user_id, p.college_id having sum(l.badge_amount) > 0;

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

-- The "next badge" progress on the Orbits page reads the badge total too.
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
  select coalesce(badge_earned_total, 0) into v_earned from public.orbit_balances where user_id = v_me;
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

-- Referral rewards are reviewed in their own queue, so one of them does not put a member on the "suspicious earning" list.
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
          join lateral (select sum(x.earned_amount) filter (where x.earned_amount > 0 and x.kind <> 'referral') as day_sum from public.orbit_ledger x where x.user_id = l.user_id and x.day = l.day) d on true
          where l.day >= v_from and l.kind <> 'referral' group by l.user_id) s
    join public.profiles p on p.id = s.uid
    order by (s.best >= v_limit) desc, s.earned desc nulls last limit 25;
end $$;

-- A referral reward is taken back through the referral review (it must also update the referral record).
create or replace function public.orbit_admin_reverse(p_entry uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.ledger'); r public.orbit_ledger%rowtype; v_bal int; v_take int; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.orbit_ledger where id = p_entry;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.kind = 'referral' then raise exception 'use_referral_review' using errcode = '22023'; end if;
  if r.amount <= 0 or r.kind = 'reversal' then raise exception 'not_reversible' using errcode = '22023'; end if;
  if exists (select 1 from public.orbit_ledger where reverses_id = r.id) then raise exception 'already_reversed' using errcode = '22023'; end if;
  select balance into v_bal from public.orbit_balances where user_id = r.user_id;
  v_take := least(r.amount, coalesce(v_bal, 0));
  if v_take <= 0 then raise exception 'nothing_to_remove' using errcode = '22023'; end if;
  insert into public.orbit_ledger(user_id, kind, amount, idempotency_key, day, source_type, source_id, reverses_id, reason, created_by)
  values (r.user_id, 'reversal', -v_take, 'rev:' || r.id, public.orbit_today(), r.source_type, r.source_id, r.id, left(v_reason, 500), v_actor);
  perform public.write_audit_log(v_actor, 'orbits.reversal', 'user', r.user_id::text, null, jsonb_build_object('entry', r.id, 'amount', -v_take, 'reason', left(v_reason, 200)));
  return jsonb_build_object('amount', -v_take, 'balance', coalesce((select balance from public.orbit_balances where user_id = r.user_id), 0));
end $$;

-- ═══════════════ 2. Notification categories for the feature ═══════════════
-- rewards:    "a friend you invited is active, you earned Orbits" (transactional, in-app, optional email)
-- promotions: one-time announcements such as the launch of Refer & Earn (in-app only, never email or push)
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check
  check (category in ('social', 'connections', 'projects', 'mentorship', 'messages', 'events', 'moderation', 'announcements', 'rewards', 'promotions'));

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
    else 'social' end;
$$;

-- ═══════════════ 3. Settings (configurable without a deploy) ═══════════════
create table public.referral_settings (
  key text primary key,
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.referral_settings(key, value, description) values
  ('program_enabled', 'true', 'Master switch. Off: no new attributions and no new rewards; existing records are kept.'),
  ('attribution_days', '30', 'How long a device remembers an invite link before the person signs up.'),
  ('qualify_days', '30', 'Days a newly registered person has to become active before the referral expires.'),
  ('activation_days', '2', 'Different days on which the referred member must have recognised Orbits activity.'),
  ('daily_referrer_cap', '10', 'Rewards one member can earn in 24 hours; further ones wait for review instead of being paid.'),
  ('ip_cluster_threshold', '3', 'Referrals by one member that share a signup network which raise an abuse signal (signal only, never a penalty).'),
  ('popup_enabled', 'true', 'Show the occasional Refer & Earn reminder.'),
  ('popup_frequency_days', '7', 'Minimum days between two reminders for one member.'),
  ('popup_max_dismissals', '3', 'After this many dismissals the reminder is never shown again to that member.'),
  ('popup_min_account_days', '2', 'Days after onboarding before the first reminder may appear.'),
  ('campaign_enabled', 'false', 'Launch announcement: when on, the worker sends it once to each eligible member (in-app only).'),
  ('campaign_key', '"referral-launch-1"', 'Identifies the announcement. A new key is a new announcement; the same key is never sent twice to anyone.'),
  ('campaign_title', '"Invite friends. Earn 100 Orbits."', 'Announcement title (80 characters at most).'),
  ('campaign_body', '"Share your invite link. When a friend joins and becomes an active member, you earn 100 Orbits."', 'Announcement text (240 characters at most).');
alter table public.referral_settings enable row level security;

create or replace function public._referral_cfg(p_key text) returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.referral_settings where key = p_key $$;
create or replace function public._referral_num(p_key text) returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.referral_settings where key = p_key), 0) $$;
create or replace function public._referral_flag(p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.referral_settings where key = p_key), false) $$;

-- ═══════════════ 4. Codes, referrals, events ═══════════════
create table public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  -- set null when the invited person deletes their account: the count stays, their identity does not
  referred_id uuid unique references public.profiles(id) on delete set null,
  status text not null default 'registered'
    check (status in ('registered', 'pending_qualification', 'flagged', 'rewarded', 'rejected', 'expired', 'reversed')),
  registered_at timestamptz not null default now(),
  qualify_by timestamptz not null,
  qualified_at timestamptz,
  qualified_day date,
  reward_amount integer check (reward_amount is null or reward_amount = 100),
  reward_ledger_id uuid references public.orbit_ledger(id) on delete set null,
  idempotency_key text not null unique,
  net_hash text,
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) <= 500),
  reversal_ledger_id uuid references public.orbit_ledger(id) on delete set null,
  reversal_shortfall integer check (reversal_shortfall is null or reversal_shortfall >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referred_id is null or referred_id <> referrer_id),
  check ((status in ('rewarded', 'reversed')) = (qualified_at is not null))
);
create index referrals_referrer_idx on public.referrals(referrer_id, status);
create index referrals_board_idx on public.referrals(qualified_day, referrer_id) where status = 'rewarded';
create index referrals_alltime_idx on public.referrals(referrer_id, qualified_at) where status = 'rewarded';
create index referrals_open_idx on public.referrals(qualify_by) where status in ('registered', 'pending_qualification');
create index referrals_status_idx on public.referrals(status, created_at desc, id);
create index referrals_net_idx on public.referrals(referrer_id, net_hash) where net_hash is not null;
create trigger trg_referrals_updated before update on public.referrals for each row execute function public.set_updated_at();
alter table public.referrals enable row level security;

-- Append-only trail of every transition and every refused attribution (abuse monitoring). No personal data beyond ids.
create table public.referral_events (
  id bigint generated always as identity primary key,
  referral_id uuid references public.referrals(id) on delete cascade,
  referrer_id uuid references public.profiles(id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index referral_events_referral_idx on public.referral_events(referral_id, id);
create index referral_events_kind_idx on public.referral_events(kind, created_at desc);
alter table public.referral_events enable row level security;

-- No member can read or write these tables directly: everything goes through the functions below, which check who is asking.
revoke all on public.referral_settings, public.referral_codes, public.referrals, public.referral_events from anon, authenticated;

create or replace function public._referral_event(p_referral uuid, p_referrer uuid, p_kind text, p_detail jsonb default '{}'::jsonb, p_actor uuid default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.referral_events(referral_id, referrer_id, kind, detail, actor_id) values (p_referral, p_referrer, p_kind, coalesce(p_detail, '{}'::jsonb), p_actor) $$;

-- A code a person can say out loud: their username, a hyphen and a 4-character random suffix, e.g. aditya-k7m2. The username part is
-- what makes it easy to remember; the suffix (31 unambiguous symbols, no 0/o/1/i/l, about 920,000 combinations per username, from the
-- database's CSPRNG) is what makes it unguessable: knowing someone's username is not enough to build their code, and the lookup is
-- rate limited. Unique across members, stable once created (a later username change does not break links already shared).
create or replace function public._referral_new_code(p_username text) returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_base text := left(regexp_replace(lower(coalesce(p_username, '')), '[^a-z0-9_-]', '', 'g'), 30);
  v_bytes bytea; v_out text := ''; i int;
begin
  if char_length(v_base) < 3 then v_base := 'member'; end if;
  -- bytes 10..15 of a version-4 uuid are fully random (the version and variant bits sit in bytes 6 and 8)
  v_bytes := substring(decode(replace(gen_random_uuid()::text, '-', ''), 'hex') from 11 for 6);
  for i in 0..3 loop v_out := v_out || substr(v_alpha, (get_byte(v_bytes, i) % 31) + 1, 1); end loop;
  return v_base || '-' || v_out;
end $$;

-- The member's own code, created on first use.
create or replace function public.referral_my_code() returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_code text; n int := 0;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select code into v_code from public.referral_codes where user_id = v_me;
  if v_code is not null then return v_code; end if;
  if not exists (select 1 from public.profiles where id = v_me and status = 'active' and onboarded_at is not null) then raise exception 'account_restricted' using errcode = '42501'; end if;
  loop
    n := n + 1;
    begin
      insert into public.referral_codes(user_id, code) values (v_me, public._referral_new_code((select username from public.profiles where id = v_me))) on conflict (user_id) do nothing;
      select code into v_code from public.referral_codes where user_id = v_me;
      return v_code;
    exception when unique_violation then
      if n >= 8 then raise; end if;
    end;
  end loop;
end $$;

-- Attribution at sign-up. Service role only: the sign-up action calls it right after the account was created.
create or replace function public.referral_attribute(p_referred uuid, p_code text, p_net_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(btrim(coalesce(p_code, ''))); v_referrer uuid; v_created timestamptz; v_id uuid; v_recent int;
begin
  if not public._referral_flag('program_enabled') then return jsonb_build_object('attributed', false, 'reason', 'disabled'); end if;
  if v_code !~ '^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$' then
    perform public._referral_event(null, null, 'attribution_rejected', jsonb_build_object('reason', 'invalid_code'));
    return jsonb_build_object('attributed', false, 'reason', 'invalid_code');
  end if;
  select user_id into v_referrer from public.referral_codes where code = v_code;
  if v_referrer is null then
    perform public._referral_event(null, null, 'attribution_rejected', jsonb_build_object('reason', 'unknown_code'));
    return jsonb_build_object('attributed', false, 'reason', 'invalid_code');
  end if;
  if v_referrer = p_referred then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'self_referral'));
    return jsonb_build_object('attributed', false, 'reason', 'self_referral');
  end if;
  select created_at into v_created from public.profiles where id = p_referred;
  -- only a brand-new account can be attributed: an existing member cannot be "referred" after the fact
  if v_created is null or v_created < now() - interval '2 hours' then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'not_new'));
    return jsonb_build_object('attributed', false, 'reason', 'not_new');
  end if;
  if not exists (select 1 from public.profiles where id = v_referrer and status = 'active') then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'referrer_unavailable'));
    return jsonb_build_object('attributed', false, 'reason', 'referrer_unavailable');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('referral-attr:' || v_referrer::text, 0));
  select count(*) into v_recent from public.referrals where referrer_id = v_referrer and created_at > now() - interval '24 hours';
  if v_recent >= 50 then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'referrer_rate_limited'));
    return jsonb_build_object('attributed', false, 'reason', 'rate_limited');
  end if;
  insert into public.referrals(referrer_id, referred_id, qualify_by, idempotency_key, net_hash)
  values (v_referrer, p_referred, now() + make_interval(days => greatest(public._referral_num('qualify_days'), 1)), 'referral:' || p_referred::text, nullif(left(p_net_hash, 64), ''))
  on conflict (referred_id) do nothing returning id into v_id;
  if v_id is null then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'already_attributed'));
    return jsonb_build_object('attributed', false, 'reason', 'already_attributed');
  end if;
  perform public._referral_event(v_id, v_referrer, 'registered');
  return jsonb_build_object('attributed', true, 'referral_id', v_id);
end $$;

-- What the sign-up page shows when it arrives with a code: only whether it is usable and the inviter's display name.
create or replace function public.referral_preview(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_code text := lower(btrim(coalesce(p_code, ''))); v_name text;
begin
  if not public._referral_flag('program_enabled') or v_code !~ '^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$' then return jsonb_build_object('valid', false); end if;
  select p.full_name into v_name from public.referral_codes c join public.profiles p on p.id = c.user_id where c.code = v_code and p.status = 'active';
  if v_name is null then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'name', v_name);
end $$;

-- ═══════════════ 5. Qualification and the reward ═══════════════
-- The one place a reward is paid. Locks the referral row, re-checks its state, writes the ledger entry under a unique key and
-- marks the referral rewarded, in the caller's transaction. Called by the evaluator and by an administrator's approval.
create or replace function public._referral_credit(p_id uuid, p_actor uuid, p_signals jsonb default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r public.referrals%rowtype; v_ledger uuid;
begin
  select * into r from public.referrals where id = p_id for update;
  if not found or r.status not in ('registered', 'pending_qualification', 'flagged') then return false; end if;
  insert into public.orbit_ledger(user_id, kind, amount, idempotency_key, day, source_type, source_id, created_by)
  values (r.referrer_id, 'referral', 100, r.idempotency_key, public.orbit_today(), 'referral', r.id::text, p_actor)
  on conflict (idempotency_key) do nothing returning id into v_ledger;
  if v_ledger is null then select id into v_ledger from public.orbit_ledger where idempotency_key = r.idempotency_key; end if;
  update public.referrals set status = 'rewarded', qualified_at = now(), qualified_day = public.orbit_today(), reward_amount = 100, reward_ledger_id = v_ledger,
         signals = coalesce(p_signals, signals), reviewed_by = coalesce(p_actor, reviewed_by), reviewed_at = case when p_actor is null then reviewed_at else now() end
   where id = r.id;
  perform public._referral_event(r.id, r.referrer_id, 'rewarded', jsonb_build_object('amount', 100), p_actor);
  perform public.notify(r.referrer_id, 'referral_reward', null, 'referral', r.id, jsonb_build_object('amount', 100), 'referral-reward:' || r.id);
  return true;
end $$;

-- Decides whether a referred member has qualified, and pays the reward if so. Idempotent and safe to call any number of times.
-- Qualification rule (all must hold, each checked here and nowhere else):
--   1. the referral is still open (registered / pending_qualification) and inside its qualify_by window;
--   2. the invited account's email is confirmed, it is active and has finished onboarding;
--   3. it has recognised Orbits activity (daily bonus, challenge answer, eligible post, helpful answer) on at least
--      `activation_days` different days (IST);
--   4. the referrer's account is in good standing and the program is on.
-- A referrer who would exceed `daily_referrer_cap` rewards in 24 hours has the further referrals held as `flagged` for review.
create or replace function public._referral_evaluate(p_referred uuid) returns text language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals%rowtype; v_need int := greatest(public._referral_num('activation_days'), 1); v_days int; v_cap int := public._referral_num('daily_referrer_cap');
  v_thr int := public._referral_num('ip_cluster_threshold'); v_recent int; v_shared int; v_signals jsonb := '[]'::jsonb;
begin
  select * into r from public.referrals where referred_id = p_referred and status in ('registered', 'pending_qualification') for update;
  if not found then return null; end if;
  if not public._referral_flag('program_enabled') then return 'program_disabled'; end if;
  if now() > r.qualify_by then
    update public.referrals set status = 'expired' where id = r.id;
    perform public._referral_event(r.id, r.referrer_id, 'expired');
    return 'expired';
  end if;
  if not coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = p_referred), false) then return 'waiting_email'; end if;
  if not coalesce((select p.onboarded_at is not null and p.status = 'active' from public.profiles p where p.id = p_referred), false) then return 'waiting_onboarding'; end if;
  select count(distinct l.day) into v_days from public.orbit_ledger l
    where l.user_id = p_referred and l.kind in ('checkin', 'challenge_participation', 'post', 'helpful_answer');
  if v_days < v_need then
    if r.status = 'registered' then
      update public.referrals set status = 'pending_qualification' where id = r.id;
      perform public._referral_event(r.id, r.referrer_id, 'pending_qualification');
    end if;
    return 'pending';
  end if;
  if not exists (select 1 from public.profiles where id = r.referrer_id and status = 'active') then return 'referrer_unavailable'; end if;

  -- Abuse signals are recorded for a human to look at; only the 24-hour cap holds a reward back.
  perform pg_advisory_xact_lock(hashtextextended('referral-pay:' || r.referrer_id::text, 0));
  if r.net_hash is not null and v_thr > 1 then
    select count(*) into v_shared from public.referrals x
      where x.referrer_id = r.referrer_id and x.id <> r.id and x.net_hash = r.net_hash and x.status in ('registered', 'pending_qualification', 'flagged', 'rewarded');
    if v_shared + 1 >= v_thr then v_signals := v_signals || '["shared_network"]'::jsonb; end if;
  end if;
  select count(*) into v_recent from public.referrals where referrer_id = r.referrer_id and status = 'rewarded' and qualified_at > now() - interval '24 hours';
  if v_cap > 0 and v_recent >= v_cap then
    update public.referrals set status = 'flagged', signals = v_signals || '["velocity"]'::jsonb where id = r.id;
    perform public._referral_event(r.id, r.referrer_id, 'flagged', jsonb_build_object('reason', 'velocity', 'rewards_24h', v_recent));
    return 'flagged';
  end if;
  perform public._referral_credit(r.id, null, v_signals);
  return 'rewarded';
end $$;

-- Re-evaluate whenever the invited member earns recognised Orbits activity. A failure here never blocks what they were doing.
create or replace function public._referral_on_ledger() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public._referral_evaluate(new.user_id);
  exception when others then
    raise warning 'referral evaluation failed for %: %', new.user_id, sqlerrm;
  end;
  return null;
end $$;
create trigger trg_referral_on_ledger after insert on public.orbit_ledger for each row
  when (new.kind in ('checkin', 'challenge_participation', 'post', 'helpful_answer')) execute function public._referral_on_ledger();

-- ...and when onboarding finishes (activity can come first).
create or replace function public._referral_on_onboarded() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public._referral_evaluate(new.id);
  exception when others then
    raise warning 'referral evaluation failed for %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
create trigger trg_referral_on_onboarded after update of onboarded_at on public.profiles for each row
  when (old.onboarded_at is null and new.onboarded_at is not null) execute function public._referral_on_onboarded();

-- ═══════════════ 6. Member reads ═══════════════
create or replace function public.referral_overview() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'enabled', public._referral_flag('program_enabled'),
    'code', (select code from public.referral_codes where user_id = v_me),
    'reward', 100,
    'activation_days', public._referral_num('activation_days'),
    'qualify_days', public._referral_num('qualify_days'),
    'attribution_days', public._referral_num('attribution_days'),
    'successful', (select count(*) from public.referrals where referrer_id = v_me and status = 'rewarded'),
    'pending', (select count(*) from public.referrals where referrer_id = v_me and status in ('registered', 'pending_qualification', 'flagged')),
    'orbits_earned', coalesce((select sum(amount) from public.orbit_ledger where user_id = v_me and source_type = 'referral'), 0),
    -- no names, usernames or any detail about the invited people: a status and a date
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', case x.status when 'flagged' then 'pending_qualification' when 'rejected' then 'expired' else x.status end,
                  'at', coalesce(x.qualified_at, x.registered_at)) order by coalesce(x.qualified_at, x.registered_at) desc)
                from (select * from public.referrals where referrer_id = v_me order by coalesce(qualified_at, registered_at) desc, id limit 8) x), '[]'::jsonb));
end $$;

-- Ranking: qualified, non-reversed referrals. Weekly uses the same IST Monday-Sunday weeks as the Orbits board. Ties go to whoever
-- reached the count first, then the user id. Members who opted out of leaderboards or cannot be viewed by the caller are left out.
create or replace function public._referral_ranked(p_period text)
returns table (rank bigint, user_id uuid, score bigint, total bigint) language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_today date := public.orbit_today(); v_from date; v_to date;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_period not in ('weekly', 'alltime') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  if p_period = 'weekly' then v_from := date_trunc('week', v_today::timestamp)::date; v_to := v_from + 6; end if;
  return query
  with agg as (
    select r.referrer_id as uid, count(*) as score, max(r.qualified_at) as last_at
    from public.referrals r
    where r.status = 'rewarded' and (p_period = 'alltime' or r.qualified_day between v_from and v_to)
    group by r.referrer_id
  ),
  ok as (
    select a.uid, a.score, a.last_at from agg a join public.profiles p on p.id = a.uid
    where p.status = 'active' and p.orbits_on_leaderboard and public.can_view_profile(p.id, p.visibility, p.college_id, p.status)
  )
  select row_number() over (order by o.score desc, o.last_at asc, o.uid), o.uid, o.score, count(*) over () from ok o;
end $$;

create or replace function public.referral_leaderboard(p_period text, p_limit integer default 20, p_offset integer default 0)
returns table (rank bigint, user_id uuid, username text, full_name text, avatar_key text, score bigint, total bigint, in_progress boolean, period_start date, period_end date)
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := public.orbit_today(); v_from date; v_to date;
begin
  if p_period = 'weekly' then v_from := date_trunc('week', v_today::timestamp)::date; v_to := v_from + 6; end if;
  return query
    select r.rank, r.user_id, p.username, p.full_name, p.avatar_key, r.score, r.total, (v_to is not null and v_to >= v_today), v_from, v_to
    from public._referral_ranked(p_period) r join public.profiles p on p.id = r.user_id
    order by r.rank limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

create or replace function public.referral_my_rank(p_period text)
returns table (rank bigint, score bigint, total bigint, participating boolean) language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_part boolean; v_score bigint; v_today date := public.orbit_today(); v_from date; v_to date;
begin
  select orbits_on_leaderboard into v_part from public.profiles where id = v_me;
  if p_period = 'weekly' then v_from := date_trunc('week', v_today::timestamp)::date; v_to := v_from + 6; end if;
  select count(*) into v_score from public.referrals r where r.referrer_id = v_me and r.status = 'rewarded' and (p_period = 'alltime' or r.qualified_day between v_from and v_to);
  return query
    with rk as (select * from public._referral_ranked(p_period))
    select m.rank, m.score, m.total, v_part from rk m where m.user_id = v_me
    union all
    select null::bigint, v_score, (select count(*) from rk), v_part where not exists (select 1 from rk m2 where m2.user_id = v_me);
end $$;

-- ═══════════════ 7. Reminder prompt (per member, so the cooldown holds across devices) ═══════════════
create table public.referral_prompt_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  shown_count integer not null default 0,
  dismiss_count integer not null default 0,
  last_shown_at timestamptz,
  last_dismissed_at timestamptz,
  opted_out boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.referral_prompt_state enable row level security;
revoke all on public.referral_prompt_state from anon, authenticated;

create or replace function public._referral_prompt_due(p_user uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare s public.referral_prompt_state%rowtype; p public.profiles%rowtype;
begin
  if not (public._referral_flag('program_enabled') and public._referral_flag('popup_enabled')) then return false; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.status <> 'active' or p.onboarded_at is null then return false; end if;
  if p.onboarded_at > now() - make_interval(days => greatest(public._referral_num('popup_min_account_days'), 0)) then return false; end if;
  -- "a meaningful point in the journey": they have actually used the platform (any recognised Orbits activity)
  if not exists (select 1 from public.orbit_ledger l where l.user_id = p_user and l.kind in ('checkin', 'challenge_participation', 'post', 'helpful_answer')) then return false; end if;
  select * into s from public.referral_prompt_state where user_id = p_user;
  if found then
    if s.opted_out or s.dismiss_count >= greatest(public._referral_num('popup_max_dismissals'), 1) then return false; end if;
    if s.last_shown_at is not null and s.last_shown_at > now() - make_interval(days => greatest(public._referral_num('popup_frequency_days'), 1)) then return false; end if;
  end if;
  return true;
end $$;

create or replace function public.referral_prompt_check() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object('show', public._referral_prompt_due(v_me), 'reward', 100);
end $$;

-- 'shown' only counts (and starts the cooldown) when a reminder was really due, so repeated calls cannot move the cooldown.
create or replace function public.referral_prompt_record(p_event text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_due boolean;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_event not in ('shown', 'dismissed', 'opt_out', 'opt_in') then raise exception 'invalid_event' using errcode = '22023'; end if;
  insert into public.referral_prompt_state(user_id) values (v_me) on conflict (user_id) do nothing;
  if p_event = 'shown' then
    v_due := public._referral_prompt_due(v_me);
    if v_due then update public.referral_prompt_state set shown_count = shown_count + 1, last_shown_at = now(), updated_at = now() where user_id = v_me; end if;
    return jsonb_build_object('counted', v_due);
  elsif p_event = 'dismissed' then
    -- only one dismissal per shown reminder: it must come after the latest "shown" and not repeat
    update public.referral_prompt_state set dismiss_count = dismiss_count + 1, last_dismissed_at = now(), updated_at = now()
     where user_id = v_me and last_shown_at is not null and (last_dismissed_at is null or last_dismissed_at < last_shown_at);
    return jsonb_build_object('counted', found);
  elsif p_event = 'opt_out' then
    update public.referral_prompt_state set opted_out = true, updated_at = now() where user_id = v_me;
  else
    update public.referral_prompt_state set opted_out = false, dismiss_count = 0, updated_at = now() where user_id = v_me;
  end if;
  return jsonb_build_object('counted', true);
end $$;

create or replace function public.referral_prompt_preference() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('opted_out', coalesce((select opted_out from public.referral_prompt_state where user_id = (select auth.uid())), false)) $$;

-- ═══════════════ 8. The launch announcement (in-app only) ═══════════════
create table public.referral_campaign_sends (
  campaign_key text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered boolean not null,
  sent_at timestamptz not null default now(),
  primary key (campaign_key, user_id)
);
alter table public.referral_campaign_sends enable row level security;
revoke all on public.referral_campaign_sends from anon, authenticated;

-- Worker step. Each member is visited once per campaign key (the primary key makes a second send impossible, even with two workers).
-- A member who switched off "Offers & invitations" or the Refer & Earn reminders is recorded as skipped. The notification is created
-- already marked as pushed: this announcement never goes out as a push or an email, only to the bell.
create or replace function public.referral_campaign_deliver(p_limit integer default 500) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key text := public._referral_cfg('campaign_key') #>> '{}'; v_title text := public._referral_cfg('campaign_title') #>> '{}'; v_body text := public._referral_cfg('campaign_body') #>> '{}'; v_sent int; v_skipped int;
begin
  if not (public._referral_flag('campaign_enabled') and public._referral_flag('program_enabled')) then return jsonb_build_object('sent', 0, 'skipped', 0, 'active', false); end if;
  with cand as (
    select p.id from public.profiles p
    where p.status = 'active' and p.onboarded_at is not null
      and not exists (select 1 from public.referral_campaign_sends s where s.campaign_key = v_key and s.user_id = p.id)
    order by p.created_at, p.id limit least(greatest(p_limit, 1), 2000)
  ),
  ins as (
    insert into public.referral_campaign_sends(campaign_key, user_id, delivered)
    select v_key, c.id, not (
        coalesce((select not np.in_app from public.notification_preferences np where np.user_id = c.id and np.category = 'promotions'), false)
        or coalesce((select ps.opted_out from public.referral_prompt_state ps where ps.user_id = c.id), false))
    from cand c on conflict do nothing returning user_id, delivered
  ),
  note as (
    insert into public.notifications(user_id, type, category, data, dedupe_key, email_status, pushed_at)
    select i.user_id, 'referral_campaign', 'promotions', jsonb_build_object('title', v_title, 'snippet', v_body, 'campaign', v_key), 'campaign:' || v_key, 'none', now()
    from ins i where i.delivered
    on conflict (user_id, dedupe_key) where dedupe_key is not null and read_at is null do nothing returning 1
  )
  select (select count(*) from note), (select count(*) from ins where not delivered) into v_sent, v_skipped;
  return jsonb_build_object('sent', v_sent, 'skipped', v_skipped, 'active', true, 'campaign', v_key);
end $$;

-- ═══════════════ 9. Housekeeping (worker tick) ═══════════════
create or replace function public.referral_maintenance() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_expired int; v_purged int;
begin
  with e as (update public.referrals set status = 'expired' where status in ('registered', 'pending_qualification') and qualify_by < now() returning id, referrer_id),
       ev as (insert into public.referral_events(referral_id, referrer_id, kind) select id, referrer_id, 'expired' from e returning 1)
  select count(*) into v_expired from e;
  -- the signup-network fingerprint is only an abuse signal: gone after 90 days, or at once when the invited account was erased
  update public.referrals set net_hash = null where net_hash is not null and (registered_at < now() - interval '90 days' or referred_id is null);
  get diagnostics v_purged = row_count;
  delete from public.referral_events where kind = 'attribution_rejected' and created_at < now() - interval '90 days';
  return jsonb_build_object('expired', v_expired, 'purged', v_purged);
end $$;

-- ═══════════════ 10. Administration ═══════════════
insert into public.role_permissions(role, permission) values ('global_admin', 'referrals.view'), ('global_admin', 'referrals.manage') on conflict do nothing;

create or replace function public._referral_admin(p_perm text) returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission(p_perm, null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public.referral_admin_metrics() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._referral_admin('referrals.view');
  return jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.referrals group by status) s), '{}'::jsonb),
    'rewarded_7d', (select count(*) from public.referrals where status = 'rewarded' and qualified_at > now() - interval '7 days'),
    'rewarded_30d', (select count(*) from public.referrals where status = 'rewarded' and qualified_at > now() - interval '30 days'),
    'orbits_issued', coalesce((select sum(amount) from public.orbit_ledger where source_type = 'referral' and kind = 'referral'), 0),
    'orbits_reversed', coalesce((select -sum(amount) from public.orbit_ledger where source_type = 'referral' and kind = 'reversal'), 0),
    'with_signals', (select count(*) from public.referrals where jsonb_array_length(signals) > 0),
    'refused_7d', coalesce((select jsonb_object_agg(reason, n) from (select detail->>'reason' reason, count(*) n from public.referral_events
        where kind = 'attribution_rejected' and created_at > now() - interval '7 days' group by 1) s), '{}'::jsonb),
    'top_referrers_7d', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'rewarded', t.n, 'signals', t.sig) order by t.n desc) from (
        select referrer_id, count(*) n, count(*) filter (where jsonb_array_length(signals) > 0) sig from public.referrals
        where status = 'rewarded' and qualified_at > now() - interval '7 days' group by referrer_id order by n desc limit 5) t join public.profiles p on p.id = t.referrer_id), '[]'::jsonb),
    'campaign', jsonb_build_object('key', public._referral_cfg('campaign_key') #>> '{}', 'enabled', public._referral_flag('campaign_enabled'),
        'delivered', (select count(*) from public.referral_campaign_sends where campaign_key = public._referral_cfg('campaign_key') #>> '{}' and delivered),
        'skipped', (select count(*) from public.referral_campaign_sends where campaign_key = public._referral_cfg('campaign_key') #>> '{}' and not delivered),
        'read', (select count(*) from public.notifications where type = 'referral_campaign' and dedupe_key = 'campaign:' || (public._referral_cfg('campaign_key') #>> '{}') and read_at is not null)));
end $$;

-- Search by status and username. Shows usernames and dates only: no email, no network data. Wildcards in the search text are escaped.
create or replace function public.referral_admin_list(p_status text default null, p_q text default null, p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, status text, registered_at timestamptz, qualified_at timestamptz, referrer_username text, referred_username text, signals jsonb, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), ''); v_like text;
begin
  perform public._referral_admin('referrals.view');
  if v_q is not null then v_like := '%' || replace(replace(replace(lower(left(v_q, 60)), '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return query
    select r.id, r.status, r.registered_at, r.qualified_at, a.username, b.username, r.signals, count(*) over ()
    from public.referrals r join public.profiles a on a.id = r.referrer_id left join public.profiles b on b.id = r.referred_id
    where (p_status is null or (p_status = 'signals' and jsonb_array_length(r.signals) > 0) or r.status = p_status)
      and (v_like is null or lower(a.username) like v_like or lower(coalesce(b.username, '')) like v_like or r.id::text = v_q)
    order by r.created_at desc, r.id limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- The evidence for one referral: the conditions, as the qualification rule sees them, and the trail of events.
create or replace function public.referral_admin_detail(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._referral_admin('referrals.view'); r public.referrals%rowtype; v_days int; v_shared int;
begin
  select * into r from public.referrals where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select count(distinct l.day) into v_days from public.orbit_ledger l where l.user_id = r.referred_id and l.kind in ('checkin', 'challenge_participation', 'post', 'helpful_answer');
  select count(*) into v_shared from public.referrals x where r.net_hash is not null and x.referrer_id = r.referrer_id and x.id <> r.id and x.net_hash = r.net_hash;
  perform public.write_audit_log(v_actor, 'referrals.viewed', 'referral', r.id::text, null, '{}'::jsonb);
  return jsonb_build_object(
    'id', r.id, 'status', r.status, 'registered_at', r.registered_at, 'qualify_by', r.qualify_by, 'qualified_at', r.qualified_at, 'signals', r.signals,
    'reward_amount', r.reward_amount, 'reward_ledger_id', r.reward_ledger_id, 'idempotency_key', r.idempotency_key,
    'reviewed_at', r.reviewed_at, 'review_reason', r.review_reason, 'reversed_at', r.reversed_at, 'reversal_reason', r.reversal_reason, 'reversal_shortfall', r.reversal_shortfall,
    'referrer', (select jsonb_build_object('username', p.username, 'status', p.status, 'rewarded_24h', (select count(*) from public.referrals y where y.referrer_id = r.referrer_id and y.status = 'rewarded' and y.qualified_at > now() - interval '24 hours'),
        'rewarded_total', (select count(*) from public.referrals y where y.referrer_id = r.referrer_id and y.status = 'rewarded')) from public.profiles p where p.id = r.referrer_id),
    'referred', (select jsonb_build_object('username', p.username, 'status', p.status, 'joined_at', p.created_at, 'onboarded', p.onboarded_at is not null,
        'email_confirmed', coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = p.id), false)) from public.profiles p where p.id = r.referred_id),
    'activity_days', v_days, 'activity_days_required', public._referral_num('activation_days'), 'shared_network_with', v_shared,
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'detail', e.detail, 'at', e.created_at) order by e.id) from public.referral_events e where e.referral_id = r.id), '[]'::jsonb));
end $$;

-- A held (flagged) referral: approve (pays the reward, once) or reject (no reward). The reason is recorded either way.
create or replace function public.referral_admin_review(p_id uuid, p_decision text, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._referral_admin('referrals.manage'); r public.referrals%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into r from public.referrals where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'flagged' then raise exception 'not_reviewable' using errcode = '22023'; end if;
  update public.referrals set review_reason = left(v_reason, 500) where id = r.id;
  if p_decision = 'approve' then
    if not exists (select 1 from public.profiles where id = r.referrer_id and status = 'active') then raise exception 'referrer_unavailable' using errcode = '22023'; end if;
    perform public._referral_credit(r.id, v_actor, null);
  else
    update public.referrals set status = 'rejected', reviewed_by = v_actor, reviewed_at = now() where id = r.id;
    perform public._referral_event(r.id, r.referrer_id, 'rejected', jsonb_build_object('reason', left(v_reason, 200)), v_actor);
  end if;
  perform public.write_audit_log(v_actor, 'referrals.' || p_decision, 'referral', r.id::text, null, jsonb_build_object('reason', left(v_reason, 200)));
  return jsonb_build_object('status', (select status from public.referrals where id = r.id));
end $$;

-- Takes an invalid reward back with a compensating ledger entry. Never below a zero balance, never touching other Orbits:
-- if the referrer has already spent... the entry is capped at what the balance holds and the shortfall is recorded.
create or replace function public.referral_admin_reverse(p_id uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._referral_admin('referrals.manage'); r public.referrals%rowtype; led public.orbit_ledger%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_bal int; v_take int; v_rev uuid;
begin
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.referrals where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status <> 'rewarded' then raise exception 'not_reversible' using errcode = '22023'; end if;
  select * into led from public.orbit_ledger where id = r.reward_ledger_id;
  if not found then raise exception 'not_reversible' using errcode = '22023'; end if;
  if exists (select 1 from public.orbit_ledger where reverses_id = led.id) then raise exception 'already_reversed' using errcode = '22023'; end if;
  select balance into v_bal from public.orbit_balances where user_id = r.referrer_id;
  v_take := least(led.amount, coalesce(v_bal, 0));
  if v_take > 0 then
    insert into public.orbit_ledger(user_id, kind, amount, idempotency_key, day, source_type, source_id, reverses_id, reason, created_by)
    values (r.referrer_id, 'reversal', -v_take, 'rev:' || led.id, public.orbit_today(), 'referral', r.id::text, led.id, left('Referral reversed: ' || v_reason, 500), v_actor)
    returning id into v_rev;
  end if;
  update public.referrals set status = 'reversed', reversed_at = now(), reversed_by = v_actor, reversal_reason = left(v_reason, 500), reversal_ledger_id = v_rev,
         reversal_shortfall = led.amount - v_take where id = r.id;
  perform public._referral_event(r.id, r.referrer_id, 'reversed', jsonb_build_object('taken', v_take, 'shortfall', led.amount - v_take), v_actor);
  perform public.write_audit_log(v_actor, 'referrals.reversal', 'referral', r.id::text, null, jsonb_build_object('reason', left(v_reason, 200), 'taken', v_take, 'shortfall', led.amount - v_take));
  perform public.notify(r.referrer_id, 'referral_reversed', null, 'referral', r.id, '{}'::jsonb, 'referral-reversed:' || r.id);
  return jsonb_build_object('taken', v_take, 'shortfall', led.amount - v_take);
end $$;

create or replace function public.referral_admin_settings() returns table (key text, value jsonb, description text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._referral_admin('referrals.view');
  return query select s.key, s.value, s.description, s.updated_at from public.referral_settings s order by s.key;
end $$;

create or replace function public.referral_admin_set_setting(p_key text, p_value jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._referral_admin('referrals.manage'); v_int int; v_txt text;
begin
  if not exists (select 1 from public.referral_settings where key = p_key) then raise exception 'unknown_setting' using errcode = '22023'; end if;
  if p_key in ('program_enabled', 'popup_enabled', 'campaign_enabled') then
    if jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_value' using errcode = '22023'; end if;
  elsif p_key in ('campaign_key', 'campaign_title', 'campaign_body') then
    if jsonb_typeof(p_value) <> 'string' then raise exception 'invalid_value' using errcode = '22023'; end if;
    v_txt := btrim(p_value #>> '{}');
    if p_key = 'campaign_key' and v_txt !~ '^[a-z0-9-]{3,60}$' then raise exception 'invalid_value' using errcode = '22023'; end if;
    if p_key = 'campaign_title' and char_length(v_txt) not between 3 and 80 then raise exception 'invalid_value' using errcode = '22023'; end if;
    if p_key = 'campaign_body' and char_length(v_txt) not between 3 and 240 then raise exception 'invalid_value' using errcode = '22023'; end if;
    p_value := to_jsonb(v_txt);
  else
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^[0-9]{1,3}$' then raise exception 'invalid_value' using errcode = '22023'; end if;
    v_int := (p_value #>> '{}')::int;
    if not (case p_key
      when 'attribution_days' then v_int between 1 and 90 when 'qualify_days' then v_int between 7 and 180 when 'activation_days' then v_int between 1 and 7
      when 'daily_referrer_cap' then v_int between 1 and 100 when 'ip_cluster_threshold' then v_int between 2 and 20 when 'popup_frequency_days' then v_int between 1 and 90
      when 'popup_max_dismissals' then v_int between 1 and 10 when 'popup_min_account_days' then v_int between 0 and 60 else false end) then
      raise exception 'invalid_value' using errcode = '22023';
    end if;
  end if;
  update public.referral_settings set value = p_value, updated_at = now(), updated_by = v_actor where key = p_key;
  perform public.write_audit_log(v_actor, 'referrals.setting_changed', 'referral_setting', p_key, null, jsonb_build_object('value', case when p_key = 'campaign_body' then null else p_value end));
end $$;

-- Stops the announcement. Optionally takes the unread copies out of members' bells (read ones are left alone).
create or replace function public.referral_admin_stop_campaign(p_retract boolean default false) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._referral_admin('referrals.manage'); v_key text := public._referral_cfg('campaign_key') #>> '{}'; v_removed int := 0;
begin
  update public.referral_settings set value = 'false'::jsonb, updated_at = now(), updated_by = v_actor where key = 'campaign_enabled';
  if p_retract then
    delete from public.notifications where type = 'referral_campaign' and dedupe_key = 'campaign:' || v_key and read_at is null;
    get diagnostics v_removed = row_count;
  end if;
  perform public.write_audit_log(v_actor, 'referrals.campaign_stopped', 'referral_setting', v_key, null, jsonb_build_object('retracted', v_removed));
  return jsonb_build_object('retracted', v_removed);
end $$;

-- Pseudonymous export: ids, statuses, dates, amounts and signal names. No usernames, emails or network data. Audited.
create or replace function public.referral_admin_export(p_from date default null, p_to date default null)
returns table (referral_id uuid, status text, registered_at timestamptz, qualified_at timestamptz, reward_amount integer, signals jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._referral_admin('referrals.manage');
begin
  perform public.write_audit_log(v_actor, 'referrals.exported', 'referral', null, null, jsonb_build_object('from', p_from, 'to', p_to));
  return query select r.id, r.status, r.registered_at, r.qualified_at, r.reward_amount, r.signals from public.referrals r
    where (p_from is null or r.registered_at >= p_from) and (p_to is null or r.registered_at < p_to + 1) order by r.registered_at, r.id limit 20000;
end $$;

-- ═══════════════ 11. Grants ═══════════════
revoke execute on function
  public._referral_cfg(text), public._referral_num(text), public._referral_flag(text), public._referral_event(uuid, uuid, text, jsonb, uuid), public._referral_new_code(text),
  public._referral_credit(uuid, uuid, jsonb), public._referral_evaluate(uuid), public._referral_on_ledger(), public._referral_on_onboarded(), public._referral_ranked(text),
  public._referral_prompt_due(uuid), public._referral_admin(text), public.orbit_ledger_set_earned()
from public, anon, authenticated;
revoke execute on function public.referral_attribute(uuid, text, text), public.referral_preview(text), public.referral_campaign_deliver(integer), public.referral_maintenance()
from public, anon, authenticated;
grant execute on function public.referral_attribute(uuid, text, text), public.referral_preview(text), public.referral_campaign_deliver(integer), public.referral_maintenance() to service_role;

revoke execute on function
  public.referral_my_code(), public.referral_overview(), public.referral_leaderboard(text, integer, integer), public.referral_my_rank(text),
  public.referral_prompt_check(), public.referral_prompt_record(text), public.referral_prompt_preference(),
  public.referral_admin_metrics(), public.referral_admin_list(text, text, integer, integer), public.referral_admin_detail(uuid),
  public.referral_admin_review(uuid, text, text), public.referral_admin_reverse(uuid, text), public.referral_admin_settings(),
  public.referral_admin_set_setting(text, jsonb), public.referral_admin_stop_campaign(boolean), public.referral_admin_export(date, date)
from public, anon;
grant execute on function
  public.referral_my_code(), public.referral_overview(), public.referral_leaderboard(text, integer, integer), public.referral_my_rank(text),
  public.referral_prompt_check(), public.referral_prompt_record(text), public.referral_prompt_preference(),
  public.referral_admin_metrics(), public.referral_admin_list(text, text, integer, integer), public.referral_admin_detail(uuid),
  public.referral_admin_review(uuid, text, text), public.referral_admin_reverse(uuid, text), public.referral_admin_settings(),
  public.referral_admin_set_setting(text, jsonb), public.referral_admin_stop_campaign(boolean), public.referral_admin_export(date, date)
to authenticated;
-- re-asserted after the redefinitions above
revoke execute on function public._orbit_check_achievements(uuid), public._orbit_finalize(uuid, uuid), public.orbit_ledger_apply() from public, anon, authenticated;
revoke execute on function public.orbit_overview(), public.orbit_admin_suspicious(integer), public.orbit_admin_reverse(uuid, text) from public, anon;
grant execute on function public.orbit_overview(), public.orbit_admin_suspicious(integer), public.orbit_admin_reverse(uuid, text) to authenticated;

-- ═══════════════ 12. Release note (a DRAFT: publish it from Admin > Releases when this version is live) ═══════════════
insert into public.releases(version, title, summary, items, published_at) values (
  '2.1.0', 'Refer & Earn',
  'Invite friends and earn 100 Orbits for each friend who joins and becomes an active member.',
  '[{"kind":"new","text":"Refer & Earn: a personal invite link, a shareable invite card, and 100 Orbits for each friend who joins and becomes an active member."},
    {"kind":"new","text":"A separate referral leaderboard, weekly and all time, with your own rank."},
    {"kind":"improved","text":"Referral Orbits count toward your balance and the Orbit leaderboards, but not toward badges, streaks or the Daily Challenge."},
    {"kind":"new","text":"Notification choices for Orbits & referral rewards and for Offers & invitations (in the app only)."}]'::jsonb,
  null)
on conflict (version) do nothing;

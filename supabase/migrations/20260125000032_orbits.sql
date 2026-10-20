-- Orbits: UniSphere's rewards system (balance, daily bonus, daily challenge, contribution streak, badges, leaderboards).
--
-- Design in one paragraph. Everything that moves a balance is a row in `orbit_ledger`, an append-only table with a unique
-- idempotency key, written only by SECURITY DEFINER functions after the underlying event has been validated in the same
-- transaction (a check-in row, an answer row, a published post, a like on a comment by the question's author). The
-- balance is a cached sum kept by a trigger; it can never be set by the client and may not go negative. Clients get
-- no direct write access to any Orbits table, and the answer key of a daily question is unreadable until a member has
-- answered. Days are Asia/Kolkata calendar days (IST has no daylight saving), see `orbit_today()`.
--
-- Contributions that count for the streak: answering the daily challenge, an eligible post, a helpful answer.
-- A daily check-in pays Orbits but is NOT a streak day.

-- ── Privacy choices (on the profile, like the other privacy settings) ────────
alter table public.profiles
  add column if not exists orbits_show_balance boolean not null default true,
  add column if not exists orbits_show_achievements boolean not null default true,
  add column if not exists orbits_on_leaderboard boolean not null default true,
  add column if not exists orbits_cards_public boolean not null default true;
grant update (orbits_show_balance, orbits_show_achievements, orbits_on_leaderboard, orbits_cards_public) on public.profiles to authenticated;

-- ── Time ─────────────────────────────────────────────────────────────────────
create or replace function public.orbit_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ── Configuration (values and caps live here, not in code) ───────────────────
create table public.orbit_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.orbit_config(key, value, description) values
  ('checkin', '5', 'Orbits for the Daily Orbit Bonus (once per day)'),
  ('challenge_participation', '5', 'Orbits for answering the daily challenge'),
  ('challenge_correct', '5', 'Bonus Orbits for a correct answer'),
  ('post', '10', 'Orbits for the first eligible original post of the day'),
  ('post_min_chars', '60', 'Minimum characters for a post to be eligible'),
  ('helpful_answer', '5', 'Orbits for an answer the question''s author liked'),
  ('helpful_daily_cap', '3', 'Helpful answers rewarded per member per day'),
  ('helpful_min_chars', '40', 'Minimum characters for a helpful answer'),
  ('streak_bonus', '{"3":5,"7":10,"14":15,"30":30,"60":50,"100":100,"365":300}', 'Bonus Orbits when the contribution streak reaches each length (once per length)'),
  ('min_group_size', '5', 'Smallest college or connections group that can award a Top 10 badge'),
  ('suspicious_daily_orbits', '100', 'Orbits earned in one day above which a member is listed for review');

-- ── The ledger ───────────────────────────────────────────────────────────────
create table public.orbit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('checkin', 'challenge_participation', 'challenge_correct', 'post', 'helpful_answer',
                                     'streak_milestone', 'achievement', 'manual_adjustment', 'reversal')),
  amount integer not null check (amount <> 0 and amount between -100000 and 100000),
  idempotency_key text not null unique,
  day date not null,
  source_type text,
  source_id text,
  reverses_id uuid references public.orbit_ledger(id),
  reason text check (reason is null or char_length(reason) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'reversal') = (reverses_id is not null) or kind = 'manual_adjustment')
);
create unique index orbit_ledger_one_reversal_idx on public.orbit_ledger(reverses_id) where reverses_id is not null;
create index orbit_ledger_user_idx on public.orbit_ledger(user_id, created_at desc);
create index orbit_ledger_day_idx on public.orbit_ledger(day, user_id);
create index orbit_ledger_source_idx on public.orbit_ledger(source_type, source_id) where source_id is not null;

-- Nobody can edit or delete a ledger row. The one exception is erasing a member's account: the rows are removed by the
-- cascade from profiles (trigger depth 2), which is how personal data leaves when someone deletes their account. A
-- direct DELETE (depth 1), an UPDATE and a TRUNCATE are always refused.
create or replace function public.orbit_ledger_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'orbit_ledger is append-only: add a reversing entry instead' using errcode = '42501';
end $$;
create trigger trg_orbit_ledger_no_change before update or delete on public.orbit_ledger for each row execute function public.orbit_ledger_immutable();
create trigger trg_orbit_ledger_no_truncate before truncate on public.orbit_ledger for each statement execute function public.orbit_ledger_immutable();

create table public.orbit_balances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  earned_total integer not null default 0 check (earned_total >= 0),
  updated_at timestamptz not null default now()
);
create index orbit_balances_rank_idx on public.orbit_balances(balance desc, user_id);

create or replace function public.orbit_ledger_apply() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- update first: an upsert would test the CHECK (balance >= 0) on the proposed new row, which is negative for a reversal
  update public.orbit_balances set balance = balance + new.amount, earned_total = earned_total + greatest(new.amount, 0), updated_at = now()
  where user_id = new.user_id;
  if not found then
    insert into public.orbit_balances(user_id, balance, earned_total) values (new.user_id, new.amount, greatest(new.amount, 0));
  end if;
  return null;
end $$;
create trigger trg_orbit_ledger_apply after insert on public.orbit_ledger for each row execute function public.orbit_ledger_apply();

-- ── Check-ins, streak days and streak counters ───────────────────────────────
create table public.orbit_checkins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create table public.orbit_streak_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('challenge', 'post', 'helpful')),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index orbit_streak_days_day_idx on public.orbit_streak_days(day);
create table public.orbit_streaks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_day date,
  updated_at timestamptz not null default now()
);

-- ── Daily challenge ──────────────────────────────────────────────────────────
create table public.orbit_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 10 and 400),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null check (char_length(explanation) between 10 and 600),
  category text not null check (category in ('programming', 'technology', 'science', 'aptitude', 'general', 'campus')),
  publish_date date not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  source text not null default 'manual' check (source in ('manual', 'ai_draft')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one live question per date (global audience)
create unique index orbit_questions_one_live_per_day_idx on public.orbit_questions(publish_date) where status in ('scheduled', 'published');
create index orbit_questions_date_idx on public.orbit_questions(publish_date desc);

create table public.orbit_answers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.orbit_questions(id) on delete cascade,
  selected smallint not null check (selected between 0 and 3),
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index orbit_answers_question_idx on public.orbit_answers(question_id);

-- ── Achievements ─────────────────────────────────────────────────────────────
create table public.orbit_achievements (
  id text primary key check (id ~ '^[a-z0-9_]{3,40}$'),
  category text not null check (category in ('learning', 'streak', 'contribution', 'collaboration', 'orbits', 'ranking')),
  title text not null check (char_length(title) between 2 and 60),
  description text not null check (char_length(description) between 5 and 200),
  icon text not null,
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'elite')),
  criteria jsonb not null,
  criteria_version integer not null default 1,
  bonus integer not null default 0 check (bonus between 0 and 1000),
  sort_order integer not null default 100,
  active boolean not null default true
);
create table public.orbit_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'finalized')),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 120)
);
create table public.orbit_user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.orbit_achievements(id),
  earned_at timestamptz not null default now(),
  season_id uuid references public.orbit_seasons(id),
  scope text check (scope is null or scope in ('global', 'college', 'connections')),
  period text,
  rank integer,
  score integer,
  criteria_version integer not null default 1
);
create unique index orbit_user_ach_plain_idx on public.orbit_user_achievements(user_id, achievement_id) where season_id is null;
create unique index orbit_user_ach_season_idx on public.orbit_user_achievements(user_id, achievement_id, season_id) where season_id is not null;
create index orbit_user_ach_user_idx on public.orbit_user_achievements(user_id, earned_at desc);

create table public.orbit_season_results (
  season_id uuid not null references public.orbit_seasons(id) on delete cascade,
  scope text not null check (scope in ('global', 'college', 'connections')),
  scope_ref uuid not null default '00000000-0000-0000-0000-000000000000',
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank integer not null,
  score integer not null,
  group_size integer not null,
  primary key (season_id, scope, scope_ref, user_id)
);

-- ── Table access: members may read only their own rows; nothing is writable through the API ──────────────────
alter table public.orbit_config enable row level security;
alter table public.orbit_ledger enable row level security;
alter table public.orbit_balances enable row level security;
alter table public.orbit_checkins enable row level security;
alter table public.orbit_streak_days enable row level security;
alter table public.orbit_streaks enable row level security;
alter table public.orbit_questions enable row level security;
alter table public.orbit_answers enable row level security;
alter table public.orbit_achievements enable row level security;
alter table public.orbit_seasons enable row level security;
alter table public.orbit_user_achievements enable row level security;
alter table public.orbit_season_results enable row level security;

grant select on public.orbit_config, public.orbit_achievements, public.orbit_seasons to authenticated;
grant select on public.orbit_ledger, public.orbit_balances, public.orbit_checkins, public.orbit_streak_days, public.orbit_streaks,
  public.orbit_answers, public.orbit_user_achievements to authenticated;
-- orbit_questions (it holds the answer key) and orbit_season_results have no grant for members at all.
create policy orbit_config_read on public.orbit_config for select to authenticated using (true);
create policy orbit_achievements_read on public.orbit_achievements for select to authenticated using (active);
create policy orbit_seasons_read on public.orbit_seasons for select to authenticated using (true);
create policy orbit_ledger_own on public.orbit_ledger for select to authenticated using (user_id = (select auth.uid()));
create policy orbit_balances_own on public.orbit_balances for select to authenticated using (user_id = (select auth.uid()));
create policy orbit_checkins_own on public.orbit_checkins for select to authenticated using (user_id = (select auth.uid()));
create policy orbit_streak_days_own on public.orbit_streak_days for select to authenticated using (user_id = (select auth.uid()));
create policy orbit_streaks_own on public.orbit_streaks for select to authenticated using (user_id = (select auth.uid()));
create policy orbit_answers_own on public.orbit_answers for select to authenticated using (user_id = (select auth.uid()));
create policy orbit_user_ach_own on public.orbit_user_achievements for select to authenticated using (user_id = (select auth.uid()));

-- ── Seed: achievements (stable ids; criteria are evaluated from trusted records only) ───────────────────────
insert into public.orbit_achievements(id, category, title, description, icon, tier, criteria, bonus, sort_order) values
  ('first_challenge', 'learning', 'First Challenge', 'Answered your first Daily Challenge.', 'graduation-cap', 'bronze', '{"type":"answered","value":1}', 5, 10),
  ('correct_5', 'learning', 'Sharp Mind', 'Answered 5 Daily Challenges correctly.', 'brain', 'bronze', '{"type":"correct","value":5}', 10, 11),
  ('correct_25', 'learning', 'Quick Thinker', 'Answered 25 Daily Challenges correctly.', 'circle-check', 'silver', '{"type":"correct","value":25}', 25, 12),
  ('correct_100', 'learning', 'Challenge Master', 'Answered 100 Daily Challenges correctly.', 'award', 'gold', '{"type":"correct","value":100}', 100, 13),
  ('first_contribution', 'contribution', 'First Contribution', 'Made your first eligible contribution.', 'badge-check', 'bronze', '{"type":"contribution_days","value":1}', 5, 20),
  ('contributor_30', 'contribution', 'Regular Contributor', 'Contributed on 30 different days.', 'trending-up', 'silver', '{"type":"contribution_days","value":30}', 40, 21),
  ('helpful_1', 'contribution', 'Helpful Hand', 'Gave an answer the question''s author found helpful.', 'user-graduation-cap', 'bronze', '{"type":"helpful","value":1}', 5, 30),
  ('helpful_10', 'contribution', 'Trusted Helper', 'Gave 10 answers that were found helpful.', 'badge-check', 'silver', '{"type":"helpful","value":10}', 30, 31),
  ('helpful_50', 'contribution', 'Community Guide', 'Gave 50 answers that were found helpful.', 'trophy', 'gold', '{"type":"helpful","value":50}', 100, 32),
  ('project_first', 'collaboration', 'Team Player', 'Joined or started your first project.', 'globe', 'bronze', '{"type":"projects","value":1}', 5, 40),
  ('streak_3', 'streak', '3-Day Orbit Streak', 'Contributed three days in a row.', 'flame', 'bronze', '{"type":"streak","value":3}', 0, 50),
  ('streak_7', 'streak', '7-Day Orbit Streak', 'Contributed seven days in a row.', 'flame', 'bronze', '{"type":"streak","value":7}', 0, 51),
  ('streak_14', 'streak', '14-Day Orbit Streak', 'Contributed fourteen days in a row.', 'calendar-check', 'silver', '{"type":"streak","value":14}', 0, 52),
  ('streak_30', 'streak', '30-Day Orbit Streak', 'Contributed thirty days in a row.', 'calendar-check', 'silver', '{"type":"streak","value":30}', 0, 53),
  ('streak_60', 'streak', '60-Day Orbit Streak', 'Contributed sixty days in a row.', 'trending-up', 'gold', '{"type":"streak","value":60}', 0, 54),
  ('streak_100', 'streak', '100-Day Orbit Streak', 'Contributed one hundred days in a row.', 'trophy', 'gold', '{"type":"streak","value":100}', 0, 55),
  ('streak_365', 'streak', 'Full Orbit', 'Contributed three hundred and sixty-five days in a row.', 'orbit', 'elite', '{"type":"streak","value":365}', 0, 56),
  ('orbits_100', 'orbits', '100 Orbits', 'Earned 100 Orbits.', 'orbit', 'bronze', '{"type":"earned","value":100}', 0, 60),
  ('orbits_500', 'orbits', '500 Orbits', 'Earned 500 Orbits.', 'orbit', 'silver', '{"type":"earned","value":500}', 0, 61),
  ('orbits_2000', 'orbits', '2,000 Orbits', 'Earned 2,000 Orbits.', 'orbit', 'gold', '{"type":"earned","value":2000}', 0, 62),
  ('season_champion', 'ranking', 'Season Champion', 'Finished first in UniSphere in an Orbit season.', 'trophy', 'elite', '{"type":"season"}', 100, 70),
  ('rank_global_top10', 'ranking', 'Orbit Elite: Global', 'Finished in the top 10 across UniSphere in an Orbit season.', 'award', 'elite', '{"type":"season"}', 50, 71),
  ('rank_college_top10', 'ranking', 'Orbit Elite: College', 'Finished in the top 10 of your college (self-reported) in an Orbit season.', 'graduation-cap', 'gold', '{"type":"season"}', 30, 72),
  ('rank_connections_top10', 'ranking', 'Orbit Elite: Connections', 'Finished in the top 10 among your connections in an Orbit season.', 'user-graduation-cap', 'gold', '{"type":"season"}', 20, 73);

-- ── Internal helpers (not callable through the API) ──────────────────────────
create or replace function public._orbit_cfg(p_key text) returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.orbit_config where key = p_key $$;
create or replace function public._orbit_num(p_key text) returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.orbit_config where key = p_key), 0) $$;

-- One reward: returns true if it was newly recorded (false when the same event was already rewarded).
create or replace function public._orbit_award(
  p_user uuid, p_kind text, p_amount integer, p_key text, p_source_type text, p_source_id text, p_day date default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then return false; end if;
  insert into public.orbit_ledger(user_id, kind, amount, idempotency_key, day, source_type, source_id)
  values (p_user, p_kind, p_amount, p_key, coalesce(p_day, public.orbit_today()), p_source_type, p_source_id)
  on conflict (idempotency_key) do nothing returning id into v_id;
  return v_id is not null;
end $$;

-- Evaluate every active, non-ranking achievement for a member and record what they have now earned.
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
  select coalesce(earned_total, 0) into v_earned from public.orbit_balances where user_id = p_user;
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

-- A meaningful contribution happened on p_day: count the day once, extend the streak, pay milestones, check badges.
create or replace function public._orbit_mark_day(p_user uuid, p_day date, p_kind text) returns void language plpgsql security definer set search_path = '' as $$
declare v_new boolean; v_len int; v_bonus int;
begin
  with ins as (insert into public.orbit_streak_days(user_id, day, kind) values (p_user, p_day, p_kind) on conflict do nothing returning 1)
  select count(*) > 0 into v_new from ins;
  if not v_new then return; end if;
  insert into public.orbit_streaks(user_id, current_streak, best_streak, last_day) values (p_user, 1, 1, p_day)
  on conflict (user_id) do update set
    current_streak = case when public.orbit_streaks.last_day = p_day - 1 then public.orbit_streaks.current_streak + 1 else 1 end,
    best_streak = greatest(public.orbit_streaks.best_streak, case when public.orbit_streaks.last_day = p_day - 1 then public.orbit_streaks.current_streak + 1 else 1 end),
    last_day = p_day, updated_at = now()
  returning current_streak into v_len;
  v_bonus := coalesce((public._orbit_cfg('streak_bonus') ->> v_len::text)::int, 0);
  if v_bonus > 0 then
    perform public._orbit_award(p_user, 'streak_milestone', v_bonus, 'streak:' || p_user || ':' || v_len, 'streak', v_len::text, p_day);
  end if;
  perform public._orbit_check_achievements(p_user);
end $$;

-- ── Contribution triggers ────────────────────────────────────────────────────
-- A published, original, non-private post of enough substance, not a copy of the member's own recent post, earns the
-- daily post reward. These run in the post's own transaction, and a failure here never blocks posting.
create or replace function public._orbit_on_post() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_day date := public.orbit_today();
begin
  begin
    if new.status <> 'published' or new.repost_of_id is not null or new.visibility = 'private' then return null; end if;
    if char_length(btrim(new.body)) < public._orbit_num('post_min_chars') then return null; end if;
    if not exists (select 1 from public.profiles where id = new.author_id and status = 'active') then return null; end if;
    if exists (
      select 1 from public.posts p
      where p.author_id = new.author_id and p.id <> new.id and p.created_at > now() - interval '7 days'
        and lower(regexp_replace(p.body, '\s+', ' ', 'g')) = lower(regexp_replace(new.body, '\s+', ' ', 'g'))
    ) then return null; end if;
    perform public._orbit_award(new.author_id, 'post', public._orbit_num('post'), 'post:' || new.author_id || ':' || v_day, 'post', new.id::text, v_day);
    perform public._orbit_mark_day(new.author_id, v_day, 'post');
  exception when others then
    raise warning 'orbits: post reward failed: %', sqlerrm;
  end;
  return null;
end $$;
create trigger trg_orbit_on_post after insert on public.posts for each row execute function public._orbit_on_post();

-- A post that is removed or deleted takes its reward back (a compensating entry; the day's reward is not re-offered).
create or replace function public._orbit_on_post_removed() returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.orbit_ledger%rowtype; v_bal int; v_take int;
begin
  begin
    for r in select * from public.orbit_ledger where source_type in ('post') and source_id = new.id::text and kind = 'post'
             and not exists (select 1 from public.orbit_ledger x where x.reverses_id = orbit_ledger.id)
    loop
      select balance into v_bal from public.orbit_balances where user_id = r.user_id;
      v_take := least(r.amount, coalesce(v_bal, 0));
      if v_take > 0 then
        insert into public.orbit_ledger(user_id, kind, amount, idempotency_key, day, source_type, source_id, reverses_id, reason)
        values (r.user_id, 'reversal', -v_take, 'rev:' || r.id, public.orbit_today(), 'post', new.id::text, r.id, 'The post was removed.')
        on conflict (idempotency_key) do nothing;
      end if;
    end loop;
  exception when others then
    raise warning 'orbits: post reversal failed: %', sqlerrm;
  end;
  return null;
end $$;
create trigger trg_orbit_on_post_removed after update of status on public.posts for each row
  when (old.status = 'published' and new.status in ('removed', 'deleted')) execute function public._orbit_on_post_removed();

-- "Helpful" is a signal from someone else: the author of a question (a post in the Question category) liked the answer.
create or replace function public._orbit_on_comment_like() returns trigger language plpgsql security definer set search_path = '' as $$
declare c record; v_day date := public.orbit_today(); v_today int;
begin
  begin
    select cm.id, cm.author_id, cm.status, char_length(cm.body) as len, p.author_id as asker, p.category into c
    from public.comments cm join public.posts p on p.id = cm.post_id where cm.id = new.comment_id;
    if not found or c.category <> 'questions' or c.status <> 'published' then return null; end if;
    if new.user_id <> c.asker or c.author_id = c.asker then return null; end if;
    if c.len < public._orbit_num('helpful_min_chars') then return null; end if;
    if not exists (select 1 from public.profiles where id = c.author_id and status = 'active') then return null; end if;
    select count(*) into v_today from public.orbit_ledger where user_id = c.author_id and kind = 'helpful_answer' and day = v_day;
    if v_today >= public._orbit_num('helpful_daily_cap') then return null; end if;
    if public._orbit_award(c.author_id, 'helpful_answer', public._orbit_num('helpful_answer'), 'helpful:' || c.id, 'comment', c.id::text, v_day) then
      perform public._orbit_mark_day(c.author_id, v_day, 'helpful');
    end if;
  exception when others then
    raise warning 'orbits: helpful reward failed: %', sqlerrm;
  end;
  return null;
end $$;
create trigger trg_orbit_on_comment_like after insert on public.comment_reactions for each row execute function public._orbit_on_comment_like();

create or replace function public._orbit_on_project_member() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin perform public._orbit_check_achievements(new.user_id);
  exception when others then raise warning 'orbits: project achievement check failed: %', sqlerrm; end;
  return null;
end $$;
create trigger trg_orbit_on_project_member after insert on public.project_members for each row execute function public._orbit_on_project_member();

-- ── The current challenge: today's, or (when none is scheduled for today) the latest unanswered one from the last week ──
create or replace function public._orbit_current_question(p_user uuid) returns table (id uuid, fallback boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := public.orbit_today();
begin
  return query select q.id, false from public.orbit_questions q where q.status in ('scheduled', 'published') and q.publish_date = v_today;
  if found then return; end if;
  return query select q.id, true from public.orbit_questions q
    where q.status in ('scheduled', 'published') and q.publish_date < v_today and q.publish_date >= v_today - 7
      and not exists (select 1 from public.orbit_answers a where a.user_id = p_user and a.question_id = q.id)
    order by q.publish_date desc limit 1;
end $$;

-- ═════════════════════════ Member-facing functions ═══════════════════════════
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
    'earned_today', coalesce((select sum(amount) from public.orbit_ledger where user_id = v_me and day = v_today and amount > 0), 0),
    'earned_week', coalesce((select sum(amount) from public.orbit_ledger where user_id = v_me and day >= v_week), 0),
    'week_days', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'earned', coalesce((select sum(l.amount) from public.orbit_ledger l where l.user_id = v_me and l.day = d::date), 0),
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

create or replace function public.orbit_claim_checkin() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_today date := public.orbit_today(); v_new boolean; v_amount int := public._orbit_num('checkin');
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_me and status = 'active') then raise exception 'account_restricted' using errcode = '42501'; end if;
  with ins as (insert into public.orbit_checkins(user_id, day) values (v_me, v_today) on conflict do nothing returning 1)
  select count(*) > 0 into v_new from ins;
  if v_new then perform public._orbit_award(v_me, 'checkin', v_amount, 'checkin:' || v_me || ':' || v_today, 'checkin', v_today::text, v_today); end if;
  return jsonb_build_object('claimed', v_new, 'already_claimed', not v_new, 'amount', case when v_new then v_amount else 0 end,
    'balance', coalesce((select balance from public.orbit_balances where user_id = v_me), 0));
end $$;

create or replace function public.orbit_daily_question() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); cur record; q public.orbit_questions%rowtype; a public.orbit_answers%rowtype; v_answered boolean; v_gain int;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into cur from public._orbit_current_question(v_me);
  if not found then return null; end if;
  select * into q from public.orbit_questions where id = cur.id;
  select * into a from public.orbit_answers where user_id = v_me and question_id = q.id;
  v_answered := found;
  select coalesce(sum(amount), 0) into v_gain from public.orbit_ledger where user_id = v_me and kind in ('challenge_participation', 'challenge_correct') and source_id = q.id::text;
  return jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options, 'category', q.category, 'publish_date', q.publish_date,
    'fallback', cur.fallback, 'answered', v_answered,
    'rewards', jsonb_build_object('participation', public._orbit_num('challenge_participation'), 'correct', public._orbit_num('challenge_correct')),
    'result', case when v_answered then jsonb_build_object('selected', a.selected, 'is_correct', a.is_correct, 'correct_index', q.correct_index, 'explanation', q.explanation, 'earned', v_gain) else null end);
end $$;

create or replace function public.orbit_submit_answer(p_question uuid, p_selected integer) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid()); v_today date := public.orbit_today(); cur record; q public.orbit_questions%rowtype;
  a public.orbit_answers%rowtype; v_new boolean; v_ok boolean; v_part int := 0; v_bonus int := 0;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_selected is null or p_selected not between 0 and 3 then raise exception 'invalid_answer' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = v_me and status = 'active') then raise exception 'account_restricted' using errcode = '42501'; end if;
  select * into cur from public._orbit_current_question(v_me);
  if not found or cur.id is distinct from p_question then raise exception 'question_not_available' using errcode = '22023'; end if;
  select * into q from public.orbit_questions where id = p_question;
  v_ok := (p_selected = q.correct_index);
  with ins as (insert into public.orbit_answers(user_id, question_id, selected, is_correct) values (v_me, p_question, p_selected, v_ok) on conflict do nothing returning 1)
  select count(*) > 0 into v_new from ins;
  if v_new then
    if public._orbit_award(v_me, 'challenge_participation', public._orbit_num('challenge_participation'), 'ch:' || v_me || ':' || q.id || ':p', 'question', q.id::text, v_today) then
      v_part := public._orbit_num('challenge_participation'); end if;
    if v_ok and public._orbit_award(v_me, 'challenge_correct', public._orbit_num('challenge_correct'), 'ch:' || v_me || ':' || q.id || ':c', 'question', q.id::text, v_today) then
      v_bonus := public._orbit_num('challenge_correct'); end if;
    -- only today's challenge counts as a streak day; a catch-up answer pays Orbits but does not extend the streak
    if not cur.fallback then perform public._orbit_mark_day(v_me, v_today, 'challenge'); else perform public._orbit_check_achievements(v_me); end if;
  end if;
  select * into a from public.orbit_answers where user_id = v_me and question_id = p_question;
  return jsonb_build_object('already_answered', not v_new, 'selected', a.selected, 'is_correct', a.is_correct, 'correct_index', q.correct_index, 'explanation', q.explanation,
    'earned_participation', v_part, 'earned_correct', v_bonus, 'fallback', cur.fallback,
    'balance', coalesce((select balance from public.orbit_balances where user_id = v_me), 0));
end $$;

-- Questions the member has answered, newest first. The key is shown only for questions they have already answered.
create or replace function public.orbit_my_history(p_limit integer default 10, p_offset integer default 0)
returns table (question_id uuid, question text, options jsonb, category text, publish_date date, selected smallint, is_correct boolean,
  correct_index smallint, explanation text, answered_at timestamptz, earned integer, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select q.id, q.question, q.options, q.category, q.publish_date, a.selected, a.is_correct, q.correct_index, q.explanation, a.answered_at,
         coalesce((select sum(l.amount)::int from public.orbit_ledger l where l.user_id = a.user_id and l.source_id = q.id::text and l.kind in ('challenge_participation', 'challenge_correct')), 0),
         count(*) over ()
  from public.orbit_answers a join public.orbit_questions q on q.id = a.question_id
  where a.user_id = (select auth.uid())
  order by a.answered_at desc, q.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

-- ── Leaderboards ─────────────────────────────────────────────────────────────
-- Metric: Orbits earned in the period (weekly: Monday to Sunday, monthly: the calendar month, both Asia/Kolkata);
-- all-time: the Orbit Balance. Ties: the member who reached the score first, then user id. Opted-out members and
-- profiles the viewer may not see are left out. Weekly and monthly are in progress until the period ends.
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
      select case when p_period = 'alltime' then (select b.balance::bigint from public.orbit_balances b where b.user_id = e.id)
                  else (select sum(l.amount)::bigint from public.orbit_ledger l where l.user_id = e.id and l.day between v_from and v_to) end as score,
             (select max(l.created_at) from public.orbit_ledger l where l.user_id = e.id and l.amount > 0) as last_at) s on true
    where s.score > 0
  ),
  prev as (
    select c.uid, case when p_period = 'alltime' then c.score - coalesce((select sum(l.amount) from public.orbit_ledger l where l.user_id = c.uid and l.day = v_today), 0)
                       else c.score - coalesce((select sum(l.amount) from public.orbit_ledger l where l.user_id = c.uid and l.day = v_today and l.day between v_from and v_to), 0) end as pscore,
           c.last_at
    from cur c
  ),
  r as (select c.uid, c.score, row_number() over (order by c.score desc, c.last_at asc, c.uid) as rk from cur c),
  pr as (select p.uid, row_number() over (order by p.pscore desc, p.last_at asc, p.uid) as rk from prev p where p.pscore > 0)
  select r.rk, r.uid, r.score, pr.rk, count(*) over () from r left join pr on pr.uid = r.uid order by r.rk;
end $$;

create or replace function public.orbit_leaderboard(p_scope text, p_period text, p_limit integer default 20, p_offset integer default 0)
returns table (rank bigint, user_id uuid, username text, full_name text, avatar_key text, score bigint, prev_rank bigint, total bigint,
  in_progress boolean, period_start date, period_end date)
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := public.orbit_today(); v_from date; v_to date;
begin
  if p_period = 'weekly' then v_from := date_trunc('week', v_today::timestamp)::date; v_to := v_from + 6;
  elsif p_period = 'monthly' then v_from := date_trunc('month', v_today::timestamp)::date; v_to := (v_from + interval '1 month' - interval '1 day')::date; end if;
  return query
    select r.rank, r.user_id, p.username, p.full_name, p.avatar_key, r.score, r.prev_rank, r.total, (v_to is not null and v_to >= v_today), v_from, v_to
    from public._orbit_ranked(p_scope, p_period) r join public.profiles p on p.id = r.user_id
    order by r.rank
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

create or replace function public.orbit_my_rank(p_scope text, p_period text)
returns table (rank bigint, score bigint, prev_rank bigint, total bigint, participating boolean, has_college boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_part boolean; v_col boolean;
begin
  select orbits_on_leaderboard, college_id is not null into v_part, v_col from public.profiles where id = v_me;
  return query
    with rk as (select * from public._orbit_ranked(p_scope, p_period))
    select m.rank, m.score, m.prev_rank, m.total, v_part, v_col from rk m where m.user_id = v_me
    union all
    select null::bigint, 0::bigint, null::bigint, (select count(*) from rk), v_part, v_col where not exists (select 1 from rk m2 where m2.user_id = v_me);
end $$;

-- ── Achievements ─────────────────────────────────────────────────────────────
create or replace function public.orbit_my_achievements() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'category', a.category, 'title', a.title, 'description', a.description, 'icon', a.icon, 'tier', a.tier,
      'target', (a.criteria->>'value')::int, 'type', a.criteria->>'type',
      'earned', coalesce((select jsonb_agg(jsonb_build_object('earned_at', u.earned_at, 'scope', u.scope, 'period', u.period, 'rank', u.rank, 'score', u.score) order by u.earned_at desc)
                          from public.orbit_user_achievements u where u.user_id = v_me and u.achievement_id = a.id), '[]'::jsonb)) order by a.sort_order)
    from public.orbit_achievements a where a.active), '[]'::jsonb);
end $$;

-- What a member's profile (or public achievement page) may show to a viewer who is allowed to see the profile.
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
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'description', a.description, 'icon', a.icon, 'tier', a.tier, 'category', a.category,
          'earned_at', u.earned_at, 'scope', u.scope, 'period', u.period, 'rank', u.rank) order by u.earned_at desc)
        from (select * from public.orbit_user_achievements where user_id = p.id order by earned_at desc limit 60) u join public.orbit_achievements a on a.id = u.achievement_id), '[]'::jsonb)
      else null end);
end $$;

-- ═════════════════════════ Seasons ═══════════════════════════════════════════
-- Finalising a season records the real top 10s from the ledger for that season's dates and awards each badge once.
-- Global: top 10 of everyone. College: top 10 within each (self-reported) college with at least `min_group_size` participants.
-- Connections: for each member, their rank among their own connections, when that group has at least `min_group_size` members.
create or replace function public._orbit_finalize(p_season uuid, p_actor uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.orbit_seasons%rowtype; v_min int := public._orbit_num('min_group_size'); v_awarded int := 0; r record; v_ach text; v_bonus int;
begin
  select * into s from public.orbit_seasons where id = p_season for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if s.status <> 'active' then raise exception 'already_finalized' using errcode = '22023'; end if;
  if s.ends_on >= public.orbit_today() then raise exception 'season_not_ended' using errcode = '22023'; end if;

  drop table if exists _sc;
  create temporary table _sc on commit drop as
    select l.user_id as uid, sum(l.amount)::int as score, max(l.created_at) as last_at, p.college_id
    from public.orbit_ledger l join public.profiles p on p.id = l.user_id
    where l.day between s.starts_on and s.ends_on and p.status = 'active' and p.orbits_on_leaderboard
    group by l.user_id, p.college_id having sum(l.amount) > 0;

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

create or replace function public.orbit_finalize_due_seasons() returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.orbit_seasons where status = 'active' and ends_on < public.orbit_today() order by ends_on loop
    perform public._orbit_finalize(r.id, null); n := n + 1;
  end loop;
  return n;
end $$;

-- ═════════════════════════ Administration ════════════════════════════════════
create or replace function public._orbit_admin(p_perm text) returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission(p_perm, null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return v;
end $$;

insert into public.role_permissions(role, permission) values ('global_admin', 'orbits.manage'), ('global_admin', 'orbits.ledger') on conflict do nothing;

create or replace function public.orbit_admin_questions(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, question text, options jsonb, correct_index smallint, explanation text, category text, publish_date date, status text, source text,
  reviewed_at timestamptz, answers bigint, correct bigint, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._orbit_admin('orbits.manage');
  return query select q.id, q.question, q.options, q.correct_index, q.explanation, q.category, q.publish_date, q.status, q.source, q.reviewed_at,
    (select count(*) from public.orbit_answers a where a.question_id = q.id), (select count(*) from public.orbit_answers a where a.question_id = q.id and a.is_correct),
    count(*) over ()
    from public.orbit_questions q where p_status is null or q.status = p_status
    order by q.publish_date desc, q.created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.orbit_admin_save_question(
  p_id uuid, p_question text, p_options jsonb, p_correct integer, p_explanation text, p_category text, p_date date, p_status text, p_source text default 'manual'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.manage'); v_id uuid; v_old public.orbit_questions%rowtype; v_opts jsonb; i int;
begin
  if p_status not in ('draft', 'scheduled', 'published', 'archived') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then raise exception 'invalid_options' using errcode = '22023'; end if;
  v_opts := '[]'::jsonb;
  for i in 0..3 loop
    if char_length(btrim(p_options ->> i)) not between 1 and 200 then raise exception 'invalid_options' using errcode = '22023'; end if;
    v_opts := v_opts || to_jsonb(btrim(p_options ->> i));
  end loop;
  if (select count(distinct lower(x)) from jsonb_array_elements_text(v_opts) x) <> 4 then raise exception 'duplicate_options' using errcode = '22023'; end if;
  if p_correct is null or p_correct not between 0 and 3 then raise exception 'invalid_correct' using errcode = '22023'; end if;
  if p_status in ('scheduled', 'published') and p_date < public.orbit_today() and p_id is null then raise exception 'date_in_past' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.orbit_questions(question, options, correct_index, explanation, category, publish_date, status, source, created_by, reviewed_by, reviewed_at)
    values (btrim(p_question), v_opts, p_correct, btrim(p_explanation), p_category, p_date, p_status, coalesce(p_source, 'manual'), v_actor,
            case when p_status in ('scheduled', 'published') then v_actor end, case when p_status in ('scheduled', 'published') then now() end)
    returning id into v_id;
  else
    select * into v_old from public.orbit_questions where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    -- once members have answered, the content that decides right and wrong is frozen
    if exists (select 1 from public.orbit_answers where question_id = p_id)
       and (v_old.options is distinct from v_opts or v_old.correct_index <> p_correct or v_old.question <> btrim(p_question)) then
      raise exception 'has_answers' using errcode = '22023';
    end if;
    update public.orbit_questions set question = btrim(p_question), options = v_opts, correct_index = p_correct, explanation = btrim(p_explanation), category = p_category,
      publish_date = p_date, status = p_status, updated_at = now(),
      reviewed_by = case when p_status in ('scheduled', 'published') and reviewed_by is null then v_actor else reviewed_by end,
      reviewed_at = case when p_status in ('scheduled', 'published') and reviewed_at is null then now() else reviewed_at end
    where id = p_id returning id into v_id;
  end if;
  perform public.write_audit_log(v_actor, 'orbits.question_saved', 'orbit_question', v_id::text, null, jsonb_build_object('status', p_status, 'publish_date', p_date));
  return v_id;
exception when unique_violation then
  raise exception 'date_taken' using errcode = '23505';
end $$;

create or replace function public.orbit_admin_config() returns table (key text, value jsonb, description text) language plpgsql stable security definer set search_path = '' as $$
begin perform public._orbit_admin('orbits.manage'); return query select c.key, c.value, c.description from public.orbit_config c order by c.key; end $$;

create or replace function public.orbit_admin_set_config(p_key text, p_value jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.manage'); v_old jsonb; k text;
begin
  select value into v_old from public.orbit_config where orbit_config.key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = '22023'; end if;
  if p_key = 'streak_bonus' then
    if jsonb_typeof(p_value) <> 'object' then raise exception 'invalid_value' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(p_value) loop
      if k !~ '^[0-9]{1,3}$' or jsonb_typeof(p_value -> k) <> 'number' or (p_value ->> k)::numeric not between 0 and 1000 or (p_value ->> k)::numeric <> floor((p_value ->> k)::numeric) then
        raise exception 'invalid_value' using errcode = '22023'; end if;
    end loop;
  else
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 0 and 1000 or (p_value #>> '{}')::numeric <> floor((p_value #>> '{}')::numeric) then
      raise exception 'invalid_value' using errcode = '22023'; end if;
  end if;
  update public.orbit_config set value = p_value, updated_at = now(), updated_by = v_actor where orbit_config.key = p_key;
  perform public.write_audit_log(v_actor, 'orbits.config_changed', 'orbit_config', p_key, null, jsonb_build_object('from', v_old, 'to', p_value));
end $$;

create or replace function public.orbit_admin_achievements() returns setof public.orbit_achievements language plpgsql stable security definer set search_path = '' as $$
begin perform public._orbit_admin('orbits.manage'); return query select * from public.orbit_achievements order by sort_order; end $$;

create or replace function public.orbit_admin_update_achievement(p_id text, p_title text, p_description text, p_bonus integer, p_active boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.manage');
begin
  update public.orbit_achievements set title = btrim(p_title), description = btrim(p_description), bonus = p_bonus, active = p_active where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.write_audit_log(v_actor, 'orbits.achievement_changed', 'orbit_achievement', p_id, null, jsonb_build_object('bonus', p_bonus, 'active', p_active));
end $$;

create or replace function public.orbit_admin_ledger(p_user uuid default null, p_kind text default null, p_limit integer default 25, p_offset integer default 0)
returns table (id uuid, user_id uuid, username text, kind text, amount integer, day date, source_type text, source_id text, reason text, reversed boolean, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._orbit_admin('orbits.ledger');
  return query select l.id, l.user_id, p.username, l.kind, l.amount, l.day, l.source_type, l.source_id, l.reason,
      exists (select 1 from public.orbit_ledger x where x.reverses_id = l.id), l.created_at, count(*) over ()
    from public.orbit_ledger l join public.profiles p on p.id = l.user_id
    where (p_user is null or l.user_id = p_user) and (p_kind is null or l.kind = p_kind)
    order by l.created_at desc, l.id limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- A documented correction: a compensating entry, never an edit. A negative entry cannot take a balance below zero.
create or replace function public.orbit_admin_adjust(p_user uuid, p_amount integer, p_reason text, p_key text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.ledger'); v_bal int; v_amt int := p_amount; v_new boolean; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_key is null or char_length(p_key) < 8 then raise exception 'invalid_key' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select balance into v_bal from public.orbit_balances where user_id = p_user;
  if v_amt < 0 then v_amt := -least(-v_amt, coalesce(v_bal, 0)); end if;
  if v_amt = 0 then raise exception 'nothing_to_remove' using errcode = '22023'; end if;
  insert into public.orbit_ledger(user_id, kind, amount, idempotency_key, day, source_type, reason, created_by)
  values (p_user, 'manual_adjustment', v_amt, 'adj:' || p_key, public.orbit_today(), 'admin', left(v_reason, 500), v_actor) on conflict (idempotency_key) do nothing;
  v_new := found;
  if v_new then perform public.write_audit_log(v_actor, 'orbits.manual_adjustment', 'user', p_user::text, null, jsonb_build_object('amount', v_amt, 'requested', p_amount, 'reason', left(v_reason, 200))); end if;
  return jsonb_build_object('applied', v_new, 'amount', v_amt, 'balance', coalesce((select balance from public.orbit_balances where user_id = p_user), 0));
end $$;

create or replace function public.orbit_admin_reverse(p_entry uuid, p_reason text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.ledger'); r public.orbit_ledger%rowtype; v_bal int; v_take int; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into r from public.orbit_ledger where id = p_entry;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
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

create or replace function public.orbit_admin_suspicious(p_days integer default 7)
returns table (user_id uuid, username text, earned bigint, entries bigint, best_day_earned bigint, posts_rewarded bigint, flagged boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_from date := public.orbit_today() - (least(greatest(p_days, 1), 60) - 1); v_limit int := public._orbit_num('suspicious_daily_orbits');
begin
  perform public._orbit_admin('orbits.ledger');
  return query
    select s.uid, p.username, s.earned, s.entries, s.best, s.posts, (s.best >= v_limit)
    from (select l.user_id as uid, sum(l.amount) filter (where l.amount > 0) as earned, count(*) as entries,
                 max(d.day_sum) as best, count(*) filter (where l.kind = 'post') as posts
          from public.orbit_ledger l
          join lateral (select sum(x.amount) filter (where x.amount > 0) as day_sum from public.orbit_ledger x where x.user_id = l.user_id and x.day = l.day) d on true
          where l.day >= v_from group by l.user_id) s
    join public.profiles p on p.id = s.uid
    order by (s.best >= v_limit) desc, s.earned desc nulls last limit 25;
end $$;

create or replace function public.orbit_admin_metrics(p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_days int := least(greatest(p_days, 1), 120); v_from date := public.orbit_today() - (least(greatest(p_days, 1), 120) - 1); v_out jsonb;
begin
  perform public._orbit_admin('orbits.manage');
  select jsonb_build_object(
    'days', v_days,
    'participants', (select count(distinct user_id) from (select user_id from public.orbit_checkins where day >= v_from union select user_id from public.orbit_answers where (answered_at at time zone 'Asia/Kolkata')::date >= v_from union select user_id from public.orbit_streak_days where day >= v_from) x),
    'checkins', (select count(*) from public.orbit_checkins where day >= v_from),
    'challenge_answers', (select count(*) from public.orbit_answers where (answered_at at time zone 'Asia/Kolkata')::date >= v_from),
    'challenge_correct', (select count(*) from public.orbit_answers where is_correct and (answered_at at time zone 'Asia/Kolkata')::date >= v_from),
    'contribution_days', (select count(*) from public.orbit_streak_days where day >= v_from and kind in ('post', 'helpful')),
    'orbits_issued', (select coalesce(sum(amount) filter (where amount > 0), 0) from public.orbit_ledger where day >= v_from),
    'orbits_reversed', (select coalesce(-sum(amount) filter (where amount < 0), 0) from public.orbit_ledger where day >= v_from),
    'active_streaks', (select count(*) from public.orbit_streaks where last_day >= public.orbit_today() - 1 and current_streak >= 3),
    'badges_awarded', (select count(*) from public.orbit_user_achievements where earned_at >= now() - make_interval(days => v_days)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'checkins', d.c, 'answers', d.a, 'contributions', d.k) order by d.day)
                       from (select g::date as day, (select count(*) from public.orbit_checkins where day = g::date) c,
                                    (select count(*) from public.orbit_answers where (answered_at at time zone 'Asia/Kolkata')::date = g::date) a,
                                    (select count(*) from public.orbit_streak_days where day = g::date and kind in ('post', 'helpful')) k
                             from generate_series(v_from, public.orbit_today(), interval '1 day') g) d), '[]'::jsonb),
    -- "returned within 7 days": members whose first Orbit activity was 8+ days ago and who were active again within 7 days of it
    'returned_7d', (select jsonb_build_object('cohort', count(*), 'returned', count(*) filter (where back)) from (
        select f.uid, exists (select 1 from (select user_id, day from public.orbit_checkins union all select user_id, day from public.orbit_streak_days) a
                              where a.user_id = f.uid and a.day > f.first_day and a.day <= f.first_day + 7) as back
        from (select user_id as uid, min(day) as first_day from (select user_id, day from public.orbit_checkins union all select user_id, day from public.orbit_streak_days) u group by user_id) f
        where f.first_day <= public.orbit_today() - 8 and f.first_day >= v_from) c)
  ) into v_out;
  return v_out;
end $$;

create or replace function public.orbit_admin_seasons() returns setof public.orbit_seasons language plpgsql stable security definer set search_path = '' as $$
begin perform public._orbit_admin('orbits.manage'); return query select * from public.orbit_seasons order by starts_on desc; end $$;

create or replace function public.orbit_admin_save_season(p_id uuid, p_name text, p_from date, p_to date) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.manage'); v_id uuid;
begin
  if p_to < p_from then raise exception 'invalid_range' using errcode = '22023'; end if;
  if exists (select 1 from public.orbit_seasons s where s.id is distinct from p_id and daterange(s.starts_on, s.ends_on, '[]') && daterange(p_from, p_to, '[]')) then
    raise exception 'season_overlap' using errcode = '22023'; end if;
  if p_id is null then insert into public.orbit_seasons(name, starts_on, ends_on) values (btrim(p_name), p_from, p_to) returning id into v_id;
  else update public.orbit_seasons set name = btrim(p_name), starts_on = p_from, ends_on = p_to where id = p_id and status = 'active' returning id into v_id;
    if v_id is null then raise exception 'not_editable' using errcode = '22023'; end if; end if;
  perform public.write_audit_log(v_actor, 'orbits.season_saved', 'orbit_season', v_id::text, null, jsonb_build_object('from', p_from, 'to', p_to));
  return v_id;
end $$;

create or replace function public.orbit_admin_finalize_season(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._orbit_admin('orbits.manage');
begin return public._orbit_finalize(p_id, v_actor); end $$;

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke execute on function
  public.orbit_today(), public._orbit_cfg(text), public._orbit_num(text), public._orbit_award(uuid, text, integer, text, text, text, date),
  public._orbit_check_achievements(uuid), public._orbit_mark_day(uuid, date, text), public._orbit_current_question(uuid), public._orbit_ranked(text, text),
  public._orbit_finalize(uuid, uuid), public._orbit_admin(text), public.orbit_finalize_due_seasons(), public._orbit_on_post(), public._orbit_on_post_removed(),
  public._orbit_on_comment_like(), public._orbit_on_project_member(), public.orbit_ledger_apply(), public.orbit_ledger_immutable()
from public, anon, authenticated;
grant execute on function public.orbit_today() to authenticated, service_role;
grant execute on function public.orbit_finalize_due_seasons() to service_role;

revoke execute on function
  public.orbit_overview(), public.orbit_claim_checkin(), public.orbit_daily_question(), public.orbit_submit_answer(uuid, integer),
  public.orbit_my_history(integer, integer), public.orbit_leaderboard(text, text, integer, integer), public.orbit_my_rank(text, text),
  public.orbit_my_achievements(), public.orbit_profile_summary(text),
  public.orbit_admin_questions(text, integer, integer),
  public.orbit_admin_save_question(uuid, text, jsonb, integer, text, text, date, text, text), public.orbit_admin_config(), public.orbit_admin_set_config(text, jsonb),
  public.orbit_admin_achievements(), public.orbit_admin_update_achievement(text, text, text, integer, boolean), public.orbit_admin_ledger(uuid, text, integer, integer),
  public.orbit_admin_adjust(uuid, integer, text, text), public.orbit_admin_reverse(uuid, text), public.orbit_admin_suspicious(integer), public.orbit_admin_metrics(integer),
  public.orbit_admin_seasons(), public.orbit_admin_save_season(uuid, text, date, date), public.orbit_admin_finalize_season(uuid)
from public, anon;
grant execute on function
  public.orbit_overview(), public.orbit_claim_checkin(), public.orbit_daily_question(), public.orbit_submit_answer(uuid, integer),
  public.orbit_my_history(integer, integer), public.orbit_leaderboard(text, text, integer, integer), public.orbit_my_rank(text, text),
  public.orbit_my_achievements(), public.orbit_profile_summary(text),
  public.orbit_admin_questions(text, integer, integer),
  public.orbit_admin_save_question(uuid, text, jsonb, integer, text, text, date, text, text), public.orbit_admin_config(), public.orbit_admin_set_config(text, jsonb),
  public.orbit_admin_achievements(), public.orbit_admin_update_achievement(text, text, text, integer, boolean), public.orbit_admin_ledger(uuid, text, integer, integer),
  public.orbit_admin_adjust(uuid, integer, text, text), public.orbit_admin_reverse(uuid, text), public.orbit_admin_suspicious(integer), public.orbit_admin_metrics(integer),
  public.orbit_admin_seasons(), public.orbit_admin_save_season(uuid, text, date, date), public.orbit_admin_finalize_season(uuid)
to authenticated;

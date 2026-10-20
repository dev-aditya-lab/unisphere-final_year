-- Discovery: composer suggestions and the personalised "For you" feed.
--
-- 1. suggest_hashtags    prefix search over tags that appear in PUBLIC posts only (no private content leaks through a tag
--                        name). Uses a text_pattern_ops index, returns at most 10 rows, never scans the whole table.
-- 2. mention_suggestions people for "@" in the composer: prefix match on username / name words (existing trigram
--                        indexes), people the viewer follows first. Runs as the caller, so profile RLS applies.
-- 3. post_feedback       "not relevant" marks. Private to the member (RLS), used to hide a post and to lower similar ones.
-- 4. feed_candidates     a bounded, newest-first page of posts the caller may see (post_feed applies RLS), without
--                        private / community / the member's dismissed posts. Ranking happens in application code.
-- 5. viewer_affinity     what the member's own recent reactions, bookmarks and comments say they like, aggregated in
--                        the database (one small JSON document instead of hundreds of rows).
-- Nothing here calls an AI model, and no function bypasses RLS except suggest_hashtags, which reads only tags of
-- published public posts and is gated by can_use_network().

-- ── 1. Hashtag suggestions ───────────────────────────────────────────────────
create index if not exists hashtags_tag_prefix_idx on public.hashtags (tag text_pattern_ops);

create or replace function public.suggest_hashtags(p_prefix text default '', p_limit integer default 6)
returns table (tag text, uses bigint)
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  v_prefix text := left(lower(regexp_replace(coalesce(p_prefix, ''), '[^a-zA-Z0-9_]', '', 'g')), 40);
begin
  if (select auth.uid()) is null or not public.can_use_network() then
    return;
  end if;
  return query
    select h.tag, count(*)::bigint as uses
    from public.hashtags h
    join public.post_hashtags ph on ph.hashtag_id = h.id
    join public.posts p on p.id = ph.post_id
    where h.tag like replace(v_prefix, '_', '\_') || '%'
      and p.status = 'published'
      and p.visibility = 'public'
      and p.created_at > now() - interval '180 days'
    group by h.tag
    order by uses desc, h.tag
    limit least(greatest(p_limit, 1), 10);
end;
$$;
revoke all on function public.suggest_hashtags(text, integer) from public, anon;
grant execute on function public.suggest_hashtags(text, integer) to authenticated;

-- ── 2. Mention suggestions ───────────────────────────────────────────────────
create or replace function public.mention_suggestions(p_query text default '', p_limit integer default 6)
returns table (id uuid, username text, full_name text, avatar_key text, headline text, verified boolean, followed boolean)
language plpgsql
stable
set search_path = public, extensions
set plan_cache_mode = force_custom_plan
as $$
declare
  v_me uuid := (select auth.uid());
  v_q text := lower(btrim(left(coalesce(p_query, ''), 30)));
  v_like text := public.escape_like(v_q);
begin
  if v_me is null then
    return;
  end if;
  return query
    select p.id, p.username, p.full_name, p.avatar_key, p.headline,
           (p.verification_status = 'verified'),
           exists (select 1 from public.follows f where f.follower_id = v_me and f.following_id = p.id)
    from public.profiles p
    where p.id <> v_me
      and p.status = 'active'
      and (
        (v_q = '' and exists (select 1 from public.follows f where f.follower_id = v_me and f.following_id = p.id))
        or (v_q <> '' and (p.username ilike v_like || '%' or p.full_name ilike v_like || '%' or p.full_name ilike '% ' || v_like || '%'))
      )
    order by 7 desc, (p.username = v_q) desc, (p.username ilike v_like || '%') desc, p.username
    limit least(greatest(p_limit, 1), 8);
end;
$$;
grant execute on function public.mention_suggestions(text, integer) to authenticated;

-- ── 3. "Not relevant" feedback ───────────────────────────────────────────────
create table if not exists public.post_feedback (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  kind text not null default 'not_relevant' check (kind in ('not_relevant')),
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists post_feedback_user_idx on public.post_feedback (user_id, created_at desc);

alter table public.post_feedback enable row level security;
grant select, insert, delete on public.post_feedback to authenticated;
drop policy if exists post_feedback_select on public.post_feedback;
create policy post_feedback_select on public.post_feedback for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists post_feedback_insert on public.post_feedback;
create policy post_feedback_insert on public.post_feedback for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists post_feedback_delete on public.post_feedback;
create policy post_feedback_delete on public.post_feedback for delete to authenticated using (user_id = (select auth.uid()));

-- ── 4. Feed candidates ───────────────────────────────────────────────────────
create or replace function public.feed_candidates(
  p_limit integer default 90,
  p_before_ts timestamp with time zone default null,
  p_before_id uuid default null,
  p_category text default null
)
returns setof public.post_feed
language plpgsql
stable
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_limit integer := least(greatest(p_limit, 1), 150);
  v_me uuid := (select auth.uid());
begin
  return query
    select pf.*
    from public.post_feed pf
    where pf.status = 'published'
      and pf.visibility in ('public', 'college', 'connections')
      and pf.community_id is null
      and (p_category is null or pf.category = p_category)
      and (p_before_ts is null or (pf.created_at, pf.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      and not exists (select 1 from public.post_feedback fb where fb.user_id = v_me and fb.post_id = pf.id)
    order by pf.created_at desc, pf.id desc
    limit v_limit;
end;
$$;
grant execute on function public.feed_candidates(integer, timestamp with time zone, uuid, text) to authenticated;

-- ── 5. Viewer affinity ───────────────────────────────────────────────────────
-- Weights: a reaction counts 1, a comment 1.5, a bookmark 2 (a deliberate "keep this"). Only the member's own rows
-- from the last p_days, newest first and capped, so the work is bounded however active they are.
create or replace function public.viewer_affinity(p_days integer default 60)
returns jsonb
language plpgsql
stable
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_me uuid := (select auth.uid());
  v_since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 180));
  v_out jsonb;
begin
  if v_me is null then
    return '{}'::jsonb;
  end if;
  with acts as (
    (select post_id, 1.0::numeric as w from public.post_reactions where user_id = v_me and created_at > v_since order by created_at desc limit 150)
    union all
    (select post_id, 2.0 from public.bookmarks where user_id = v_me and created_at > v_since order by created_at desc limit 100)
    union all
    (select post_id, 1.5 from public.comments where author_id = v_me and status = 'published' and created_at > v_since order by created_at desc limit 100)
  ),
  liked as (
    select p.id, p.category, p.author_id, sum(a.w) as w
    from acts a join public.posts p on p.id = a.post_id
    where p.author_id <> v_me
    group by p.id, p.category, p.author_id
  ),
  dismissed as (
    select p.category, p.author_id
    from (select post_id from public.post_feedback where user_id = v_me order by created_at desc limit 60) d
    join public.posts p on p.id = d.post_id
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_object_agg(category, w) from (select category, sum(w) as w from liked group by category) c), '{}'::jsonb),
    'authors', coalesce((select jsonb_object_agg(author_id, w) from (select author_id, sum(w) as w from liked group by author_id order by 2 desc limit 20) a), '{}'::jsonb),
    'tags', coalesce((
      select jsonb_object_agg(t.tag, t.w) from (
        select h.tag, sum(l.w) as w
        from liked l
        join public.post_hashtags ph on ph.post_id = l.id
        join public.hashtags h on h.id = ph.hashtag_id
        group by h.tag order by 2 desc limit 20
      ) t), '{}'::jsonb),
    'dismissedCategories', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) as n from dismissed group by category) x), '{}'::jsonb),
    'dismissedAuthors', coalesce((select jsonb_object_agg(author_id, n) from (select author_id, count(*) as n from dismissed group by author_id limit 20) y), '{}'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;
grant execute on function public.viewer_affinity(integer) to authenticated;

-- Index the "which of my posts did I react to / comment on recently" lookups the function relies on.
create index if not exists comments_author_recent_idx on public.comments (author_id, created_at desc);

-- ── 6. Posts for one hashtag ─────────────────────────────────────────────────
-- Newest first and bounded, whatever the tag's popularity (the old query took the first 200 links in no particular order).
create or replace function public.posts_by_hashtag(p_tag text, p_limit integer default 30)
returns setof public.post_feed
language plpgsql
stable
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
begin
  return query
    with t as (select h.id from public.hashtags h where h.tag = lower(left(btrim(coalesce(p_tag, '')), 40)))
    select pf.*
    from public.post_hashtags ph
    join t on t.id = ph.hashtag_id
    join public.post_feed pf on pf.id = ph.post_id
    where pf.status = 'published'
    order by pf.created_at desc, pf.id desc
    limit least(greatest(p_limit, 1), 50);
end;
$$;
grant execute on function public.posts_by_hashtag(text, integer) to authenticated;

-- ── 7. Mention notifications respect the post's audience for comments too ────
create or replace function public.trg_notify_mention() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.posts%rowtype; c public.comments%rowtype; v_actor uuid; v_slug text; v_cat text; v_title text;
begin
  if new.entity_type = 'post' then
    select * into p from public.posts where id = new.entity_id;
    if not found then return null; end if;
    v_actor := p.author_id;
  else
    select * into c from public.comments where id = new.entity_id;
    if not found then return null; end if;
    select * into p from public.posts where id = c.post_id;
    if not found then return null; end if;
    v_actor := c.author_id;
  end if;
  v_slug := p.slug; v_cat := p.category; v_title := coalesce(p.title, public._snippet(p.body, 60));
  -- only notify people who could actually see the post the mention is on
  if p.visibility in ('private', 'connections') and not public.are_connected(p.author_id, new.mentioned_user_id) then return null; end if;
  perform public.notify(new.mentioned_user_id, 'mention', v_actor, 'post', p.id,
    jsonb_build_object('slug', v_slug, 'category', v_cat, 'title', v_title), 'mention:' || new.entity_id);
  return null;
end; $$;

-- ── 8. Personalisation control ───────────────────────────────────────────────
-- On by default. Off: the "For you" feed ignores the member's interests, follows and activity (newest, substance and
-- variety only). Same pattern as ai_assist_enabled.
alter table public.profiles add column if not exists personalize_feed boolean not null default true;
grant update (personalize_feed) on public.profiles to authenticated;

-- ── 9. Signed-in members only ────────────────────────────────────────────────
-- Functions are executable by anon by default in Supabase; none of these has anything to offer a visitor.
revoke execute on function public.mention_suggestions(text, integer) from public, anon;
revoke execute on function public.feed_candidates(integer, timestamp with time zone, uuid, text) from public, anon;
revoke execute on function public.viewer_affinity(integer) from public, anon;
revoke execute on function public.posts_by_hashtag(text, integer) from public, anon;

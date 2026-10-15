-- Performance: custom plans for the feed and search RPCs.
--
-- Evidence (local database, 91 posts): EXPLAIN ANALYZE of `select * from feed_posts('college', ...)` read 3,233 buffers
-- and took 88 ms, while the identical query written inline read 66 buffers and took 11 ms. These were `language sql`
-- functions with `set search_path`, which the planner cannot inline, and whose statements are planned once for ANY
-- parameter values. Conditions such as `case p_scope ...`, `p_category is null or ...` and `p_college is null or ...`
-- therefore could not use `posts_college_idx` / `posts_feed_idx` or stop early at the LIMIT, and the work grew with
-- the total number of posts rather than the page size.
--
-- The functions below keep their exact signatures, return types, search paths and query text. They are now plpgsql
-- with `plan_cache_mode = force_custom_plan`, so each call is planned for its real arguments (the unused branches
-- fold away and the right index is chosen). `feed_posts` additionally picks its branch with IF instead of CASE.
-- Results are unchanged (compared row by row against the previous definitions for 12 members); only ties between
-- rows with an identical sort key may come back in a different order, as before.

create or replace function public.feed_posts(
  p_scope text default 'college',
  p_category text default null,
  p_before_ts timestamp with time zone default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns setof public.post_feed
language plpgsql
stable
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
declare
  v_limit integer := least(greatest(p_limit, 1), 50);
begin
  if p_scope = 'college' then
    return query
      select pf.*
      from public.post_feed pf
      where pf.status = 'published'
        and (p_category is null or pf.category = p_category)
        and pf.college_id is not null and pf.college_id = public.my_college_id()
        and (p_before_ts is null or (pf.created_at, pf.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      order by pf.created_at desc, pf.id desc
      limit v_limit;
  elsif p_scope = 'following' then
    return query
      select pf.*
      from public.post_feed pf
      where pf.status = 'published'
        and (p_category is null or pf.category = p_category)
        and (
          pf.author_id = (select auth.uid())
          or exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = pf.author_id)
        )
        and (p_before_ts is null or (pf.created_at, pf.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      order by pf.created_at desc, pf.id desc
      limit v_limit;
  else
    return query
      select pf.*
      from public.post_feed pf
      where pf.status = 'published'
        and (p_category is null or pf.category = p_category)
        and pf.visibility = 'public'
        and (p_before_ts is null or (pf.created_at, pf.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
      order by pf.created_at desc, pf.id desc
      limit v_limit;
  end if;
end;
$$;

create or replace function public.related_people(p_keywords text[], p_exclude_self boolean DEFAULT true, p_limit integer DEFAULT 6)
returns TABLE(id uuid, username text, full_name text, avatar_key text, headline text, account_type text, verified boolean, matched_skills text[], matched_interests text[], open_to_collaboration boolean, open_to_mentoring boolean, score real)
language plpgsql
stable
set search_path = public
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
begin
  return query
with kw as (
    select array(select distinct regexp_replace(lower(k), '[^a-z0-9+#.\- ]', '', 'g') from unnest(coalesce(p_keywords, '{}')) k
                 where char_length(k) >= 3 limit 12) as terms
  ),
  matches as (
    select
      p.*,
      array(select s from unnest(p.skills) s where exists (
        select 1 from unnest(kw.terms) t where lower(s) = t or lower(s) like '%' || public.escape_like(t) || '%' or t like '%' || public.escape_like(lower(s)) || '%')) as m_skills,
      array(select s from unnest(p.interests) s where exists (
        select 1 from unnest(kw.terms) t where lower(s) = t or lower(s) like '%' || public.escape_like(t) || '%')) as m_interests
    from public.profiles p, kw
    where p.status = 'active' and p.onboarded_at is not null
      and (not p_exclude_self or p.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid))
  )
  select m.id, m.username, m.full_name, m.avatar_key, m.headline, m.account_type,
         (m.verification_status = 'verified'), m.m_skills, m.m_interests,
         m.open_to_collaboration, m.open_to_mentoring,
         (cardinality(m.m_skills) * 1.0 + cardinality(m.m_interests) * 0.4
           + case when m.open_to_collaboration then 0.3 else 0 end)::real
  from matches m
  where cardinality(m.m_skills) > 0 or cardinality(m.m_interests) > 0
  order by 12 desc, m.full_name
  limit least(greatest(p_limit, 1), 20);
end;
$$;

create or replace function public.related_posts(p_keywords text[], p_embedding vector DEFAULT NULL::vector, p_exclude uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 8)
returns TABLE(id uuid, slug text, title text, body text, category text, visibility text, author_id uuid, author_name text, author_username text, author_avatar_key text, created_at timestamp with time zone, reaction_count integer, comment_count integer, score real, semantic real, keyword real, shared_terms text[], used_embeddings boolean)
language plpgsql
stable
set search_path = public,extensions
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
begin
  return query
with q as (select public.keywords_tsquery(p_keywords) as tsq),
  scored as (
    select
      pf.id, pf.slug, pf.title, pf.body, pf.category, pf.visibility, pf.author_id, pf.author_name,
      pf.author_username, pf.author_avatar_key, pf.created_at, pf.reaction_count, pf.comment_count,
      case when p_embedding is not null and e.embedding is not null
           then greatest(0, 1 - (e.embedding <=> p_embedding))::real end as semantic,
      case when q.tsq is not null then least(1, ts_rank_cd(p.search_vector, q.tsq, 32))::real else 0::real end as keyword,
      exp(- extract(epoch from (now() - pf.created_at)) / 86400.0 / 120.0)::real as recency,
      least(1, ln(1 + pf.reaction_count + 2 * pf.comment_count) / ln(31))::real as engagement
    from public.post_feed pf
    join public.posts p on p.id = pf.id
    left join public.embeddings e on e.entity_type = 'post' and e.entity_id = pf.id
    cross join q
    where pf.status = 'published'
      and pf.repost_of_id is null
      and pf.visibility in ('public', 'college')
      and (p_exclude is null or pf.id <> p_exclude)
      and (
        (q.tsq is not null and p.search_vector @@ q.tsq)
        or (p_embedding is not null and e.embedding is not null and (e.embedding <=> p_embedding) < 0.55)
      )
  ),
  ranked as (
    select s.*,
      case when p_embedding is not null
           then 0.45 * coalesce(s.semantic, 0) + 0.30 * s.keyword + 0.10 * s.recency + 0.15 * s.engagement
           else 0.60 * s.keyword + 0.15 * s.recency + 0.25 * s.engagement end::real as score
    from scored s
    order by score desc
    limit least(greatest(p_limit, 1), 20)
  )
  select r.id, r.slug, r.title, r.body, r.category, r.visibility, r.author_id, r.author_name,
         r.author_username, r.author_avatar_key, r.created_at, r.reaction_count, r.comment_count,
         r.score, r.semantic, r.keyword,
         array(
           select k from unnest(coalesce(p_keywords, '{}')) k
           where char_length(k) >= 3
             and to_tsvector('english', coalesce(r.title, '') || ' ' || r.body) @@ plainto_tsquery('english', k)
           limit 6
         ) as shared_terms,
         (p_embedding is not null) as used_embeddings
  from ranked r
  order by r.score desc;
end;
$$;

create or replace function public.search_people(p_query text DEFAULT NULL::text, p_college uuid DEFAULT NULL::uuid, p_account_type text DEFAULT NULL::text, p_skills text[] DEFAULT NULL::text[], p_open_to_collab boolean DEFAULT NULL::boolean, p_open_to_mentoring boolean DEFAULT NULL::boolean, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
returns TABLE(id uuid, username text, full_name text, avatar_key text, headline text, account_type text, verified boolean, college_id uuid, skills text[], open_to_collaboration boolean, open_to_mentoring boolean, graduation_year smallint, rank real)
language plpgsql
stable
set search_path = public,extensions
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
begin
  return query
with q as (
    select nullif(trim(coalesce(p_query, '')), '') as term
  )
  select
    p.id, p.username, p.full_name, p.avatar_key, p.headline, p.account_type,
    (p.verification_status = 'verified') as verified, p.college_id, p.skills,
    p.open_to_collaboration, p.open_to_mentoring, p.graduation_year,
    (
      case when q.term is null then 0 else
        ts_rank(p.search_vector, websearch_to_tsquery('simple', q.term))
        + case when p.username = lower(q.term) then 2 else 0 end
        + case when p.full_name ilike public.escape_like(q.term) || '%' then 0.5 else 0 end
      end
      + coalesce((select count(*) from unnest(p.skills) s where p_skills is not null and lower(s) = any (select lower(x) from unnest(p_skills) x)), 0) * 0.3
    )::real as rank
  from public.profiles p, q
  where p.id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
    and p.status in ('active', 'restricted')
    and (
      q.term is null
      or p.search_vector @@ websearch_to_tsquery('simple', q.term)
      or p.username ilike public.escape_like(q.term) || '%'
      or p.full_name ilike '%' || public.escape_like(q.term) || '%'
      or exists (select 1 from unnest(p.skills) s where lower(s) = lower(q.term))
    )
    and (p_college is null or p.college_id = p_college)
    and (p_account_type is null or p.account_type = p_account_type)
    and (p_skills is null or p.skills && p_skills or exists (
      select 1 from unnest(p.skills) s where lower(s) = any (select lower(x) from unnest(p_skills) x)))
    and (p_open_to_collab is null or p.open_to_collaboration = p_open_to_collab)
    and (p_open_to_mentoring is null or p.open_to_mentoring = p_open_to_mentoring)
  order by rank desc, p.full_name
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.search_posts(p_query text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
returns SETOF post_feed
language plpgsql
stable
set search_path = public,extensions
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
begin
  return query
select pf.*
  from public.post_feed pf
  join public.posts p on p.id = pf.id
  where pf.status = 'published'
    and p.search_vector @@ websearch_to_tsquery('english', p_query)
    and (p_category is null or pf.category = p_category)
  order by ts_rank_cd(p.search_vector, websearch_to_tsquery('english', p_query)) desc, pf.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end;
$$;

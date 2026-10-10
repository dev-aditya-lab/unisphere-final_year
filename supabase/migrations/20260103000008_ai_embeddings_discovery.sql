-- 0008: AI telemetry, background jobs, embeddings and related-content search

-- ── Member opt-out: when false, nothing the member writes is ever sent to an AI provider ──
alter table public.profiles add column ai_assist_enabled boolean not null default true;
grant update (ai_assist_enabled) on public.profiles to authenticated;

insert into public.system_settings(key, value, is_public, description) values
  ('ai_share_college_content', 'true', false, 'Allow college-visible post excerpts to be sent to the AI provider when explaining related results (public posts are always eligible; private, connections-only and community posts never are)')
on conflict (key) do nothing;

-- ── AI usage log (metadata only: prompts and outputs are never stored) ──────
create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  task text not null,
  provider text,
  model text,
  status text not null check (status in ('success', 'error', 'rate_limited', 'timeout', 'invalid_output', 'blocked', 'disabled')),
  error_code text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer,
  output_tokens integer,
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage_logs (created_at desc);
create index ai_usage_user_idx on public.ai_usage_logs (user_id, created_at desc);
create index ai_usage_task_idx on public.ai_usage_logs (task, status, created_at desc);

alter table public.ai_usage_logs enable row level security;
grant select on public.ai_usage_logs to authenticated;
-- Rows are written by the server (service role); staff with ai.view can read aggregates and rows.
create policy ai_usage_select on public.ai_usage_logs for select to authenticated
  using (public.has_permission('ai.view', null));

-- ── Persistent background jobs (embedding generation and its retries) ───────
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('embed')),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one live job per dedupe key, so repeated edits do not queue duplicate work.
create unique index ai_jobs_dedupe_idx on public.ai_jobs (dedupe_key) where dedupe_key is not null and status in ('pending', 'processing');
create index ai_jobs_queue_idx on public.ai_jobs (status, run_at);
alter table public.ai_jobs enable row level security; -- internal: no policies, no API grants

create or replace function public.claim_ai_jobs(p_limit integer default 10, p_type text default null)
returns setof public.ai_jobs
language sql
security definer
set search_path = ''
as $$
  update public.ai_jobs j
  set status = 'processing', locked_at = now(), attempts = attempts + 1, updated_at = now()
  where j.id in (
    select id from public.ai_jobs
    where (p_type is null or type = p_type)
      and (
        (status = 'pending' and run_at <= now())
        or (status = 'processing' and locked_at < now() - interval '10 minutes')  -- recover crashed workers
      )
      and attempts < max_attempts
    order by run_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  returning j.*;
$$;
revoke execute on function public.claim_ai_jobs(integer, text) from public, anon, authenticated;
grant execute on function public.claim_ai_jobs(integer, text) to service_role;

-- ── Embeddings (semantic search; populated only when an embedding provider is configured) ──
create table public.embeddings (
  entity_type text not null check (entity_type in ('post', 'project', 'profile')),
  entity_id uuid not null,
  embedding extensions.vector(768) not null,
  content_hash text not null,
  model text not null,
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);
create index embeddings_hnsw_idx on public.embeddings using hnsw (embedding extensions.vector_cosine_ops);

alter table public.embeddings enable row level security;
grant select on public.embeddings to authenticated;
-- A vector is readable only if the thing it describes is readable (the sub-selects apply that table's RLS).
create policy embeddings_select on public.embeddings for select to authenticated
  using (
    (entity_type = 'post' and exists (select 1 from public.posts p where p.id = embeddings.entity_id))
    or (entity_type = 'profile' and exists (select 1 from public.profiles p where p.id = embeddings.entity_id))
  );

-- ── Keyword helper: sanitised OR-query from a list of terms ─────────────────
create or replace function public.keywords_tsquery(p_keywords text[])
returns tsquery
language sql
immutable
set search_path = public
as $$
  select case when kw is null then null else to_tsquery('english', kw) end
  from (
    select nullif(array_to_string(array(
      select distinct t
      from (select regexp_replace(lower(k), '[^a-z0-9]', '', 'g') as t from unnest(coalesce(p_keywords, '{}')) k) s
      where char_length(t) >= 3
      limit 12
    ), ' | '), '') as kw
  ) x;
$$;

-- ── Related posts: hybrid ranking ───────────────────────────────────────────
-- Signals (all 0..1):  semantic similarity (cosine, only when an embedding is supplied and stored),
--   keyword relevance (ts_rank_cd normalised), recency (halves every ~83 days) and engagement
--   (reactions + 2×comments, log-scaled).
--   With embeddings:    0.45·semantic + 0.30·keyword + 0.10·recency + 0.15·engagement
--   Without embeddings: 0.60·keyword + 0.15·recency + 0.25·engagement
-- SECURITY INVOKER: only content the caller may see is considered. Private / connections-only /
-- community posts are excluded from suggestions.
create or replace function public.related_posts(
  p_keywords text[],
  p_embedding extensions.vector(768) default null,
  p_exclude uuid default null,
  p_limit integer default 8
) returns table (
  id uuid, slug text, title text, body text, category text, visibility text,
  author_id uuid, author_name text, author_username text, author_avatar_key text,
  created_at timestamptz, reaction_count integer, comment_count integer,
  score real, semantic real, keyword real, shared_terms text[], used_embeddings boolean
)
language sql
stable
set search_path = public, extensions
as $$
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
$$;

-- ── Related people: only what profiles themselves say ───────────────────────
-- Matches idea keywords against LISTED skills, interests and headline. Nobody is ever described
-- as having a skill they did not list.
create or replace function public.related_people(
  p_keywords text[],
  p_exclude_self boolean default true,
  p_limit integer default 6
) returns table (
  id uuid, username text, full_name text, avatar_key text, headline text, account_type text,
  verified boolean, matched_skills text[], matched_interests text[],
  open_to_collaboration boolean, open_to_mentoring boolean, score real
)
language sql
stable
set search_path = public
as $$
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
$$;

grant execute on function
  public.keywords_tsquery(text[]),
  public.related_posts(text[], extensions.vector, uuid, integer),
  public.related_people(text[], boolean, integer)
  to authenticated;

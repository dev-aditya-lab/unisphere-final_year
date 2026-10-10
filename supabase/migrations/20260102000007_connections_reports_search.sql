-- 0007: connections, follows, blocking, reports, search & discovery helpers

-- ── Counters ────────────────────────────────────────────────────────────────
create or replace function public.follows_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
  else
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.following_id;
  end if;
  return null;
end;
$$;
create trigger trg_follows_counter after insert or delete on public.follows
  for each row execute function public.follows_counter();

create or replace function public.connections_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set connection_count = connection_count + 1 where id in (new.user_a, new.user_b);
  else
    update public.profiles set connection_count = greatest(connection_count - 1, 0) where id in (old.user_a, old.user_b);
  end if;
  return null;
end;
$$;
create trigger trg_connections_counter after insert or delete on public.connections
  for each row execute function public.connections_counter();

-- ── Connection RPCs ─────────────────────────────────────────────────────────
-- The generic 'target_unavailable' error is deliberately used for blocks as well, so a
-- blocked user cannot tell the difference between "blocked" and "does not exist".
create or replace function public._accept_connection(p_requester uuid, p_recipient uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.connections(user_a, user_b)
  values (least(p_requester, p_recipient), greatest(p_requester, p_recipient))
  on conflict do nothing;
  insert into public.follows(follower_id, following_id) values (p_requester, p_recipient) on conflict do nothing;
  insert into public.follows(follower_id, following_id) values (p_recipient, p_requester) on conflict do nothing;
end;
$$;

create or replace function public.send_connection_request(p_recipient uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_reverse uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_active_user() then raise exception 'account_restricted' using errcode = '42501'; end if;
  if p_recipient is null or p_recipient = v_me then raise exception 'invalid_target' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_recipient and status in ('active', 'restricted'))
     or public.is_blocked_between(v_me, p_recipient) then
    raise exception 'target_unavailable' using errcode = 'P0002';
  end if;
  if public.are_connected(v_me, p_recipient) then raise exception 'already_connected' using errcode = '23505'; end if;

  -- If they already asked us, sending a request simply accepts theirs.
  select id into v_reverse from public.connection_requests
    where requester_id = p_recipient and recipient_id = v_me and status = 'pending' for update;
  if found then
    update public.connection_requests set status = 'accepted', responded_at = now() where id = v_reverse;
    perform public._accept_connection(p_recipient, v_me);
    return jsonb_build_object('status', 'connected');
  end if;

  begin
    insert into public.connection_requests(requester_id, recipient_id, message)
    values (v_me, p_recipient, nullif(left(trim(coalesce(p_message, '')), 300), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_requested' using errcode = '23505';
  end;
  return jsonb_build_object('status', 'pending', 'request_id', v_id);
end;
$$;

create or replace function public.respond_connection_request(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_req public.connection_requests%rowtype;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_req from public.connection_requests where id = p_id for update;
  if not found or v_req.recipient_id <> v_me or v_req.status <> 'pending' then
    raise exception 'request_unavailable' using errcode = 'P0002';
  end if;
  if p_accept and public.is_blocked_between(v_req.requester_id, v_me) then
    update public.connection_requests set status = 'cancelled', responded_at = now() where id = p_id;
    raise exception 'target_unavailable' using errcode = 'P0002';
  end if;
  update public.connection_requests
    set status = case when p_accept then 'accepted' else 'rejected' end, responded_at = now()
    where id = p_id;
  if p_accept then
    perform public._accept_connection(v_req.requester_id, v_me);
  end if;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'rejected' end);
end;
$$;

create or replace function public.cancel_connection_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connection_requests set status = 'cancelled', responded_at = now()
    where id = p_id and requester_id = (select auth.uid()) and status = 'pending';
  if not found then raise exception 'request_unavailable' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.remove_connection(p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.connections where user_a = least(v_me, p_other) and user_b = greatest(v_me, p_other);
end;
$$;

create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_target is null or p_target = v_me then raise exception 'invalid_target' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'target_unavailable' using errcode = 'P0002';
  end if;
  insert into public.user_blocks(blocker_id, blocked_id) values (v_me, p_target) on conflict do nothing;
  delete from public.connections where user_a = least(v_me, p_target) and user_b = greatest(v_me, p_target);
  update public.connection_requests set status = 'cancelled', responded_at = now()
    where status = 'pending'
      and ((requester_id = v_me and recipient_id = p_target) or (requester_id = p_target and recipient_id = v_me));
  delete from public.follows
    where (follower_id = v_me and following_id = p_target) or (follower_id = p_target and following_id = v_me);
end;
$$;

create or replace function public.unblock_user(p_target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_blocks where blocker_id = (select auth.uid()) and blocked_id = p_target;
$$;

grant execute on function
  public.send_connection_request(uuid, text), public.respond_connection_request(uuid, boolean),
  public.cancel_connection_request(uuid), public.remove_connection(uuid),
  public.block_user(uuid), public.unblock_user(uuid)
  to authenticated;

-- ── Reports ─────────────────────────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'user', 'project', 'message', 'event', 'community')),
  target_id uuid not null,
  target_owner_id uuid references public.profiles(id) on delete set null,
  college_id uuid references public.colleges(id) on delete set null,
  category text not null check (category in (
    'spam', 'harassment', 'hate', 'sexual', 'violence', 'misinformation', 'impersonation',
    'plagiarism', 'self_harm', 'privacy', 'other'
  )),
  details text check (details is null or char_length(details) <= 1000),
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  ai_suggestion jsonb,
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reports_one_open_per_reporter_idx
  on public.reports (reporter_id, target_type, target_id) where status in ('open', 'in_review');
create index reports_queue_idx on public.reports (college_id, status, severity, created_at);
create index reports_target_idx on public.reports (target_type, target_id);
create trigger trg_reports_updated before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.reports enable row level security;
-- Reporters can follow the status of their own reports; internal fields stay hidden.
grant select (id, reporter_id, target_type, target_id, category, details, status, created_at, resolved_at)
  on public.reports to authenticated;
create policy reports_select_own on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create or replace function public.submit_report(
  p_target_type text, p_target_id uuid, p_category text, p_details text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid;
  v_college uuid;
  v_snapshot jsonb;
  v_severity text;
  v_post public.posts%rowtype;
  v_comment public.comments%rowtype;
  v_profile public.profiles%rowtype;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_member() then raise exception 'account_restricted' using errcode = '42501'; end if;

  if p_target_type = 'post' then
    select * into v_post from public.posts where id = p_target_id;
    if not found or not public.can_view_post(v_post.author_id, v_post.college_id, v_post.visibility, v_post.community_id, v_post.status) then
      raise exception 'target_unavailable' using errcode = 'P0002';
    end if;
    v_owner := v_post.author_id; v_college := v_post.college_id;
    v_snapshot := jsonb_build_object('slug', v_post.slug, 'category', v_post.category, 'title', v_post.title,
      'body', v_post.body, 'visibility', v_post.visibility, 'posted_at', v_post.created_at);
  elsif p_target_type = 'comment' then
    select * into v_comment from public.comments where id = p_target_id;
    if not found or v_comment.status <> 'published' then raise exception 'target_unavailable' using errcode = 'P0002'; end if;
    select * into v_post from public.posts where id = v_comment.post_id;
    if not public.can_view_post(v_post.author_id, v_post.college_id, v_post.visibility, v_post.community_id, v_post.status) then
      raise exception 'target_unavailable' using errcode = 'P0002';
    end if;
    v_owner := v_comment.author_id; v_college := v_post.college_id;
    v_snapshot := jsonb_build_object('post_slug', v_post.slug, 'body', v_comment.body, 'posted_at', v_comment.created_at);
  elsif p_target_type = 'user' then
    select * into v_profile from public.profiles where id = p_target_id;
    if not found or not public.can_view_profile(v_profile.id, v_profile.visibility, v_profile.college_id, v_profile.status) then
      raise exception 'target_unavailable' using errcode = 'P0002';
    end if;
    v_owner := v_profile.id; v_college := v_profile.college_id;
    v_snapshot := jsonb_build_object('username', v_profile.username, 'full_name', v_profile.full_name,
      'headline', v_profile.headline, 'bio', v_profile.bio);
  else
    raise exception 'unsupported_target' using errcode = '22023';
  end if;

  if v_owner = v_me then raise exception 'cannot_report_self' using errcode = '22023'; end if;

  v_severity := case
    when p_category in ('self_harm', 'violence') then 'high'
    when p_category in ('sexual', 'harassment', 'hate', 'privacy', 'impersonation') then 'medium'
    else 'low' end;

  begin
    insert into public.reports(reporter_id, target_type, target_id, target_owner_id, college_id, category, details, severity, snapshot)
    values (v_me, p_target_type, p_target_id, v_owner, v_college, p_category, nullif(left(trim(coalesce(p_details, '')), 1000), ''), v_severity, v_snapshot)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'already_reported' using errcode = '23505';
  end;
  return v_id;
end;
$$;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- ── Search & discovery (SECURITY INVOKER: Row Level Security does the filtering) ──
create or replace function public.escape_like(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_'); $$;

create or replace function public.search_posts(
  p_query text, p_category text default null, p_limit integer default 20, p_offset integer default 0
) returns setof public.post_feed
language sql
stable
set search_path = public, extensions
as $$
  select pf.*
  from public.post_feed pf
  join public.posts p on p.id = pf.id
  where pf.status = 'published'
    and p.search_vector @@ websearch_to_tsquery('english', p_query)
    and (p_category is null or pf.category = p_category)
  order by ts_rank_cd(p.search_vector, websearch_to_tsquery('english', p_query)) desc, pf.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

create or replace function public.search_people(
  p_query text default null,
  p_college uuid default null,
  p_account_type text default null,
  p_skills text[] default null,
  p_open_to_collab boolean default null,
  p_open_to_mentoring boolean default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  id uuid, username text, full_name text, avatar_key text, headline text, account_type text,
  verified boolean, college_id uuid, skills text[], open_to_collaboration boolean, open_to_mentoring boolean,
  graduation_year smallint, rank real
)
language sql
stable
set search_path = public, extensions
as $$
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
$$;

-- Cursor-paginated feed. scope: 'college' (my college), 'following' (me + people I follow/connections), 'public'.
create or replace function public.feed_posts(
  p_scope text default 'college',
  p_category text default null,
  p_before_ts timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
) returns setof public.post_feed
language sql
stable
set search_path = public
as $$
  select pf.*
  from public.post_feed pf
  where pf.status = 'published'
    and (p_category is null or pf.category = p_category)
    and case p_scope
      when 'college' then pf.college_id is not null and pf.college_id = public.my_college_id()
      when 'following' then (
        pf.author_id = (select auth.uid())
        or exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = pf.author_id)
      )
      else pf.visibility = 'public'
    end
    and (p_before_ts is null or (pf.created_at, pf.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by pf.created_at desc, pf.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- People you may want to know: same college, not already connected/blocked; ranked by
-- shared skills and interests (plain, explainable rules; no hidden score).
create or replace function public.suggested_people(p_limit integer default 6)
returns table (
  id uuid, username text, full_name text, avatar_key text, headline text, account_type text,
  verified boolean, shared_skills text[], shared_interests text[], same_department boolean
)
language sql
stable
set search_path = public
as $$
  with me as (
    select id, college_id, department_id, skills, interests from public.profiles where id = (select auth.uid())
  )
  select
    p.id, p.username, p.full_name, p.avatar_key, p.headline, p.account_type,
    (p.verification_status = 'verified'),
    array(select s from unnest(p.skills) s where lower(s) = any (select lower(x) from unnest(me.skills) x)),
    array(select s from unnest(p.interests) s where lower(s) = any (select lower(x) from unnest(me.interests) x)),
    (p.department_id is not null and p.department_id = me.department_id)
  from public.profiles p, me
  where p.id <> me.id
    and p.status = 'active'
    and p.onboarded_at is not null
    and me.college_id is not null and p.college_id = me.college_id
    and not public.are_connected(me.id, p.id)
    and not public.is_blocked_between(me.id, p.id)
    and not exists (
      select 1 from public.connection_requests r
      where r.status = 'pending'
        and ((r.requester_id = me.id and r.recipient_id = p.id) or (r.requester_id = p.id and r.recipient_id = me.id))
    )
  order by
    cardinality(array(select s from unnest(p.skills) s where lower(s) = any (select lower(x) from unnest(me.skills) x))) desc,
    cardinality(array(select s from unnest(p.interests) s where lower(s) = any (select lower(x) from unnest(me.interests) x))) desc,
    (p.department_id is not null and p.department_id = me.department_id) desc,
    p.created_at desc
  limit least(greatest(p_limit, 1), 20);
$$;

-- Hashtags in recent PUBLIC posts only, so private content never leaks through trends.
create or replace function public.trending_hashtags(p_days integer default 7, p_limit integer default 8)
returns table (tag text, uses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select h.tag, count(*) as uses
  from public.post_hashtags ph
  join public.hashtags h on h.id = ph.hashtag_id
  join public.posts p on p.id = ph.post_id
  where p.status = 'published' and p.visibility = 'public'
    and p.created_at > now() - make_interval(days => least(greatest(p_days, 1), 90))
  group by h.tag
  order by uses desc, h.tag
  limit least(greatest(p_limit, 1), 20);
$$;

grant execute on function
  public.escape_like(text), public.search_posts(text, text, integer, integer),
  public.feed_posts(text, text, timestamptz, uuid, integer),
  public.search_people(text, uuid, text, text[], boolean, boolean, integer, integer),
  public.suggested_people(integer), public.trending_hashtags(integer, integer)
  to anon, authenticated;
revoke execute on function public.suggested_people(integer) from anon;

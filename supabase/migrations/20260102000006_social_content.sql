-- 0006: posts, attachments, hashtags, reactions, comments, bookmarks + feed views

-- ── Hashtags ────────────────────────────────────────────────────────────────
create table public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique check (tag ~ '^[a-z0-9_]{2,40}$'),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now()
);

-- ── Posts ───────────────────────────────────────────────────────────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  college_id uuid references public.colleges(id) on delete set null, -- copied from the author by trigger
  community_id uuid,  -- FK added with communities (Phase 4)
  project_id uuid,    -- FK added with projects (Phase 3)
  repost_of_id uuid references public.posts(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  category text not null default 'general'
    check (category in ('general', 'projects', 'ideas', 'questions', 'opportunities', 'achievements', 'events', 'experiences')),
  title text check (title is null or char_length(title) between 3 and 140),
  body text not null default '' check (char_length(body) <= 10000),
  visibility text not null default 'college'
    check (visibility in ('public', 'college', 'connections', 'community', 'private')),
  status text not null default 'published' check (status in ('published', 'removed', 'deleted')),

  reaction_count integer not null default 0 check (reaction_count >= 0),
  reactions jsonb not null default '{}'::jsonb,
  comment_count integer not null default 0 check (comment_count >= 0),
  repost_count integer not null default 0 check (repost_count >= 0),

  removed_reason text,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz,
  edited_at timestamptz,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (char_length(body) >= 1 or repost_of_id is not null),
  check (visibility <> 'community' or community_id is not null)
);

create index posts_feed_idx on public.posts (created_at desc, id desc) where status = 'published';
create index posts_author_idx on public.posts (author_id, created_at desc) where status = 'published';
create index posts_college_idx on public.posts (college_id, created_at desc) where status = 'published';
create index posts_category_idx on public.posts (category, created_at desc) where status = 'published';
create index posts_search_idx on public.posts using gin (search_vector);
create index posts_repost_idx on public.posts (repost_of_id) where repost_of_id is not null;
-- A plain (comment-less) repost can only exist once per user and original.
create unique index posts_single_plain_repost_idx
  on public.posts (author_id, repost_of_id)
  where repost_of_id is not null and body = '' and status = 'published';

create table public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  primary key (post_id, hashtag_id)
);
create index post_hashtags_tag_idx on public.post_hashtags(hashtag_id);

-- Mentions are written by trusted server code after parsing the saved text.
create table public.mentions (
  entity_type text not null check (entity_type in ('post', 'comment')),
  entity_id uuid not null,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entity_type, entity_id, mentioned_user_id)
);
create index mentions_user_idx on public.mentions(mentioned_user_id, created_at desc);

create table public.post_attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  position smallint not null default 0 check (position between 0 and 9),
  alt_text text check (alt_text is null or char_length(alt_text) <= 300),
  created_at timestamptz not null default now(),
  unique (post_id, file_id)
);
create index post_attachments_post_idx on public.post_attachments(post_id, position);
create index post_attachments_file_idx on public.post_attachments(file_id);

create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like', 'insightful', 'celebrate', 'curious')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_reactions_user_idx on public.post_reactions(user_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  status text not null default 'published' check (status in ('published', 'removed', 'deleted')),
  like_count integer not null default 0 check (like_count >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or char_length(body) >= 1)
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id, created_at) where parent_id is not null;
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index bookmarks_user_idx on public.bookmarks(user_id, created_at desc);

-- ── Visibility ──────────────────────────────────────────────────────────────
-- Single source of truth for "may the current user see this post?".
-- (Replaced in the communities migration to add community membership.)
create or replace function public.can_view_post(
  p_author uuid, p_college uuid, p_visibility text, p_community uuid, p_status text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) = p_author then p_status <> 'deleted'
      else (
        (
          p_status = 'published'
          and exists (select 1 from public.profiles a where a.id = p_author and a.status in ('active', 'restricted'))
          and not exists (
            select 1 from public.user_blocks b
            where (b.blocker_id = p_author and b.blocked_id = (select auth.uid()))
               or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_author)
          )
          and (
            p_visibility = 'public'
            or (
              (select auth.uid()) is not null
              and (
                (p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
                or (p_visibility = 'connections' and public.are_connected((select auth.uid()), p_author))
              )
            )
          )
        )
        or (p_status <> 'deleted' and public.has_permission('reports.view', p_college))
      )
    end;
$$;
grant execute on function public.can_view_post(uuid, uuid, text, uuid, text) to anon, authenticated, service_role;

-- ── Triggers ────────────────────────────────────────────────────────────────
create or replace function public.posts_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.posts%rowtype;
begin
  if tg_op = 'INSERT' then
    select college_id into new.college_id from public.profiles where id = new.author_id;
    new.status := 'published';

    if new.repost_of_id is not null then
      select * into v_orig from public.posts where id = new.repost_of_id;
      if not found or v_orig.status <> 'published'
         or not public.can_view_post(v_orig.author_id, v_orig.college_id, v_orig.visibility, v_orig.community_id, v_orig.status) then
        raise exception 'repost_unavailable' using errcode = '22023';
      end if;
      -- Reposting a repost attributes the original.
      if v_orig.repost_of_id is not null then
        select * into v_orig from public.posts where id = v_orig.repost_of_id;
        new.repost_of_id := v_orig.id;
      end if;
      if v_orig.visibility in ('private', 'connections', 'community') then
        raise exception 'repost_not_allowed' using errcode = '42501';
      end if;
      -- A repost can never be more visible than the original.
      if v_orig.visibility = 'college' and new.visibility = 'public' then
        new.visibility := 'college';
      end if;
      new.category := v_orig.category;
    end if;
  else
    if new.title is distinct from old.title or new.body is distinct from old.body then
      new.edited_at := now();
    end if;
    -- Deleted / removed posts never come back through a plain update.
    if old.status in ('deleted', 'removed') and new.status = 'published' and public.jwt_role() = 'authenticated' then
      raise exception 'post_unavailable' using errcode = '42501';
    end if;
  end if;

  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.body, '')), 'B');
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_posts_before_write
  before insert or update on public.posts
  for each row execute function public.posts_before_write();

create or replace function public.posts_repost_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.repost_of_id is not null and new.status = 'published' then
    update public.posts set repost_count = repost_count + 1 where id = new.repost_of_id;
  elsif tg_op = 'UPDATE' and new.repost_of_id is not null and old.status = 'published' and new.status <> 'published' then
    update public.posts set repost_count = greatest(repost_count - 1, 0) where id = new.repost_of_id;
  end if;
  return null;
end;
$$;
create trigger trg_posts_repost_counter
  after insert or update of status on public.posts
  for each row execute function public.posts_repost_counter();

create or replace function public.post_attachments_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.post_attachments where post_id = new.post_id) >= 4 then
    raise exception 'too_many_attachments' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_post_attachments_limit
  before insert on public.post_attachments
  for each row execute function public.post_attachments_limit();

create or replace function public.refresh_post_reactions(p_post uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.posts p set
    reaction_count = coalesce((select count(*) from public.post_reactions r where r.post_id = p_post), 0),
    reactions = coalesce((
      select jsonb_object_agg(reaction, c) from (
        select reaction, count(*) as c from public.post_reactions where post_id = p_post group by reaction
      ) t
    ), '{}'::jsonb)
  where p.id = p_post;
$$;

create or replace function public.post_reactions_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_post_reactions(coalesce(new.post_id, old.post_id));
  return null;
end;
$$;
create trigger trg_post_reactions_counts
  after insert or update or delete on public.post_reactions
  for each row execute function public.post_reactions_after_change();

create or replace function public.comments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comments%rowtype;
begin
  if tg_op = 'INSERT' then
    new.status := 'published';
    if new.parent_id is not null then
      select * into v_parent from public.comments where id = new.parent_id;
      if not found or v_parent.post_id <> new.post_id then
        raise exception 'invalid_parent' using errcode = '22023';
      end if;
      if v_parent.parent_id is not null then
        raise exception 'reply_depth_exceeded' using errcode = '22023';
      end if;
      if v_parent.status <> 'published' then
        raise exception 'parent_unavailable' using errcode = '22023';
      end if;
    end if;
  else
    if new.body is distinct from old.body and new.status = 'published' then
      new.edited_at := now();
    end if;
    if old.status <> 'published' and new.status = 'published' and public.jwt_role() = 'authenticated' then
      raise exception 'comment_unavailable' using errcode = '42501';
    end if;
    -- Deleted / removed comments keep their place in the thread but lose their text.
    if new.status in ('deleted', 'removed') then
      new.body := '';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_comments_before_write
  before insert or update on public.comments
  for each row execute function public.comments_before_write();

create or replace function public.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
  v_parent uuid := coalesce(new.parent_id, old.parent_id);
begin
  update public.posts set comment_count = (
    select count(*) from public.comments where post_id = v_post and status = 'published'
  ) where id = v_post;
  if v_parent is not null then
    update public.comments set reply_count = (
      select count(*) from public.comments where parent_id = v_parent and status = 'published'
    ) where id = v_parent;
  end if;
  return null;
end;
$$;
create trigger trg_comments_counts
  after insert or update of status or delete on public.comments
  for each row execute function public.comments_after_change();

create or replace function public.comment_reactions_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment uuid := coalesce(new.comment_id, old.comment_id);
begin
  update public.comments set like_count = (select count(*) from public.comment_reactions where comment_id = v_comment)
    where id = v_comment;
  return null;
end;
$$;
create trigger trg_comment_reactions_counts
  after insert or delete on public.comment_reactions
  for each row execute function public.comment_reactions_after_change();

create or replace function public.post_hashtags_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.hashtags set use_count = use_count + 1 where id = new.hashtag_id;
  else
    update public.hashtags set use_count = greatest(use_count - 1, 0) where id = old.hashtag_id;
  end if;
  return null;
end;
$$;
create trigger trg_post_hashtags_counter
  after insert or delete on public.post_hashtags
  for each row execute function public.post_hashtags_counter();

-- ── Feed views (explicit visibility predicate, author card, viewer state) ───
-- Owned by the migration role, so they join profiles regardless of the author's
-- profile visibility; every row is still gated by can_view_post().
create view public.post_feed with (security_barrier = true) as
select
  p.id, p.slug, p.author_id, p.college_id, p.community_id, p.project_id, p.category, p.title, p.body,
  p.visibility, p.status, p.reaction_count, p.reactions, p.comment_count, p.repost_count,
  p.edited_at, p.created_at, p.repost_of_id,
  a.full_name as author_name,
  a.username as author_username,
  a.avatar_key as author_avatar_key,
  a.account_type as author_account_type,
  a.headline as author_headline,
  (a.verification_status = 'verified') as author_verified,
  (select r.reaction from public.post_reactions r where r.post_id = p.id and r.user_id = (select auth.uid())) as my_reaction,
  exists (select 1 from public.bookmarks b where b.post_id = p.id and b.user_id = (select auth.uid())) as bookmarked,
  o.slug as original_slug,
  o.title as original_title,
  o.body as original_body,
  o.category as original_category,
  o.created_at as original_created_at,
  oa.full_name as original_author_name,
  oa.username as original_author_username,
  oa.avatar_key as original_author_avatar_key,
  (p.removed_reason is not null) as has_removal_notice,
  (
    select coalesce(jsonb_agg(jsonb_build_object('id', pa.file_id, 'alt', pa.alt_text) order by pa.position, pa.created_at), '[]'::jsonb)
    from public.post_attachments pa where pa.post_id = p.id
  ) as attachments
from public.posts p
join public.profiles a on a.id = p.author_id
left join public.posts o
  on o.id = p.repost_of_id
 and public.can_view_post(o.author_id, o.college_id, o.visibility, o.community_id, o.status)
left join public.profiles oa on oa.id = o.author_id
where public.can_view_post(p.author_id, p.college_id, p.visibility, p.community_id, p.status);

create view public.comment_feed with (security_barrier = true) as
select
  c.id, c.post_id, c.parent_id, c.author_id, c.body, c.status, c.like_count, c.reply_count,
  c.edited_at, c.created_at,
  a.full_name as author_name,
  a.username as author_username,
  a.avatar_key as author_avatar_key,
  a.account_type as author_account_type,
  (a.verification_status = 'verified') as author_verified,
  exists (select 1 from public.comment_reactions cr where cr.comment_id = c.id and cr.user_id = (select auth.uid())) as liked,
  p.slug as post_slug,
  p.author_id as post_author_id
from public.comments c
join public.profiles a on a.id = c.author_id
join public.posts p on p.id = c.post_id
where public.can_view_post(p.author_id, p.college_id, p.visibility, p.community_id, p.status)
  and (c.status = 'published' or (c.status in ('deleted', 'removed') and c.reply_count > 0))
  and ((select auth.uid()) is null or not public.is_blocked_between((select auth.uid()), c.author_id));

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.hashtags enable row level security;
alter table public.posts enable row level security;
alter table public.post_hashtags enable row level security;
alter table public.mentions enable row level security;
alter table public.post_attachments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comments enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.bookmarks enable row level security;

grant select on public.hashtags to anon, authenticated;
create policy hashtags_select on public.hashtags for select to anon, authenticated using (true);

grant select on public.post_feed, public.comment_feed to anon, authenticated;

-- posts
grant select on public.posts to anon, authenticated;
grant insert (author_id, slug, category, title, body, visibility, repost_of_id, community_id, project_id) on public.posts to authenticated;
grant update (title, body, category, visibility, status) on public.posts to authenticated;

create policy posts_select on public.posts for select to anon, authenticated
  using (public.can_view_post(author_id, college_id, visibility, community_id, status));
-- Authors can always address their own rows (e.g. to soft-delete). Feeds and pages read through
-- post_feed, which still hides deleted posts from everyone.
create policy posts_select_own on public.posts for select to authenticated
  using (author_id = (select auth.uid()));
create policy posts_insert on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_contribute()
    -- (a repost's original must be visible to the author: enforced in posts_before_write)
  );
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and status = 'published' and public.can_contribute())
  with check (author_id = (select auth.uid()) and status in ('published', 'deleted'));

-- hashtag links and mentions: readable where the post is, written only by trusted server code
grant select on public.post_hashtags to anon, authenticated;
create policy post_hashtags_select on public.post_hashtags for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_hashtags.post_id));
grant select on public.mentions to authenticated;
create policy mentions_select on public.mentions for select to authenticated
  using (mentioned_user_id = (select auth.uid()));

-- attachments
grant select on public.post_attachments to anon, authenticated;
grant insert (post_id, file_id, position, alt_text) on public.post_attachments to authenticated;
grant delete on public.post_attachments to authenticated;
create policy post_attachments_select on public.post_attachments for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_attachments.post_id));
create policy post_attachments_insert on public.post_attachments for insert to authenticated
  with check (
    exists (select 1 from public.posts p where p.id = post_attachments.post_id and p.author_id = (select auth.uid()) and p.status = 'published')
    and exists (
      select 1 from public.files f
      where f.id = post_attachments.file_id and f.owner_id = (select auth.uid())
        and f.purpose = 'post_attachment' and f.status = 'ready'
    )
  );
create policy post_attachments_delete on public.post_attachments for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_attachments.post_id and p.author_id = (select auth.uid())));

-- Attached images are readable by anyone who can read the post (including logged-out visitors of
-- public posts). A SECURITY DEFINER helper avoids RLS recursion between files and post_attachments.
create or replace function public.can_read_attached_file(p_file uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.post_attachments pa
    join public.posts p on p.id = pa.post_id
    where pa.file_id = p_file
      and public.can_view_post(p.author_id, p.college_id, p.visibility, p.community_id, p.status)
  );
$$;
grant execute on function public.can_read_attached_file(uuid) to anon, authenticated, service_role;

create policy files_select_post_attachment on public.files for select to anon, authenticated
  using (purpose = 'post_attachment' and status = 'ready' and public.can_read_attached_file(id));

-- reactions: users only ever see and change their own (aggregate counts live on the post)
grant select, insert, update, delete on public.post_reactions to authenticated;
revoke update on public.post_reactions from authenticated;
grant update (reaction) on public.post_reactions to authenticated;
create policy post_reactions_select on public.post_reactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy post_reactions_insert on public.post_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_contribute()
    and exists (select 1 from public.posts p where p.id = post_reactions.post_id and p.status = 'published')
  );
create policy post_reactions_update on public.post_reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy post_reactions_delete on public.post_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- comments
grant select on public.comments to authenticated;
grant insert (post_id, author_id, parent_id, body) on public.comments to authenticated;
grant update (body, status) on public.comments to authenticated;
create policy comments_select on public.comments for select to authenticated
  using (
    exists (select 1 from public.posts p where p.id = comments.post_id)
    and (status = 'published' or (status in ('deleted', 'removed') and reply_count > 0))
  );
create policy comments_select_own on public.comments for select to authenticated
  using (author_id = (select auth.uid()));
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_contribute()
    and exists (select 1 from public.posts p where p.id = comments.post_id and p.status = 'published')
    and not exists (
      select 1 from public.posts p
      where p.id = comments.post_id and public.is_blocked_between((select auth.uid()), p.author_id)
    )
  );
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = (select auth.uid()) and status = 'published' and public.can_contribute())
  with check (author_id = (select auth.uid()) and status in ('published', 'deleted'));

grant select, insert, delete on public.comment_reactions to authenticated;
create policy comment_reactions_select on public.comment_reactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy comment_reactions_insert on public.comment_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_contribute()
    and exists (
      select 1 from public.comments c join public.posts p on p.id = c.post_id
      where c.id = comment_reactions.comment_id and c.status = 'published'
    )
  );
create policy comment_reactions_delete on public.comment_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- bookmarks (private to the owner)
grant select, insert, delete on public.bookmarks to authenticated;
create policy bookmarks_select on public.bookmarks for select to authenticated
  using (user_id = (select auth.uid()));
create policy bookmarks_insert on public.bookmarks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = bookmarks.post_id and p.status = 'published')
  );
create policy bookmarks_delete on public.bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

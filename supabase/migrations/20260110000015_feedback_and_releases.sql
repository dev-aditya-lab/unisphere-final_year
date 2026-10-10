-- 0015: product feedback, bug reports, feature requests, roadmap, changelog and release notes
-- ---------------------------------------------------------------------------
-- Bug reports and general feedback are private to the reporter and the product team. Feature requests are
-- visible to members of the same college (they can vote), and the roadmap and changelog are public.
-- ---------------------------------------------------------------------------

insert into public.role_permissions(role, permission) values
  ('global_admin', 'feedback.manage'), ('support_agent', 'feedback.manage'), ('global_admin', 'releases.manage')
on conflict do nothing;

-- Feedback updates reach members through the "announcements" notification category.
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
    when p_type = 'announcement' or p_type like 'feedback_%' then 'announcements'
    else 'social' end;
$$;

-- ── Releases (changelog) ────────────────────────────────────────────────────
create table public.releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
  title text not null check (char_length(title) between 3 and 120),
  summary text check (summary is null or char_length(summary) <= 300),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 60),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_releases_updated before update on public.releases for each row execute function public.set_updated_at();
alter table public.releases enable row level security;
grant select on public.releases to anon, authenticated;
create policy releases_select on public.releases for select to anon, authenticated
  using ((published_at is not null and published_at <= now()) or public.has_permission('releases.manage', null));

-- ── Feedback items ──────────────────────────────────────────────────────────
create table public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  college_id uuid references public.colleges(id) on delete set null,
  kind text not null check (kind in ('bug', 'feature', 'feedback')),
  title text not null check (char_length(title) between 5 and 120),
  body text not null check (char_length(body) between 10 and 4000),
  severity text check (severity is null or severity in ('low', 'medium', 'high', 'critical')),
  area text not null default 'other' check (area in ('feed', 'profile', 'projects', 'messages', 'events', 'communities', 'search', 'notifications', 'verification', 'admin', 'other')),
  status text not null default 'new' check (status in ('new', 'triaged', 'planned', 'in_progress', 'shipped', 'declined', 'duplicate')),
  is_public boolean not null default false,
  vote_count integer not null default 0 check (vote_count >= 0),
  duplicate_of uuid references public.feedback_items(id) on delete set null,
  release_id uuid references public.releases(id) on delete set null,
  public_response text check (public_response is null or char_length(public_response) <= 1000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (kind = 'bug' or severity is null)
);
create index feedback_queue_idx on public.feedback_items (status, created_at desc);
create index feedback_board_idx on public.feedback_items (college_id, vote_count desc, created_at desc) where kind = 'feature' and is_public;
create index feedback_user_idx on public.feedback_items (user_id, created_at desc);
create trigger trg_feedback_updated before update on public.feedback_items for each row execute function public.set_updated_at();

create table public.feedback_votes (
  item_id uuid not null references public.feedback_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index feedback_votes_user_idx on public.feedback_votes (user_id);

alter table public.feedback_items enable row level security;
alter table public.feedback_votes enable row level security;
grant select on public.feedback_items to authenticated;
grant select on public.feedback_votes to authenticated;
create policy feedback_select on public.feedback_items for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('feedback.manage', null)
    or (kind = 'feature' and is_public and status <> 'duplicate' and college_id is not null and college_id = public.my_college_id())
  );
create policy feedback_votes_select on public.feedback_votes for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.feedback_vote_counter() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.feedback_items set vote_count = (select count(*) from public.feedback_votes where item_id = coalesce(new.item_id, old.item_id))
    where id = coalesce(new.item_id, old.item_id);
  return null;
end; $$;
create trigger trg_feedback_votes_count after insert or delete on public.feedback_votes for each row execute function public.feedback_vote_counter();

-- ── Members: submit and vote ────────────────────────────────────────────────
create or replace function public.submit_feedback(
  p_kind text, p_title text, p_body text, p_severity text default null, p_area text default 'other', p_context jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_member() then raise exception 'account_restricted' using errcode = '42501'; end if;
  if p_kind not in ('bug', 'feature', 'feedback') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if char_length(v_title) not between 5 and 120 or char_length(v_body) not between 10 and 4000 then raise exception 'invalid_text' using errcode = '22023'; end if;
  if (select count(*) from public.feedback_items where user_id = v_me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = '23514';
  end if;
  if exists (select 1 from public.feedback_items where user_id = v_me and lower(title) = lower(v_title) and created_at > now() - interval '1 day') then
    raise exception 'duplicate_submission' using errcode = '23505';
  end if;

  insert into public.feedback_items(user_id, college_id, kind, title, body, severity, area, is_public, context)
  values (v_me, public.my_college_id(), p_kind, v_title, v_body,
          case when p_kind = 'bug' then coalesce(p_severity, 'medium') end,
          coalesce(p_area, 'other'), p_kind = 'feature',
          jsonb_strip_nulls(coalesce(p_context, '{}'::jsonb)))
  returning id into v_id;
  if p_kind = 'feature' then
    insert into public.feedback_votes(item_id, user_id) values (v_id, v_me);  -- you back your own idea
  end if;
  return v_id;
end; $$;

create or replace function public.toggle_feedback_vote(p_item uuid)
returns boolean  -- true = now voted
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := (select auth.uid()); f public.feedback_items%rowtype;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_member() then raise exception 'account_restricted' using errcode = '42501'; end if;
  select * into f from public.feedback_items where id = p_item;
  if not found or f.kind <> 'feature' or not f.is_public or f.status in ('duplicate', 'declined', 'shipped')
     or f.college_id is distinct from public.my_college_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.feedback_votes where item_id = p_item and user_id = v_me) then
    delete from public.feedback_votes where item_id = p_item and user_id = v_me;
    return false;
  end if;
  insert into public.feedback_votes(item_id, user_id) values (p_item, v_me);
  return true;
end; $$;

-- Roadmap and changelog are public: only titles, status and counts leave the database.
create or replace function public.public_roadmap()
returns table (id uuid, title text, status text, area text, vote_count integer, public_response text, version text, college_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.title, f.status, f.area, f.vote_count, f.public_response, r.version, c.short_name
  from public.feedback_items f
  left join public.releases r on r.id = f.release_id and r.published_at is not null
  left join public.colleges c on c.id = f.college_id
  where f.kind = 'feature' and f.is_public and f.status in ('planned', 'in_progress', 'shipped')
  order by case f.status when 'in_progress' then 0 when 'planned' then 1 else 2 end, f.vote_count desc, f.created_at desc
  limit 120;
$$;

-- ── Product team ────────────────────────────────────────────────────────────
create or replace function public.admin_list_feedback(
  p_kind text default null, p_status text default null, p_q text default null, p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, kind text, title text, body text, severity text, area text, status text, is_public boolean, vote_count integer,
  duplicate_of uuid, release_id uuid, public_response text, context jsonb, created_at timestamptz, user_id uuid,
  full_name text, username text, college_name text, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('feedback.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select f.id, f.kind, f.title, f.body, f.severity, f.area, f.status, f.is_public, f.vote_count, f.duplicate_of, f.release_id,
           f.public_response, f.context, f.created_at, f.user_id, p.full_name, p.username, c.short_name, count(*) over ()
    from public.feedback_items f
    left join public.profiles p on p.id = f.user_id
    left join public.colleges c on c.id = f.college_id
    where (p_kind is null or f.kind = p_kind)
      and (p_status is null or (p_status = 'open' and f.status in ('new', 'triaged', 'planned', 'in_progress')) or f.status = p_status)
      and (nullif(trim(p_q), '') is null or f.title ilike '%' || public.escape_like(trim(p_q)) || '%' or f.body ilike '%' || public.escape_like(trim(p_q)) || '%')
    order by
      case when f.kind = 'bug' and f.status = 'new' then case f.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end else 4 end,
      f.vote_count desc, f.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end; $$;

create or replace function public.triage_feedback(
  p_id uuid, p_status text, p_response text default null, p_public boolean default null,
  p_duplicate_of uuid default null, p_release uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  f public.feedback_items%rowtype;
  v_response text := nullif(left(trim(coalesce(p_response, '')), 1000), '');
begin
  if not public.has_permission('feedback.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into f from public.feedback_items where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_status not in ('new', 'triaged', 'planned', 'in_progress', 'shipped', 'declined', 'duplicate') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_status = 'duplicate' then
    if p_duplicate_of is null or p_duplicate_of = p_id or not exists (select 1 from public.feedback_items where id = p_duplicate_of) then
      raise exception 'invalid_duplicate' using errcode = '22023';
    end if;
    -- Everyone who backed the duplicate now backs the original.
    insert into public.feedback_votes(item_id, user_id)
      select p_duplicate_of, v.user_id from public.feedback_votes v where v.item_id = p_id on conflict do nothing;
  end if;
  if p_status = 'declined' and v_response is null then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_release is not null and not exists (select 1 from public.releases where id = p_release) then raise exception 'invalid_release' using errcode = '22023'; end if;

  update public.feedback_items set
    status = p_status,
    public_response = coalesce(v_response, public_response),
    is_public = case when kind = 'feature' then coalesce(p_public, is_public) else false end,
    duplicate_of = case when p_status = 'duplicate' then p_duplicate_of else null end,
    release_id = case when p_status = 'shipped' then coalesce(p_release, release_id) else release_id end,
    resolved_at = case when p_status in ('shipped', 'declined', 'duplicate') then coalesce(resolved_at, now()) else null end
  where id = p_id;

  if f.user_id is not null and (p_status is distinct from f.status or v_response is distinct from f.public_response) and p_status <> 'new' then
    perform public.notify(f.user_id, 'feedback_update', null, 'feedback', p_id,
      jsonb_build_object('title', left(f.title, 100), 'status', p_status, 'kind', f.kind, 'response', v_response),
      'feedback:' || p_id || ':' || p_status);
  end if;
  perform public.write_audit_log(v_actor, 'feedback.triaged', 'feedback', p_id::text, null, jsonb_build_object('status', p_status, 'kind', f.kind));
end; $$;

create or replace function public.save_release(
  p_id uuid, p_version text, p_title text, p_summary text, p_items jsonb, p_publish boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_id uuid; v_was timestamptz;
begin
  if not public.has_permission('releases.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'invalid_items' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.releases(version, title, summary, items, published_at, created_by)
    values (trim(p_version), trim(p_title), nullif(trim(coalesce(p_summary, '')), ''), coalesce(p_items, '[]'::jsonb),
            case when p_publish then now() end, v_actor)
    returning id into v_id;
  else
    select published_at into v_was from public.releases where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.releases set version = trim(p_version), title = trim(p_title), summary = nullif(trim(coalesce(p_summary, '')), ''),
      items = coalesce(p_items, '[]'::jsonb),
      published_at = case when p_publish then coalesce(v_was, now()) else v_was end
    where id = p_id returning id into v_id;
  end if;
  perform public.write_audit_log(v_actor, 'release.saved', 'release', v_id::text, null, jsonb_build_object('version', trim(p_version), 'published', p_publish));
  return v_id;
exception when unique_violation then
  raise exception 'version_exists' using errcode = '23505';
end; $$;

create or replace function public.delete_release(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('releases.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.releases where id = p_id and published_at is not null) then raise exception 'already_published' using errcode = '23514'; end if;
  delete from public.releases where id = p_id;
  perform public.write_audit_log((select auth.uid()), 'release.deleted', 'release', p_id::text, null, '{}'::jsonb);
end; $$;

grant execute on function
  public.submit_feedback(text, text, text, text, text, jsonb), public.toggle_feedback_vote(uuid),
  public.admin_list_feedback(text, text, text, integer, integer), public.triage_feedback(uuid, text, text, boolean, uuid, uuid),
  public.save_release(uuid, text, text, text, jsonb, boolean), public.delete_release(uuid)
  to authenticated, service_role;
grant execute on function public.public_roadmap() to anon, authenticated, service_role;

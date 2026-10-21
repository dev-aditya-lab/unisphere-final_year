-- 0048: permanent deletion.
--
-- Until now "delete" only hid things: a member's deleted post stayed in the database as status = 'deleted' with all of its
-- likes, comments, bookmarks and mentions behind it, and the admin console could only "remove" (hide) content. This adds:
--
--   1. _purge_posts(ids)          the one internal routine that really deletes posts and everything that hangs off them,
--                                 including the rows the database cascade does not reach (mentions, notifications, search
--                                 vectors, slug redirects, open reports). Plain reposts of a purged post go with it.
--   2. delete_own_post(post)      what a member's "Delete post" now calls: the post is gone, with its comments, likes and
--                                 the rest, instead of being hidden.
--   3. admin_content_impact / admin_purge_content
--                                 global administrators only (new permission content.purge): see exactly what a deletion
--                                 takes with it, then delete a post, community or event for good, with a recorded reason.
--   4. users.purge                the permission the console checks before it erases a member's whole account.
--   5. a fix so a post that has plain reposts can be deleted at all (see below), including when the author's whole account
--      is erased, and a one-time clean-up of posts that members deleted before this change.
--
-- Stored image files are not touched here: their rows lose their post, become orphans, and the server removes the stored
-- objects straight away (the maintenance worker's orphan sweep is the backstop).

insert into public.role_permissions(role, permission) values
  ('global_admin', 'content.purge'),
  ('global_admin', 'users.purge')
on conflict do nothing;

-- ── A plain repost cannot outlive its original ──────────────────────────────
-- posts.repost_of_id is ON DELETE SET NULL, but a repost without text of its own may not have a null original (check
-- constraint), so deleting an original that had plain reposts used to fail: for a member deleting the post, and for the
-- erasure of the author's whole account. The plain reposts are therefore deleted first, in their own statement (below, and
-- in erase_user_data). Quote reposts (with their own text) are left alone and become ordinary posts.
drop trigger if exists trg_posts_delete_plain_reposts on public.posts;
drop function if exists public.posts_delete_plain_reposts();

-- ── The purge ───────────────────────────────────────────────────────────────
-- Returns what was deleted, and the stored files that belonged to it so the server can remove the objects.
create or replace function public._purge_posts(p_ids uuid[], p_actor uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_comments uuid[];
  v_files jsonb;
  v_counts jsonb;
begin
  select coalesce(array_agg(distinct x), '{}') into v_ids from (
    select id as x from public.posts where id = any(p_ids)
    union
    select id from public.posts where repost_of_id = any(p_ids) and body = ''
  ) s;
  if cardinality(v_ids) = 0 then
    return jsonb_build_object('counts', jsonb_build_object('posts', 0), 'files', '[]'::jsonb);
  end if;
  select coalesce(array_agg(id), '{}') into v_comments from public.comments where post_id = any(v_ids);

  v_counts := jsonb_build_object(
    'posts', cardinality(v_ids),
    'comments', cardinality(v_comments),
    'reactions', (select count(*) from public.post_reactions where post_id = any(v_ids)),
    'comment_likes', (select count(*) from public.comment_reactions where comment_id = any(v_comments)),
    'bookmarks', (select count(*) from public.bookmarks where post_id = any(v_ids)),
    'attachments', (select count(*) from public.post_attachments where post_id = any(v_ids))
  );
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'bucket', f.bucket, 'storage_key', f.storage_key)), '[]'::jsonb) into v_files
  from public.files f join public.post_attachments pa on pa.file_id = f.id
  where pa.post_id = any(v_ids) and f.purpose = 'post_attachment';

  -- Leaving "published" is what takes the author's Orbits reward back and lowers an original's repost count.
  update public.posts set status = 'deleted' where id = any(v_ids) and status = 'published';

  -- Rows that point at a post or comment without a foreign key.
  delete from public.mentions where (entity_type = 'post' and entity_id = any(v_ids)) or (entity_type = 'comment' and entity_id = any(v_comments));
  delete from public.notifications where (entity_type = 'post' and entity_id = any(v_ids)) or (entity_type = 'comment' and entity_id = any(v_comments));
  delete from public.embeddings where entity_type = 'post' and entity_id = any(v_ids);
  delete from public.ai_jobs j where j.type = 'embed' and j.status in ('pending', 'processing')
    and j.payload ->> 'entityType' = 'post' and (j.payload ->> 'entityId')::uuid = any(v_ids);
  delete from public.slug_redirects where entity_type = 'post' and entity_id = any(v_ids);
  update public.reports set status = 'resolved', resolution = left(coalesce(p_note, 'The content was permanently deleted.'), 1000), resolved_by = p_actor, resolved_at = now()
  where status in ('open', 'in_review')
    and ((target_type = 'post' and target_id = any(v_ids)) or (target_type = 'comment' and target_id = any(v_comments)));

  -- Plain reposts first (see above), then the posts, and with them (cascade) comments and replies, reactions, comment likes,
  -- bookmarks, hashtags, attachments and "not relevant" feedback.
  delete from public.posts where id = any(v_ids) and repost_of_id = any(v_ids) and body = '';
  delete from public.posts where id = any(v_ids);

  return jsonb_build_object('counts', v_counts, 'files', v_files);
end;
$$;
revoke execute on function public._purge_posts(uuid[], uuid, text) from public, anon, authenticated;
grant execute on function public._purge_posts(uuid[], uuid, text) to service_role;

-- ── A member deletes their own post ─────────────────────────────────────────
create or replace function public.delete_own_post(p_post uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_author uuid; v_status text;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select author_id, status into v_author, v_status from public.posts where id = p_post;
  if not found or v_author <> v_me then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- A post a moderator removed is part of a moderation record (and may be under appeal); it is not the author's to erase.
  if v_status = 'removed' then raise exception 'invalid_state' using errcode = '23514'; end if;
  return public._purge_posts(array[p_post], v_me, 'The author deleted the post.');
end;
$$;
revoke execute on function public.delete_own_post(uuid) from public, anon;
grant execute on function public.delete_own_post(uuid) to authenticated;

-- ── Administrators: what a deletion would take, and the deletion ────────────
create or replace function public.admin_content_impact(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_comments uuid[];
  v_label text; v_confirm text; v_owner text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission('content.purge', null) then raise exception 'forbidden' using errcode = '42501'; end if;

  if p_kind = 'post' then
    select coalesce(p.title, left(p.body, 80)), p.slug, pr.username into v_label, v_confirm, v_owner
    from public.posts p join public.profiles pr on pr.id = p.author_id where p.id = p_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    select coalesce(array_agg(x), '{}') into v_ids from (
      select id as x from public.posts where id = p_id
      union select id from public.posts where repost_of_id = p_id and body = '') s;
    select coalesce(array_agg(id), '{}') into v_comments from public.comments where post_id = any(v_ids);
    return jsonb_build_object('kind', 'post', 'label', v_label, 'confirm', v_confirm, 'owner', v_owner, 'counts', jsonb_build_object(
      'posts', cardinality(v_ids) - 1, 'comments', cardinality(v_comments),
      'reactions', (select count(*) from public.post_reactions where post_id = any(v_ids)),
      'comment_likes', (select count(*) from public.comment_reactions where comment_id = any(v_comments)),
      'bookmarks', (select count(*) from public.bookmarks where post_id = any(v_ids)),
      'attachments', (select count(*) from public.post_attachments where post_id = any(v_ids))));
  elsif p_kind = 'community' then
    select c.name, c.slug, pr.username into v_label, v_confirm, v_owner
    from public.communities c left join public.profiles pr on pr.id = c.created_by where c.id = p_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    select coalesce(array_agg(id), '{}') into v_ids from public.posts where community_id = p_id;
    select coalesce(array_agg(id), '{}') into v_comments from public.comments where post_id = any(v_ids);
    return jsonb_build_object('kind', 'community', 'label', v_label, 'confirm', v_confirm, 'owner', v_owner, 'counts', jsonb_build_object(
      'members', (select count(*) from public.community_members where community_id = p_id),
      'posts', cardinality(v_ids), 'comments', cardinality(v_comments),
      'reactions', (select count(*) from public.post_reactions where post_id = any(v_ids)),
      'events', (select count(*) from public.events where community_id = p_id and visibility = 'community')));
  elsif p_kind = 'event' then
    select e.title, e.slug, pr.username into v_label, v_confirm, v_owner
    from public.events e left join public.profiles pr on pr.id = e.organizer_id where e.id = p_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    return jsonb_build_object('kind', 'event', 'label', v_label, 'confirm', v_confirm, 'owner', v_owner, 'counts', jsonb_build_object(
      'responses', (select count(*) from public.event_registrations where event_id = p_id)));
  end if;
  raise exception 'unsupported_action' using errcode = '22023';
end;
$$;
revoke execute on function public.admin_content_impact(text, uuid) from public, anon;
grant execute on function public.admin_content_impact(text, uuid) to authenticated;

create or replace function public.admin_purge_content(p_kind text, p_id uuid, p_reason text, p_confirm text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
  v_college uuid; v_owner uuid; v_slug text; v_title text;
  v_ids uuid[];
  v_res jsonb := jsonb_build_object('counts', '{}'::jsonb, 'files', '[]'::jsonb);
  v_events integer := 0;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission('content.purge', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;

  if p_kind = 'post' then
    select author_id, college_id, slug, coalesce(title, left(body, 60)) into v_owner, v_college, v_slug, v_title from public.posts where id = p_id;
  elsif p_kind = 'community' then
    select created_by, college_id, slug, name into v_owner, v_college, v_slug, v_title from public.communities where id = p_id;
  elsif p_kind = 'event' then
    select organizer_id, college_id, slug, title into v_owner, v_college, v_slug, v_title from public.events where id = p_id;
  else
    raise exception 'unsupported_action' using errcode = '22023';
  end if;
  if v_slug is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  -- The administrator must type the item's address, so the wrong row cannot be deleted by a slip of the mouse.
  if p_confirm is distinct from v_slug then raise exception 'confirmation_mismatch' using errcode = '22023'; end if;

  if p_kind = 'post' then
    v_res := public._purge_posts(array[p_id], v_actor, 'Permanently deleted by an administrator: ' || v_reason);
  elsif p_kind = 'community' then
    select coalesce(array_agg(id), '{}') into v_ids from public.posts where community_id = p_id;
    v_res := public._purge_posts(v_ids, v_actor, 'The community was permanently deleted by an administrator.');
    -- A community-only event cannot outlive its community (check constraint); other events just lose the link.
    delete from public.events where community_id = p_id and visibility = 'community';
    get diagnostics v_events = row_count;
    delete from public.communities where id = p_id;
    v_res := jsonb_set(v_res, '{counts,events}', to_jsonb(v_events), true);
  else
    delete from public.events where id = p_id;
  end if;

  perform public.write_audit_log(v_actor, 'content.purged', p_kind, p_id::text, v_college,
    jsonb_build_object('kind', p_kind, 'slug', v_slug, 'title', v_title, 'owner', v_owner, 'reason', v_reason, 'counts', coalesce(v_res -> 'counts', '{}'::jsonb)));
  if v_owner is not null and v_owner <> v_actor then
    perform public.notify(v_owner, 'moderation_content_removed', null, null, null, jsonb_build_object('kind', p_kind, 'title', v_title, 'reason', v_reason));
  end if;
  return jsonb_build_object('kind', p_kind, 'counts', coalesce(v_res -> 'counts', '{}'::jsonb), 'files', coalesce(v_res -> 'files', '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_purge_content(text, uuid, text, text) from public, anon;
grant execute on function public.admin_purge_content(text, uuid, text, text) to authenticated;

-- ── Administrators: permanently erase a member ──────────────────────────────
-- The checks that come before the server erases an account (the erasure itself reuses the account-deletion routine, so a
-- member erased by an administrator loses exactly what a member erasing themselves loses). Staff accounts are protected: a
-- role has to be removed first. Returns the member's username, which the administrator must type to confirm.
create or replace function public.admin_prepare_user_purge(p_user uuid, p_confirm text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 1000), '');
  v_username text; v_college uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission('users.purge', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = v_actor then raise exception 'cannot_act_on_self' using errcode = '42501'; end if;
  select username, college_id into v_username, v_college from public.profiles where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user) then raise exception 'protected_account' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_confirm is distinct from v_username then raise exception 'confirmation_mismatch' using errcode = '22023'; end if;
  perform public.write_audit_log(v_actor, 'user.purge_started', 'user', p_user::text, v_college, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('username', v_username);
end;
$$;
revoke execute on function public.admin_prepare_user_purge(uuid, text, text) from public, anon;
grant execute on function public.admin_prepare_user_purge(uuid, text, text) to authenticated;

create or replace function public.admin_user_impact(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission('users.purge', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'username', (select username from public.profiles where id = p_user),
    'protected', exists (select 1 from public.user_roles where user_id = p_user),
    'counts', jsonb_build_object(
      'posts', (select count(*) from public.posts where author_id = p_user and status <> 'deleted'),
      'comments', (select count(*) from public.comments where author_id = p_user),
      'reactions', (select count(*) from public.post_reactions where user_id = p_user),
      'projects', (select count(*) from public.projects where owner_id = p_user),
      'connections', (select count(*) from public.connections where user_a = p_user or user_b = p_user),
      'files', (select count(*) from public.files where owner_id = p_user)));
end;
$$;
revoke execute on function public.admin_user_impact(uuid) from public, anon;
grant execute on function public.admin_user_impact(uuid) to authenticated;

-- ── Account erasure: plain reposts of the member's posts go first ───────────
create or replace function public.erase_user_data(p_user uuid, p_erase_messages boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_msgs integer := 0; v_emb integer := 0; v_files integer := 0;
begin
  if p_erase_messages then
    update public.messages set status = 'deleted' where sender_id = p_user and status = 'sent';
    get diagnostics v_msgs = row_count;
  end if;
  -- Other members' plain reposts of this member's posts cannot outlive them (and would block the account's cascade).
  delete from public.posts r
  where r.body = '' and r.repost_of_id in (select id from public.posts where author_id = p_user);
  delete from public.embeddings e
  where (e.entity_type = 'profile' and e.entity_id = p_user)
     or (e.entity_type = 'post' and e.entity_id in (select id from public.posts where author_id = p_user))
     or (e.entity_type = 'project' and e.entity_id in (select id from public.projects where owner_id = p_user));
  get diagnostics v_emb = row_count;
  delete from public.ai_jobs j where j.type = 'embed' and j.status in ('pending', 'processing')
    and ((j.payload ->> 'entityType' = 'profile' and (j.payload ->> 'entityId')::uuid = p_user)
      or (j.payload ->> 'entityType' = 'post' and (j.payload ->> 'entityId')::uuid in (select id from public.posts where author_id = p_user))
      or (j.payload ->> 'entityType' = 'project' and (j.payload ->> 'entityId')::uuid in (select id from public.projects where owner_id = p_user)));
  delete from public.files where owner_id = p_user;
  get diagnostics v_files = row_count;
  return jsonb_build_object('messages_erased', v_msgs, 'embeddings', v_emb, 'file_records', v_files);
end;
$$;
revoke execute on function public.erase_user_data(uuid, boolean) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid, boolean) to service_role;

-- ── One-time clean-up: posts members deleted before this change ─────────────
-- Their comments, likes and bookmarks were still stored. (Stored images become orphans and the maintenance worker's orphan
-- sweep removes the objects.)
do $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids from public.posts where status = 'deleted';
  if cardinality(v_ids) > 0 then perform public._purge_posts(v_ids, null, 'The author deleted the post.'); end if;
end $$;

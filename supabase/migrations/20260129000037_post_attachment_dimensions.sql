-- Post images carry their pixel size, so the feed can draw each picture in a frame of its own shape (1:1, 4:3, 3:2, 16:9, or a
-- portrait frame) before it has loaded. The upload route records width and height from now on; older images have none and the
-- client measures them as they load. Only the content of the `attachments` JSON changes (two keys are added), so every column
-- keeps its name, position and type and the functions that return post_feed keep working.
create or replace view public.post_feed with (security_barrier = true) as
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
    select coalesce(jsonb_agg(jsonb_build_object('id', pa.file_id, 'alt', pa.alt_text, 'width', f.width, 'height', f.height) order by pa.position, pa.created_at), '[]'::jsonb)
    from public.post_attachments pa left join public.files f on f.id = pa.file_id where pa.post_id = p.id
  ) as attachments,
  a.blue_tick as author_blue_tick
from public.posts p
join public.profiles a on a.id = p.author_id
left join public.posts o
  on o.id = p.repost_of_id
 and public.can_view_post(o.author_id, o.college_id, o.visibility, o.community_id, o.status)
left join public.profiles oa on oa.id = o.author_id
where public.can_view_post(p.author_id, p.college_id, p.visibility, p.community_id, p.status);

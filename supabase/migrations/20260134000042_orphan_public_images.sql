-- 0042: clean up public images that were uploaded but never became anyone's picture.
--
-- Uploading an avatar or cover is two steps: the file is stored, then the profile is pointed at it. If the second step
-- never happens (the tab was closed, the request failed, the member picked another image), the stored object stayed
-- forever. orphan_files() already found unfinished uploads and unattached post and chat attachments; this adds avatars
-- and covers that no profile or community uses and that are more than 24 hours old.
--
-- Backward compatible: same signature and result, only more rows can be returned. Nothing is deleted here; the
-- maintenance worker removes the stored object and marks the row deleted, as it does for every other orphan.
--
-- The two partial indexes make "is any profile using this key?" an index lookup instead of a scan of profiles.

create index if not exists profiles_avatar_key_idx on public.profiles (avatar_key) where avatar_key is not null;
create index if not exists profiles_cover_key_idx on public.profiles (cover_key) where cover_key is not null;

create or replace function public.orphan_files(p_limit integer default 50)
returns table (id uuid, bucket text, storage_key text)
language sql stable security definer set search_path = '' as $$
  select f.id, f.bucket, f.storage_key from public.files f
  where (
      (f.status = 'pending' and f.created_at < now() - interval '1 hour')
      or (f.status = 'ready' and f.purpose in ('post_attachment', 'message_attachment') and f.created_at < now() - interval '24 hours'
          and not exists (select 1 from public.post_attachments pa where pa.file_id = f.id)
          and not exists (select 1 from public.message_attachments ma where ma.file_id = f.id))
      or (f.status = 'ready' and f.purpose in ('avatar', 'cover') and f.created_at < now() - interval '24 hours'
          and not exists (select 1 from public.profiles p where p.avatar_key = f.storage_key or p.cover_key = f.storage_key)
          and not exists (select 1 from public.communities c where c.avatar_key = f.storage_key or c.cover_key = f.storage_key))
    )
  order by f.created_at limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.orphan_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_files(integer) to service_role;

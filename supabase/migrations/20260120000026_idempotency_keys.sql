-- Idempotent creates for the three writes where a retry would visibly duplicate content: posts, comments, messages.
--
-- A phone on a bad connection can send "Post" and lose the response; the member (or the app's retry) sends it again.
-- Without a key the server cannot tell a retry from a second post, so the feed shows it twice. The client now sends a
-- random `client_op_id` with the write and keeps it for retries of that same content. The unique index below makes the
-- database the authority: a repeat of the same (author, key) is rejected, and the service returns the row that was
-- already created instead of failing or duplicating.
--
-- The key lives on the row itself, so its retention is the row's lifetime (16 bytes). No separate table to expire.
-- Partial indexes: existing rows and writes that send no key are unaffected.

alter table public.posts add column if not exists client_op_id uuid;
alter table public.comments add column if not exists client_op_id uuid;
alter table public.messages add column if not exists client_op_id uuid;

create unique index if not exists posts_client_op_idx on public.posts (author_id, client_op_id) where client_op_id is not null;
create unique index if not exists comments_client_op_idx on public.comments (author_id, client_op_id) where client_op_id is not null;
create unique index if not exists messages_client_op_idx on public.messages (sender_id, client_op_id) where client_op_id is not null;

-- This project grants INSERT per column. The key is chosen by the client and is only ever a deduplication token, so
-- it is insertable and nothing else (it cannot be changed later: UPDATE is not granted).
grant insert (client_op_id) on public.posts to authenticated;
grant insert (client_op_id) on public.comments to authenticated;
grant insert (client_op_id) on public.messages to authenticated;

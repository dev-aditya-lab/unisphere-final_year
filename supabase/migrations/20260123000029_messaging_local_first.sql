-- Messaging, local-first: fewer round trips per message, an atomic idempotent send, and private typing channels.
--
-- Measured before this change (docs/MESSAGING.md): one incoming message cost the recipient about 45 database
-- statements, because every event re-ran the whole inbox and thread render on the server. The client now keeps the
-- conversation on the device and asks the server for small, targeted answers. These functions are those answers.
--
-- Everything here is additive: no table is dropped, no row is rewritten except the attachment snapshot backfill below,
-- and the app keeps working (through its previous code path) on a database that does not have these functions yet.

-- ── Attachment snapshot on the message row ──────────────────────────────────
-- A realtime INSERT event carries the row. When the attachments live on the row, the recipient renders the message
-- complete from the event alone, instead of fetching it again a moment later (the app used to wait 700 ms and
-- re-download the thread to find out). message_attachments stays the authority for who may open a file.
alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;

update public.messages m
set attachments = s.items
from (
  select a.message_id,
         jsonb_agg(jsonb_build_object('id', f.id, 'original_name', f.original_name, 'mime_type', f.mime_type) order by f.created_at) as items
  from public.message_attachments a
  join public.files f on f.id = a.file_id
  group by a.message_id
) s
where s.message_id = m.id and m.status = 'sent' and m.attachments = '[]'::jsonb;

-- A deleted message keeps neither its text nor its attachment list.
create or replace function public.messages_before_write() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'deleted' then new.body := ''; new.attachments := '[]'::jsonb; end if;
    if new.body is distinct from old.body and new.status = 'sent' then new.edited_at := now(); end if;
  end if;
  return new;
end; $$;

-- ── Indexes for the queries the new endpoints actually run ──────────────────
-- The per-member send limit counts a sender's recent messages. (sender_id, client_op_id) is already indexed for
-- idempotency but cannot answer "how many in the last minute".
create index if not exists messages_sender_recent_idx on public.messages (sender_id, created_at desc);

-- ── The inbox in one round trip ─────────────────────────────────────────────
-- Replaces five sequential/parallel reads (my memberships, conversations, other members, profiles, unread counts).
-- SECURITY INVOKER on purpose: the conversation, membership and profile rows are filtered by the same row level
-- security as before, so a profile the caller may not see still comes back as "UniSphere member".
create or replace function public.inbox_conversations(p_limit integer default 100)
returns table (
  conversation_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  muted boolean,
  last_read_at timestamptz,
  unread bigint,
  other_user_id uuid,
  other_full_name text,
  other_username text,
  other_avatar_key text,
  other_headline text,
  other_last_read_at timestamptz
)
language sql stable set search_path = '' as $$
  select c.id, c.last_message_at, c.last_message_preview, me.muted, me.last_read_at,
         coalesce(u.unread, 0)::bigint,
         o.user_id, p.full_name, p.username, p.avatar_key, p.headline, o.last_read_at
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join public.conversation_members o on o.conversation_id = me.conversation_id and o.user_id <> me.user_id
  left join public.profiles p on p.id = o.user_id
  left join public.unread_message_counts() u on u.conversation_id = me.conversation_id
  where me.user_id = (select auth.uid())
  order by c.last_message_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- One conversation's header: the other person, both read positions, mute, and whether the caller may still send.
-- Returns no row when the caller is not a member (the endpoint answers 404, never "forbidden", so ids do not leak).
create or replace function public.conversation_header(p_conv uuid)
returns table (
  conversation_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  muted boolean,
  last_read_at timestamptz,
  other_user_id uuid,
  other_full_name text,
  other_username text,
  other_avatar_key text,
  other_headline text,
  other_last_read_at timestamptz,
  can_send boolean
)
language sql stable set search_path = '' as $$
  select c.id, c.last_message_at, c.last_message_preview, me.muted, me.last_read_at,
         o.user_id, p.full_name, p.username, p.avatar_key, p.headline, o.last_read_at,
         public.can_send_in_conversation(c.id)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join public.conversation_members o on o.conversation_id = me.conversation_id and o.user_id <> me.user_id
  left join public.profiles p on p.id = o.user_id
  where me.conversation_id = p_conv and me.user_id = (select auth.uid());
$$;

-- ── Atomic, idempotent send ─────────────────────────────────────────────────
-- One call does what took five: authorise, limit, insert (or find the earlier insert for this key), attach files.
-- Runs as the definer so it can write the attachment snapshot, and therefore re-checks everything the row level
-- security policies and column grants used to check: membership and block/consent rules through
-- can_send_in_conversation, ownership and readiness of every file, and the 4000-character limit.
--
-- Returns jsonb: { message: {...}, replayed: boolean } or raises one of these (message text is the contract):
--   not_authenticated · cannot_send · empty_message · too_many_files · invalid_file · rate_limited
create or replace function public.send_message(p_conversation uuid, p_body text, p_file_ids uuid[], p_client_op_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_files uuid[] := coalesce(p_file_ids, '{}'::uuid[]);
  v_items jsonb := '[]'::jsonb;
  v_found integer;
  v_msg public.messages%rowtype;
  v_replayed boolean := false;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if char_length(v_body) > 4000 then raise exception 'empty_message' using errcode = '22023'; end if;
  if v_body = '' and cardinality(v_files) = 0 then raise exception 'empty_message' using errcode = '22023'; end if;
  if cardinality(v_files) > 3 then raise exception 'too_many_files' using errcode = '22023'; end if;

  -- A retry of a send that already went through must succeed quietly, even if the conversation has since been closed
  -- to the sender: the message exists, the client only needs to learn that.
  if p_client_op_id is not null then
    select * into v_msg from public.messages where sender_id = v_me and client_op_id = p_client_op_id;
    if found then
      return jsonb_build_object('message', to_jsonb(v_msg), 'replayed', true);
    end if;
  end if;

  if not public.can_send_in_conversation(p_conversation) then raise exception 'cannot_send' using errcode = '42501'; end if;

  -- 30 messages a minute per member: the same limit the application used to keep in Redis, kept here so it holds
  -- for every instance and costs one indexed count instead of a network round trip to another service.
  if (select count(*) from public.messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;

  if cardinality(v_files) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'original_name', f.original_name, 'mime_type', f.mime_type) order by f.created_at), '[]'::jsonb), count(*)
      into v_items, v_found
    from public.files f
    where f.id = any (v_files) and f.owner_id = v_me and f.purpose = 'message_attachment' and f.status = 'ready';
    if v_found <> (select count(distinct x) from unnest(v_files) x) then raise exception 'invalid_file' using errcode = '22023'; end if;
  end if;

  begin
    insert into public.messages (conversation_id, sender_id, body, client_op_id, attachments)
    values (p_conversation, v_me, v_body, p_client_op_id, v_items)
    returning * into v_msg;
  exception when unique_violation then
    -- Two copies of the same send raced (two tabs, or a retry overlapping the original): the other one won.
    select * into v_msg from public.messages where sender_id = v_me and client_op_id = p_client_op_id;
    v_replayed := true;
  end;

  if not v_replayed and cardinality(v_files) > 0 then
    insert into public.message_attachments (message_id, file_id) select v_msg.id, x from unnest(v_files) x on conflict do nothing;
  end if;

  return jsonb_build_object('message', to_jsonb(v_msg), 'replayed', v_replayed);
end; $$;

-- ── Page of messages, either direction ──────────────────────────────────────
-- (before) newest first, for scrolling back; (after) oldest first, for catching up after a disconnect.
-- Plain SQL under the caller's row level security. The (conversation_id, created_at, id) index serves both.
create or replace function public.conversation_messages(
  p_conv uuid, p_before_ts timestamptz default null, p_before_id uuid default null,
  p_after_ts timestamptz default null, p_after_id uuid default null, p_limit integer default 30
)
returns setof public.messages
language plpgsql stable set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if p_after_ts is not null then
    return query
      select * from public.messages m
      where m.conversation_id = p_conv and (m.created_at, m.id) > (p_after_ts, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
      order by m.created_at asc, m.id asc limit v_limit;
  elsif p_before_ts is not null then
    return query
      select * from public.messages m
      where m.conversation_id = p_conv and (m.created_at, m.id) < (p_before_ts, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      order by m.created_at desc, m.id desc limit v_limit;
  else
    return query
      select * from public.messages m where m.conversation_id = p_conv
      order by m.created_at desc, m.id desc limit v_limit;
  end if;
end; $$;

revoke execute on function public.inbox_conversations(integer), public.conversation_header(uuid),
  public.send_message(uuid, text, uuid[], uuid), public.conversation_messages(uuid, timestamptz, uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.inbox_conversations(integer), public.conversation_header(uuid),
  public.send_message(uuid, text, uuid[], uuid), public.conversation_messages(uuid, timestamptz, uuid, timestamptz, uuid, integer)
  to authenticated;

-- ── Private typing channels ─────────────────────────────────────────────────
-- Typing indicators are Realtime broadcasts. A public channel is open to anyone who knows its name. The app now
-- joins `typing:<conversation id>` as a private channel, and these policies let only the two members of that
-- conversation receive or send on it. Knowing the name is not authorisation.
-- (The cast sits inside CASE so a malformed topic is "no" rather than an error.)
drop policy if exists typing_receive on realtime.messages;
create policy typing_receive on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select case when realtime.topic() ~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_conversation_member(substr(realtime.topic(), 8)::uuid) else false end)
);
drop policy if exists typing_send on realtime.messages;
create policy typing_send on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and (select case when realtime.topic() ~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_conversation_member(substr(realtime.topic(), 8)::uuid) else false end)
);

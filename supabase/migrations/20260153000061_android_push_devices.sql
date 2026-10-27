-- 0061: Android app push (Firebase Cloud Messaging)
-- A member opts in on each phone. The app sends the token Firebase gave it; the worker pushes each new, unread, in-app
-- notification to it, exactly as it does for Web Push (push_subscriptions), so the same per-category preferences and blocks that gate the
-- bell also gate push on the phone.
--
-- A token is a credential for sending notifications to one phone, so it is never shown back to the member (the data export lists only
-- when a device was added and last used), is deleted when the member signs out of the app, turns notifications off, or is erased
-- (on delete cascade), and is dropped when Google reports it dead or the app has not been opened for 90 days.

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('android')),
  token text not null unique check (char_length(token) between 20 and 4096),
  app_version text check (app_version is null or char_length(app_version) <= 20),
  failure_count integer not null default 0,
  last_success_at timestamptz,
  -- Refreshed each time the app starts with notifications on, so a phone that is no longer used can be dropped.
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index push_devices_user_idx on public.push_devices (user_id);
create index push_devices_seen_idx on public.push_devices (last_seen_at);

alter table public.push_devices enable row level security;
-- Members can see and remove their own phones; registering goes through the server (it must take over a token that previously
-- belonged to someone else signed in on the same phone), and the token column is never granted to the client.
grant select (id, user_id, platform, app_version, last_success_at, last_seen_at, created_at) on public.push_devices to authenticated;
grant delete on public.push_devices to authenticated;
create policy push_devices_select_own on public.push_devices for select to authenticated using (user_id = (select auth.uid()));
create policy push_devices_delete_own on public.push_devices for delete to authenticated using (user_id = (select auth.uid()));

-- Worker: claim unread notifications from the last two hours for members that have a Web Push subscription or an Android device.
-- (Same function as 0014, with the second kind of device.)
create or replace function public.claim_push_notifications(p_limit integer default 100)
returns table (
  id uuid, user_id uuid, type text, category text, entity_id uuid, data jsonb, actor_name text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Too old to be useful as an interruption; the bell still shows them.
  update public.notifications n set pushed_at = now()
    where n.pushed_at is null and n.created_at < now() - interval '2 hours';
  return query
    with picked as (
      select n.id from public.notifications n
      where n.pushed_at is null and n.read_at is null
        and (exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
          or exists (select 1 from public.push_devices d where d.user_id = n.user_id))
      order by n.created_at
      limit least(greatest(p_limit, 1), 500)
      for update skip locked)
    update public.notifications n set pushed_at = now()
      from picked
      where n.id = picked.id
      returning n.id, n.user_id, n.type, n.category, n.entity_id, n.data,
        (select p.full_name from public.profiles p where p.id = n.actor_id), n.created_at;
end; $$;
revoke execute on function public.claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(integer) to service_role;

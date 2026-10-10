-- 0014: Web Push (installed-app notifications)
-- A member opts in per device. The worker sends a push for each new, unread, in-app notification, so the
-- same per-category preferences and blocks that gate the bell also gate push.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1200 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 200),
  failure_count integer not null default 0,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- Members can see and remove their own devices; subscribing goes through the server (it must take over an
-- endpoint that previously belonged to someone else signed in on the same browser).
grant select, delete on public.push_subscriptions to authenticated;
create policy push_select_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_delete_own on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

alter table public.notifications add column pushed_at timestamptz;
-- Anything created before push existed is considered delivered.
update public.notifications set pushed_at = now();
create index notifications_push_idx on public.notifications (created_at) where pushed_at is null and read_at is null;

-- Worker: claim unread notifications from the last two hours for members that have a subscription.
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
        and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
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

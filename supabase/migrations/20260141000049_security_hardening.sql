-- 0049: security hardening found in the 2026-10-21 audit (docs/security-audit.md)
--
--   1. are_connected / is_blocked_between were callable by any member for ANY pair of members, which made them an oracle
--      ("is A connected to B?", "has A blocked B?"). A member-initiated call must now involve the caller.
--   2. Two counter-refresh helpers were callable by every member; only the triggers that own them need to run them.
--   3. Link columns accepted any text when written straight through the API (the app validates, the database did not),
--      so a `javascript:` or `data:` value could be stored and rendered as a link. They are now http(s) only.
--
-- Safe to re-run. No data is changed.

-- ── 1. Relationship helpers: the caller must be one of the pair ─────────────
-- Server-side code (service role, triggers, jobs) has no auth.uid() and is unaffected.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select auth.uid()) is null or (select auth.uid()) in (a, b))
     and exists (
       select 1 from public.connections c
       where c.user_a = least(a, b) and c.user_b = greatest(a, b)
     );
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select auth.uid()) is null or (select auth.uid()) in (a, b))
     and exists (
       select 1 from public.user_blocks x
       where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
     );
$$;

-- ── 2. Counter helpers are for the triggers only ────────────────────────────
revoke execute on function public.refresh_post_reactions(uuid) from public, anon, authenticated;
revoke execute on function public.event_counts_refresh(uuid) from public, anon, authenticated;
grant execute on function public.refresh_post_reactions(uuid) to service_role;
grant execute on function public.event_counts_refresh(uuid) to service_role;

-- ── 3. Links are http(s) addresses, never other schemes ─────────────────────
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('colleges', 'website'),
      ('events', 'online_url'),
      ('events', 'registration_url'),
      ('opportunities', 'apply_url'),
      ('profile_achievements', 'url'),
      ('profiles', 'github_url'),
      ('profiles', 'portfolio_url'),
      ('projects', 'demo_url'),
      ('projects', 'repo_url')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', c.tbl)::regclass and conname = format('%s_%s_http_check', c.tbl, c.col)
    ) then
      execute format(
        'alter table public.%I add constraint %I check (%I is null or (char_length(%I) <= 2048 and %I ~* %L))',
        c.tbl, format('%s_%s_http_check', c.tbl, c.col), c.col, c.col, c.col, '^https?://[^[:space:]<>"]+$'
      );
    end if;
  end loop;
end $$;

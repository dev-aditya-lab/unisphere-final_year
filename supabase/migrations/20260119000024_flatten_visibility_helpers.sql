-- Performance: flatten the row-visibility helpers.
--
-- Evidence (local database, 247 profiles, 91 posts): `select count(*) from profiles where username like 'zzzz%'`
-- (matches nothing) took 81 ms, a post search 113 ms and the feed RPC 90 ms. Row Level Security evaluates
-- `can_view_profile` / `can_view_post` for every candidate row, and each call fanned out into 4 to 6 nested
-- SECURITY DEFINER functions that each carry `SET search_path`. Measured over 4,940 evaluations: the nested wrapper
-- cost 1,977 ms (0.4 ms a row); the same logic written as one flat function costs a few microseconds a row. Cost grew
-- linearly with table size, so every list, search and feed query got slower as the community grew.
--
-- What changes: ONLY the bodies of the public `can_view_*` wrappers. Each nested call is replaced by the identical
-- subquery that the nested function ran (my_college_id, can_use_network, has_permission, is_community_member,
-- are_connected, is_project_member). Signatures, volatility, SECURITY DEFINER and `search_path = ''` are unchanged, so
-- policies and views need no change, and the `_can_view_*_base` functions remain for any other caller.
--
-- Semantics are intentionally identical. Wrapper = base AND (owner OR can_use_network()); the owner short-circuit is
-- folded in below. tests/integration/rls-*.test.js cover the behaviour and tests/integration/visibility-equivalence
-- compares the flat functions against the originals row by row.

-- ── profiles ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.can_view_profile(p_id uuid, p_visibility text, p_college uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) = p_id
    or (
      p_status in ('active', 'restricted')
      and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.status in ('active', 'restricted'))
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_id and b.blocked_id = (select auth.uid()))
           or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_id)
      )
      and (
        p_visibility = 'public'
        or (
          (select auth.uid()) is not null
          and (
            (p_visibility = 'college' and p_college is not null
              and p_college = (select me.college_id from public.profiles me where me.id = (select auth.uid())))
            or (p_visibility in ('college', 'connections')
              and exists (select 1 from public.connections c
                          where c.user_a = least((select auth.uid()), p_id) and c.user_b = greatest((select auth.uid()), p_id)))
          )
        )
      )
    );
$$;

-- ── posts ───────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.can_view_post(p_author uuid, p_college uuid, p_visibility text, p_community uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) = p_author then p_status <> 'deleted'
      else (
        exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.status in ('active', 'restricted'))
        and (
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
                  (p_visibility = 'college' and p_college is not null
                    and p_college = (select me.college_id from public.profiles me where me.id = (select auth.uid())))
                  or (p_visibility = 'connections'
                    and exists (select 1 from public.connections c
                                where c.user_a = least((select auth.uid()), p_author) and c.user_b = greatest((select auth.uid()), p_author)))
                  or (p_visibility = 'community' and p_community is not null
                    and exists (select 1 from public.community_members m
                                where m.community_id = p_community and m.user_id = (select auth.uid()) and m.status = 'active'))
                )
              )
            )
          )
          or (
            p_status <> 'deleted'
            and exists (
              select 1
              from public.user_roles ur
              join public.role_permissions rp on rp.role = ur.role
              join public.profiles pm on pm.id = ur.user_id
              where ur.user_id = (select auth.uid()) and pm.status = 'active'
                and rp.permission = 'reports.view' and (ur.college_id is null or ur.college_id = p_college)
            )
          )
        )
      )
    end;
$$;

-- ── projects ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.can_view_project(p_id uuid, p_owner uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      p_deleted is null and (
        exists (select 1 from public.project_members m where m.project_id = p_id and m.user_id = (select auth.uid()))
        or (
          exists (select 1 from public.profiles o where o.id = p_owner and o.status in ('active', 'restricted'))
          and not exists (
            select 1 from public.user_blocks b
            where (b.blocker_id = p_owner and b.blocked_id = (select auth.uid())) or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_owner))
          and (
            p_visibility = 'public'
            or ((select auth.uid()) is not null and p_visibility = 'college' and p_college is not null
                and p_college = (select me.college_id from public.profiles me where me.id = (select auth.uid())))
          )
        )
      )
      or (
        p_deleted is null
        and exists (
          select 1 from public.user_roles ur
          join public.role_permissions rp on rp.role = ur.role
          join public.profiles pm on pm.id = ur.user_id
          where ur.user_id = (select auth.uid()) and pm.status = 'active'
            and rp.permission = 'reports.view' and (ur.college_id is null or ur.college_id = p_college)
        )
      )
    )
    and (
      p_owner = (select auth.uid())
      or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.status in ('active', 'restricted'))
    );
$$;

-- ── events ──────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.can_view_event(p_id uuid, p_organizer uuid, p_college uuid, p_visibility text, p_community uuid, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_deleted is null
    and (
      p_organizer = (select auth.uid())
      or (
        not exists (
          select 1 from public.user_blocks b
          where (b.blocker_id = p_organizer and b.blocked_id = (select auth.uid()))
             or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_organizer))
        and (
          p_visibility = 'public'
          or ((select auth.uid()) is not null and (
            (p_visibility = 'college' and p_college is not null
              and p_college = (select me.college_id from public.profiles me where me.id = (select auth.uid())))
            or (p_visibility = 'community' and p_community is not null
              and exists (select 1 from public.community_members m
                          where m.community_id = p_community and m.user_id = (select auth.uid()) and m.status = 'active'))
          ))
        )
      )
      or exists (
        select 1 from public.user_roles ur
        join public.role_permissions rp on rp.role = ur.role
        join public.profiles pm on pm.id = ur.user_id
        where ur.user_id = (select auth.uid()) and pm.status = 'active'
          and rp.permission = 'events.manage' and (ur.college_id is null or ur.college_id = p_college)
      )
    )
    and (
      p_organizer = (select auth.uid())
      or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.status in ('active', 'restricted'))
    );
$$;

-- ── opportunities ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.can_view_opportunity(p_poster uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_deleted is null
    and (
      p_poster = (select auth.uid()) or p_visibility = 'public'
      or ((select auth.uid()) is not null and p_college is not null
          and p_college = (select me.college_id from public.profiles me where me.id = (select auth.uid())))
      or exists (
        select 1 from public.user_roles ur
        join public.role_permissions rp on rp.role = ur.role
        join public.profiles pm on pm.id = ur.user_id
        where ur.user_id = (select auth.uid()) and pm.status = 'active'
          and rp.permission = 'opportunities.manage' and (ur.college_id is null or ur.college_id = p_college)
      )
    )
    and (
      p_poster = (select auth.uid())
      or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.status in ('active', 'restricted'))
    );
$$;

-- ── communities ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.can_view_community(p_id uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_deleted is null
    and (
      p_visibility = 'public'
      or ((select auth.uid()) is not null and p_visibility = 'college' and p_college is not null
          and p_college = (select me.college_id from public.profiles me where me.id = (select auth.uid())))
      or exists (select 1 from public.community_members m
                 where m.community_id = p_id and m.user_id = (select auth.uid()) and m.status = 'active')
      or exists (
        select 1 from public.user_roles ur
        join public.role_permissions rp on rp.role = ur.role
        join public.profiles pm on pm.id = ur.user_id
        where ur.user_id = (select auth.uid()) and pm.status = 'active'
          and rp.permission = 'communities.manage' and (ur.college_id is null or ur.college_id = p_college)
      )
    )
    and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.status in ('active', 'restricted'));
$$;

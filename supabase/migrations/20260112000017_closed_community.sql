-- 0017: a closed community for Ramgarh Engineering College
-- ---------------------------------------------------------------------------
-- UniSphere is a social network for RGEC members only. This migration:
--   1. removes college-email verification (membership is proven with the student ID, or by manual review)
--   2. makes every piece of member content invisible to anonymous visitors, and to signed-in accounts that have not
--      been verified (when "college_verification_required" is on, which is the production default)
--   3. closes a long-standing gap: PostgreSQL grants EXECUTE on new functions to PUBLIC by default, which includes
--      the anonymous role. Every function is now granted explicitly, and anonymous visitors get only a short list.
-- Staff (anyone holding a role) are never locked out by the verification gate.
-- ---------------------------------------------------------------------------

-- ── 1. College email verification is gone ───────────────────────────────────
update public.college_verifications set method = 'manual' where method = 'email_domain';
update public.colleges set verification_mode = 'manual' where verification_mode = 'email_domain';

alter table public.colleges drop constraint if exists colleges_verification_mode_check;
alter table public.colleges add constraint colleges_verification_mode_check
  check (verification_mode in ('manual', 'invite', 'student_id'));
alter table public.college_verifications drop constraint if exists college_verifications_method_check;
alter table public.college_verifications add constraint college_verifications_method_check
  check (method in ('manual', 'invite', 'student_id'));

drop table if exists public.college_email_challenges;
drop table if exists public.college_domains cascade;

-- ── 2. The "may use the network" gate ───────────────────────────────────────
-- Active or restricted account, and (verification not required OR verified OR holds any staff role).
create or replace function public.can_use_network()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.status in ('active', 'restricted')
      and (
        not public.setting_bool('college_verification_required', false)
        or p.verification_status = 'verified'
        or exists (select 1 from public.user_roles ur where ur.user_id = p.id)
      )
  );
$$;
grant execute on function public.can_use_network() to authenticated, service_role;

-- can_view_post: unchanged rules live on in _can_view_post_base; the wrapper adds the "members only" gate.
CREATE OR REPLACE FUNCTION public._can_view_post_base(p_author uuid, p_college uuid, p_visibility text, p_community uuid, p_status text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    case
      when (select auth.uid()) = p_author then p_status <> 'deleted'
      else (
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
                (p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
                or (p_visibility = 'connections' and public.are_connected((select auth.uid()), p_author))
                or (p_visibility = 'community' and p_community is not null and public.is_community_member(p_community))
              )
            )
          )
        )
        or (p_status <> 'deleted' and public.has_permission('reports.view', p_college))
      )
    end;
$function$;

create or replace function public.can_view_post(p_author uuid, p_college uuid, p_visibility text, p_community uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._can_view_post_base(p_author, p_college, p_visibility, p_community, p_status)
     and (p_author = (select auth.uid()) or public.can_use_network());
$$;

-- can_view_profile: unchanged rules live on in _can_view_profile_base; the wrapper adds the "members only" gate.
CREATE OR REPLACE FUNCTION public._can_view_profile_base(p_id uuid, p_visibility text, p_college uuid, p_status text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (select auth.uid()) = p_id
    or (
      p_status in ('active', 'restricted')
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
            (p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
            or (p_visibility in ('college', 'connections') and public.are_connected((select auth.uid()), p_id))
          )
        )
      )
    );
$function$;

create or replace function public.can_view_profile(p_id uuid, p_visibility text, p_college uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._can_view_profile_base(p_id, p_visibility, p_college, p_status)
     and (p_id = (select auth.uid()) or public.can_use_network());
$$;

-- can_view_project: unchanged rules live on in _can_view_project_base; the wrapper adds the "members only" gate.
CREATE OR REPLACE FUNCTION public._can_view_project_base(p_id uuid, p_owner uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_deleted is null and (
    public.is_project_member(p_id)
    or (
      exists (select 1 from public.profiles o where o.id = p_owner and o.status in ('active', 'restricted'))
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_owner and b.blocked_id = (select auth.uid())) or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_owner))
      and (
        p_visibility = 'public'
        or ((select auth.uid()) is not null and p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
      )
    )
  ) or (p_deleted is null and public.has_permission('reports.view', p_college));
$function$;

create or replace function public.can_view_project(p_id uuid, p_owner uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._can_view_project_base(p_id, p_owner, p_college, p_visibility, p_deleted)
     and (p_owner = (select auth.uid()) or public.can_use_network());
$$;

-- can_view_community: unchanged rules live on in _can_view_community_base; the wrapper adds the "members only" gate.
CREATE OR REPLACE FUNCTION public._can_view_community_base(p_id uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_deleted is null and (
    p_visibility = 'public'
    or ((select auth.uid()) is not null and p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
    or public.is_community_member(p_id)
    or public.has_permission('communities.manage', p_college)
  );
$function$;

create or replace function public.can_view_community(p_id uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._can_view_community_base(p_id, p_college, p_visibility, p_deleted)
     and (public.can_use_network());
$$;

-- can_view_event: unchanged rules live on in _can_view_event_base; the wrapper adds the "members only" gate.
CREATE OR REPLACE FUNCTION public._can_view_event_base(p_id uuid, p_organizer uuid, p_college uuid, p_visibility text, p_community uuid, p_deleted timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_deleted is null and (
    p_organizer = (select auth.uid())
    or (
      not exists (select 1 from public.user_blocks b where (b.blocker_id = p_organizer and b.blocked_id = (select auth.uid())) or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_organizer))
      and (
        p_visibility = 'public'
        or ((select auth.uid()) is not null and (
          (p_visibility = 'college' and p_college is not null and p_college = public.my_college_id())
          or (p_visibility = 'community' and p_community is not null and public.is_community_member(p_community))))
      )
    )
    or public.has_permission('events.manage', p_college)
  );
$function$;

create or replace function public.can_view_event(p_id uuid, p_organizer uuid, p_college uuid, p_visibility text, p_community uuid, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._can_view_event_base(p_id, p_organizer, p_college, p_visibility, p_community, p_deleted)
     and (p_organizer = (select auth.uid()) or public.can_use_network());
$$;

-- can_view_opportunity: unchanged rules live on in _can_view_opportunity_base; the wrapper adds the "members only" gate.
CREATE OR REPLACE FUNCTION public._can_view_opportunity_base(p_poster uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_deleted is null and (
    p_poster = (select auth.uid()) or p_visibility = 'public'
    or ((select auth.uid()) is not null and p_college is not null and p_college = public.my_college_id())
    or public.has_permission('opportunities.manage', p_college));
$function$;

create or replace function public.can_view_opportunity(p_poster uuid, p_college uuid, p_visibility text, p_deleted timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._can_view_opportunity_base(p_poster, p_college, p_visibility, p_deleted)
     and (p_poster = (select auth.uid()) or public.can_use_network());
$$;

-- can_message: unchanged rules live on in _can_message_base; the wrapper adds the "members only" gate.
CREATE OR REPLACE FUNCTION public._can_message_base(p_sender uuid, p_recipient uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_sender <> p_recipient
    and exists (select 1 from public.profiles s where s.id = p_sender and s.status = 'active')
    and not public.is_blocked_between(p_sender, p_recipient)
    and coalesce((
      select case r.allow_messages_from
        when 'everyone' then true
        when 'college' then (r.college_id is not null and r.college_id = (select college_id from public.profiles where id = p_sender))
                            or public.are_connected(p_sender, p_recipient)
        when 'connections' then public.are_connected(p_sender, p_recipient)
        else false end
      from public.profiles r where r.id = p_recipient and r.status in ('active', 'restricted')
    ), false);
$function$;

create or replace function public.can_message(p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._can_message_base(p_sender, p_recipient)
     and (public.can_use_network());
$$;

-- Shared tables read directly (not through the visibility functions) get an explicit gate as well.
-- RESTRICTIVE policies are ANDed with the existing permissive ones, so nothing becomes more permissive.
create policy gate_college_announcements on public.college_announcements as restrictive for select to authenticated
  using (public.can_use_network());
create policy gate_hashtags on public.hashtags as restrictive for select to authenticated
  using (public.can_use_network());
create policy gate_feedback_items on public.feedback_items as restrictive for select to authenticated
  using (user_id = (select auth.uid()) or public.can_use_network());

-- ── 3. Nothing is public any more ───────────────────────────────────────────
-- Anonymous visitors keep: the college list (sign-up form), platform settings flagged public (maintenance
-- notice, support email) and feature flags. Everything else is revoked.
revoke select on
  public.posts, public.post_feed, public.comment_feed, public.post_hashtags, public.post_attachments, public.hashtags,
  public.profiles, public.profile_achievements, public.profile_experiences, public.files, public.slug_redirects,
  public.projects, public.project_members, public.project_open_roles, public.project_cards,
  public.communities, public.community_cards, public.events, public.event_cards, public.opportunities,
  public.releases
from anon;

-- Every function: grant exactly what each role has today, then remove the implicit PUBLIC grant (and anon's).
do $$
declare
  f record;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    if has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if has_function_privilege('service_role', f.oid, 'execute') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
    execute format('revoke execute on function %s from public', f.sig);
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;
end $$;

-- Future functions start closed too: they must be granted explicitly.
alter default privileges in schema public revoke execute on functions from public;

-- The short list anonymous visitors genuinely need (sign-up form, maintenance banner, RLS policy evaluation).
grant execute on function
  public.username_available(text),
  public.has_permission(text, uuid),
  public.jwt_role(),
  public.setting_bool(text, boolean),
  public.flag_enabled(text)
to anon;

-- Feedback roadmap and changelog are for signed-in members only.
revoke execute on function public.public_roadmap() from anon;

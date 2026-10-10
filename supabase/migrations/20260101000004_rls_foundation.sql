-- 0004: row level security + grants for the foundation tables
-- Pattern: every table has RLS enabled, API roles receive only the privileges
-- they need (column-level for UPDATE where trust fields exist), and policies
-- then filter rows. `(select auth.uid())` is wrapped so Postgres evaluates it once.

-- ── Profile visibility ──────────────────────────────────────────────────────
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
$$;
grant execute on function public.can_view_profile(uuid, text, uuid, text) to anon, authenticated, service_role;

-- ── Reference data: colleges & structure ────────────────────────────────────
alter table public.colleges enable row level security;
alter table public.college_domains enable row level security;
alter table public.campuses enable row level security;
alter table public.departments enable row level security;
alter table public.academic_programs enable row level security;
alter table public.reserved_usernames enable row level security;
alter table public.slug_redirects enable row level security;

grant select on public.colleges, public.college_domains, public.campuses, public.departments, public.academic_programs
  to anon, authenticated;
grant insert, update, delete on public.colleges, public.college_domains, public.campuses, public.departments, public.academic_programs
  to authenticated;
grant select on public.slug_redirects to anon, authenticated;

create policy colleges_select on public.colleges for select to anon, authenticated
  using (is_active or public.has_permission('colleges.manage', null));
create policy colleges_insert on public.colleges for insert to authenticated
  with check (public.has_permission('colleges.manage', null));
create policy colleges_update on public.colleges for update to authenticated
  using (public.has_permission('college.manage', id)) with check (public.has_permission('college.manage', id));
create policy colleges_delete on public.colleges for delete to authenticated
  using (public.has_permission('colleges.manage', null));

create policy college_domains_select on public.college_domains for select to anon, authenticated using (true);
create policy college_domains_write on public.college_domains for all to authenticated
  using (public.has_permission('college.manage', college_id))
  with check (public.has_permission('college.manage', college_id));

create policy campuses_select on public.campuses for select to anon, authenticated using (true);
create policy campuses_write on public.campuses for all to authenticated
  using (public.has_permission('college.manage', college_id))
  with check (public.has_permission('college.manage', college_id));

create policy departments_select on public.departments for select to anon, authenticated using (true);
create policy departments_write on public.departments for all to authenticated
  using (public.has_permission('college.manage', college_id))
  with check (public.has_permission('college.manage', college_id));

create policy programs_select on public.academic_programs for select to anon, authenticated using (true);
create policy programs_write on public.academic_programs for all to authenticated
  using (public.has_permission('college.manage', college_id))
  with check (public.has_permission('college.manage', college_id));

create policy slug_redirects_select on public.slug_redirects for select to anon, authenticated using (true);
-- reserved_usernames: no policies and no grants -> only reachable through definer functions.

-- ── Profiles ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.profile_class_info enable row level security;
alter table public.profile_achievements enable row level security;
alter table public.profile_experiences enable row level security;

grant select on public.profiles to anon, authenticated;
-- Trust & moderation columns (status, verification_*, counters, search_vector…) are intentionally
-- absent from this list: users cannot change them through the API.
grant update (
  username, full_name, headline, bio, account_type,
  college_id, campus_id, department_id, program_id, graduation_year,
  skills, interests, avatar_key, cover_key, github_url, portfolio_url, social_links,
  open_to_collaboration, preferred_roles, availability,
  open_to_mentoring, mentoring_topics, industry, company, job_title,
  visibility, allow_messages_from, show_class, onboarded_at, last_seen_at
) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to anon, authenticated
  using (
    public.can_view_profile(id, visibility, college_id, status)
    or public.has_permission('users.view', college_id)
  );
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and status in ('active', 'restricted'))
  with check (id = (select auth.uid()));

grant select, insert, update, delete on public.profile_class_info, public.profile_achievements, public.profile_experiences
  to authenticated;
grant select on public.profile_achievements, public.profile_experiences to anon;

-- Rows are visible when the owning profile is visible (profiles RLS applies inside the subquery).
create policy class_info_select on public.profile_class_info for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = user_id and p.show_class)
  );
create policy class_info_write on public.profile_class_info for all to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()) and public.is_member());

create policy achievements_select on public.profile_achievements for select to anon, authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = user_id));
create policy achievements_write on public.profile_achievements for all to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()) and public.is_member());

create policy experiences_select on public.profile_experiences for select to anon, authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = user_id));
create policy experiences_write on public.profile_experiences for all to authenticated
  using (user_id = (select auth.uid()) and public.is_member())
  with check (user_id = (select auth.uid()) and public.is_member());

-- ── Social graph ────────────────────────────────────────────────────────────
alter table public.follows enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.user_blocks enable row level security;

-- Mutations on connections / requests / blocks go through SECURITY DEFINER RPCs (added with the feature).
grant select on public.follows, public.connection_requests, public.connections, public.user_blocks to authenticated;
grant insert, delete on public.follows to authenticated;

create policy follows_select on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));
create policy follows_insert on public.follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and public.is_active_user()
    and not public.is_blocked_between(follower_id, following_id)
    and exists (select 1 from public.profiles p where p.id = following_id)
  );
create policy follows_delete on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create policy connection_requests_select on public.connection_requests for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy connections_select on public.connections for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));
create policy user_blocks_select on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- ── RBAC & audit ────────────────────────────────────────────────────────────
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;

grant select on public.user_roles, public.role_permissions, public.audit_logs to authenticated;

create policy user_roles_select on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('roles.manage', college_id)
    or public.has_permission('roles.manage_limited', college_id)
  );
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_permission('audit.view', college_id));

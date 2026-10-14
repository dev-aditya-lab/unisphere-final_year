-- 0021: a member's role is optional, so analytics must cope with "not stated".
-- (admin_overview grouped members by account_type into a JSON object, and a NULL key is not allowed there.)
CREATE OR REPLACE FUNCTION public.admin_overview(p_college uuid DEFAULT NULL::uuid, p_from date DEFAULT (CURRENT_DATE - 29), p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_from timestamptz; v_to timestamptz;
begin
  if p_to < p_from or p_to - p_from > 366 then raise exception 'invalid_range' using errcode = '22023'; end if;
  if not public.has_permission('analytics.view', p_college) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_from := p_from::timestamp at time zone 'UTC';
  v_to := (p_to + 1)::timestamp at time zone 'UTC';
  return jsonb_build_object(
    'members', (select count(*) from public.profiles p where p.onboarded_at is not null and p.status in ('active', 'restricted') and (p_college is null or p.college_id = p_college)),
    'new_members', (select count(*) from public.profiles p where p.onboarded_at is not null and p.created_at >= v_from and p.created_at < v_to and (p_college is null or p.college_id = p_college)),
    'verified_members', (select count(*) from public.profiles p where p.verification_status = 'verified' and p.status in ('active', 'restricted') and (p_college is null or p.college_id = p_college)),
    'suspended_members', (select count(*) from public.profiles p where p.status in ('suspended', 'restricted') and (p_college is null or p.college_id = p_college)),
    'active_members', (select count(distinct s.uid) from (
        select po.author_id uid from public.posts po where po.created_at >= v_from and po.created_at < v_to and (p_college is null or po.college_id = p_college)
        union select c.author_id from public.comments c join public.posts po on po.id = c.post_id where c.created_at >= v_from and c.created_at < v_to and (p_college is null or po.college_id = p_college)
        union select m.sender_id from public.messages m join public.profiles pr on pr.id = m.sender_id where m.created_at >= v_from and m.created_at < v_to and (p_college is null or pr.college_id = p_college)
      ) s where s.uid is not null),
    'posts_total', (select count(*) from public.posts po where po.status = 'published' and (p_college is null or po.college_id = p_college)),
    'posts_period', (select count(*) from public.posts po where po.status = 'published' and po.created_at >= v_from and po.created_at < v_to and (p_college is null or po.college_id = p_college)),
    'comments_period', (select count(*) from public.comments c join public.posts po on po.id = c.post_id where c.status = 'published' and c.created_at >= v_from and c.created_at < v_to and (p_college is null or po.college_id = p_college)),
    'messages_period', (select count(*) from public.messages m join public.profiles pr on pr.id = m.sender_id where m.created_at >= v_from and m.created_at < v_to and (p_college is null or pr.college_id = p_college)),
    'projects_total', (select count(*) from public.projects pj where pj.deleted_at is null and (p_college is null or pj.college_id = p_college)),
    'projects_period', (select count(*) from public.projects pj where pj.deleted_at is null and pj.created_at >= v_from and pj.created_at < v_to and (p_college is null or pj.college_id = p_college)),
    'events_period', (select count(*) from public.events e where e.deleted_at is null and e.created_at >= v_from and e.created_at < v_to and (p_college is null or e.college_id = p_college)),
    'events_upcoming', (select count(*) from public.events e where e.deleted_at is null and e.status = 'published' and e.starts_at >= now() and (p_college is null or e.college_id = p_college)),
    'communities_total', (select count(*) from public.communities co where co.deleted_at is null and (p_college is null or co.college_id = p_college)),
    'connections_period', (select count(*) from public.connections cn join public.profiles pr on pr.id = cn.user_a where cn.created_at >= v_from and cn.created_at < v_to and (p_college is null or pr.college_id = p_college)),
    'reports_open', (select count(*) from public.reports r where r.status in ('open', 'in_review') and (p_college is null or r.college_id = p_college)),
    'reports_period', (select count(*) from public.reports r where r.created_at >= v_from and r.created_at < v_to and (p_college is null or r.college_id = p_college)),
    'reports_resolved_period', (select count(*) from public.reports r where r.resolved_at >= v_from and r.resolved_at < v_to and (p_college is null or r.college_id = p_college)),
    'appeals_pending', (select count(*) from public.appeals a where a.status = 'pending' and (p_college is null or a.college_id = p_college)),
    'verifications_pending', (select count(*) from public.college_verifications v where v.status in ('pending', 'needs_info') and (p_college is null or v.college_id = p_college)),
    'deletions_pending', (select count(*) from public.account_deletion_requests d join public.profiles pr on pr.id = d.user_id where d.status = 'pending' and (p_college is null or pr.college_id = p_college)),
    'posts_by_category', (select coalesce(jsonb_object_agg(k, n), '{}') from (select po.category k, count(*) n from public.posts po where po.status = 'published' and po.created_at >= v_from and po.created_at < v_to and (p_college is null or po.college_id = p_college) group by 1) s),
    'members_by_type', (select coalesce(jsonb_object_agg(k, n), '{}') from (select coalesce(p.account_type, 'unstated') k, count(*) n from public.profiles p where p.onboarded_at is not null and p.status in ('active', 'restricted') and (p_college is null or p.college_id = p_college) group by 1) s),
    'reports_by_category', (select coalesce(jsonb_object_agg(k, n), '{}') from (select r.category k, count(*) n from public.reports r where r.created_at >= v_from and r.created_at < v_to and (p_college is null or r.college_id = p_college) group by 1) s),
    'top_colleges', case when p_college is null then (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'members', s.n) order by s.n desc), '[]') from (
        select c.name, count(*) n from public.profiles p join public.colleges c on c.id = p.college_id where p.onboarded_at is not null and p.status in ('active', 'restricted') group by c.name order by n desc limit 8) s) else '[]'::jsonb end
  );
end; $function$;

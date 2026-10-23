-- 0057: report a whole community to the platform team (split from 0055 because 0055 was already applied to the hosted database
-- without it; everything is create-or-replace, so it is safe to run on a database that has it).
-- ═══════════════ 12. Reporting a whole community to the platform team ═══════════════
-- Lands in the same queue as every other report (Admin → Reports), scoped by the community's college like the rest. For a
-- problem with the community itself (impersonation, scams, harmful purpose); a problem with one message goes to its moderators.
create or replace function public.report_community(p_community uuid, p_category text, p_details text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); c public.communities%rowtype; v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.is_member() then raise exception 'account_restricted' using errcode = '42501'; end if;
  select * into c from public.communities where id = p_community and deleted_at is null;
  if not found or not public.can_view_community(c.id, c.college_id, c.visibility, c.deleted_at) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_category not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'misinformation', 'impersonation', 'plagiarism', 'self_harm', 'privacy', 'other') then raise exception 'invalid_category' using errcode = '22023'; end if;
  select id into v_id from public.reports where reporter_id = v_me and target_type = 'community' and target_id = p_community and status in ('open', 'in_review');
  if v_id is not null then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if (select count(*) from public.reports where reporter_id = v_me and created_at > now() - interval '1 hour') >= 10 then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into public.reports (reporter_id, target_type, target_id, target_owner_id, college_id, category, details, severity, snapshot)
  values (v_me, 'community', c.id, c.created_by, c.college_id, p_category, nullif(btrim(coalesce(p_details, '')), ''),
          case when p_category in ('violence', 'self_harm', 'hate') then 'high' when p_category in ('harassment', 'sexual', 'impersonation') then 'medium' else 'low' end,
          jsonb_build_object('slug', c.slug, 'name', c.name, 'description', left(coalesce(c.description, ''), 300), 'visibility', c.visibility, 'member_count', c.member_count))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end; $$;
revoke execute on function public.report_community(uuid, text, text) from public, anon;
grant execute on function public.report_community(uuid, text, text) to authenticated;

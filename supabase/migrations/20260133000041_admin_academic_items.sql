-- 0041: Administration of departments and courses (the ones colleges define and the ones members add).
-- Moderators and global administrators can find them, rename them, hide them from the pickers, or remove them. A hidden item
-- stays on the profiles that already use it; removing one clears it from those profiles (the profile just loses that line).

create or replace function public._academics_admin() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not (public.has_permission('colleges.moderate', null) or public.has_permission('colleges.manage', null)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public.admin_list_academic_items(
  p_kind text default null, p_status text default null, p_q text default null, p_college uuid default null, p_limit integer default 50, p_offset integer default 0
) returns table (kind text, id uuid, name text, college_id uuid, college_name text, department_name text, is_community boolean, is_active boolean, added_by text, members bigint, created_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._academics_admin();
  return query
    with items as (
      select 'department'::text k, d.id, d.name, d.college_id, null::text dept, d.is_community, d.is_active, d.created_by, d.created_at,
             (select count(distinct e.user_id) from public.profile_education e where e.department_id = d.id) members
        from public.departments d
      union all
      select 'program', a.id, a.name, a.college_id, dd.name, a.is_community, a.is_active, a.created_by, a.created_at,
             (select count(distinct e.user_id) from public.profile_education e where e.program_id = a.id)
        from public.academic_programs a left join public.departments dd on dd.id = a.department_id)
    select i.k, i.id, i.name, i.college_id, c.name, i.dept, i.is_community, i.is_active, p.username, i.members, i.created_at, count(*) over ()
    from items i
    join public.colleges c on c.id = i.college_id
    left join public.profiles p on p.id = i.created_by
    where (p_kind is null or i.k = p_kind)
      and (p_college is null or i.college_id = p_college)
      and (p_status is null or (p_status = 'community' and i.is_community) or (p_status = 'listed' and not i.is_community) or (p_status = 'hidden' and not i.is_active))
      and (p_q is null or i.name ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%' or c.name ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%')
    order by i.created_at desc, i.name
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_set_academic_item(p_kind text, p_id uuid, p_name text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._academics_admin(); v_name text := public._clean_academic_name(p_name); n int;
begin
  if p_kind = 'department' then
    update public.departments set name = v_name, is_active = coalesce(p_active, is_active) where id = p_id;
  elsif p_kind = 'program' then
    update public.academic_programs set name = v_name, is_active = coalesce(p_active, is_active) where id = p_id;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.write_audit_log(v_actor, 'academics.saved', p_kind, p_id::text, null, jsonb_build_object('name', v_name, 'active', p_active));
exception when unique_violation then
  raise exception 'duplicate_item' using errcode = '23505';
end $$;

create or replace function public.admin_delete_academic_item(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._academics_admin(); n int;
begin
  if p_kind = 'department' then
    delete from public.departments where id = p_id;
  elsif p_kind = 'program' then
    delete from public.academic_programs where id = p_id;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.write_audit_log(v_actor, 'academics.deleted', p_kind, p_id::text, null, '{}'::jsonb);
end $$;

revoke execute on function public._academics_admin() from public, anon, authenticated;
revoke execute on function public.admin_list_academic_items(text, text, text, uuid, integer, integer), public.admin_set_academic_item(text, uuid, text, boolean),
  public.admin_delete_academic_item(text, uuid) from public, anon;
grant execute on function public.admin_list_academic_items(text, text, text, uuid, integer, integer), public.admin_set_academic_item(text, uuid, text, boolean),
  public.admin_delete_academic_item(text, uuid) to authenticated;

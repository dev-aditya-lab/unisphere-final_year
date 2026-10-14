-- 0019: "My college" content needs a college.
--
-- With open registration a member may have no college. Content shared with "my college" would then be visible to
-- nobody but its author, and silently widening it to everyone would be a privacy surprise. So the database refuses
-- it with a clear error; the app offers "All members" (or asks the member to add their college) instead.
-- Triggers are named so they fire after the ones that copy the author's college onto the row.

create or replace function public.require_college_for_college_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'college' and new.college_id is null then
    raise exception 'college_required' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger trg_zz_require_college before insert or update of visibility on public.posts
  for each row execute function public.require_college_for_college_visibility();
create trigger trg_zz_require_college before insert or update of visibility on public.projects
  for each row execute function public.require_college_for_college_visibility();
create trigger trg_zz_require_college before insert or update of visibility on public.events
  for each row execute function public.require_college_for_college_visibility();
create trigger trg_zz_require_college before insert or update of visibility on public.opportunities
  for each row execute function public.require_college_for_college_visibility();
create trigger trg_zz_require_college before insert or update of visibility on public.communities
  for each row execute function public.require_college_for_college_visibility();

-- Catch-up for databases that applied an earlier version of migrations 0068, 0070 and 0072.
--
-- Everything below is "create or replace" / "if not exists", so it is safe on a database that already has it. It restores:
--   * from 0068: the member lookup (academy_find_user), the coupon username list and the public showcase;
--   * from 0070: the final timetable row check;
--   * from 0072: the functions the Google sync writes back with (done, cleared, fail, retry, tombstones_take), the meet_url column
--     and the "disconnect" function with an explicit WHERE;
--   * from 0074: the privilege rules, applied again now that those functions exist.

-- ── from 0068 ──────────────────────────────────────────────────────────────
-- Find a member by their exact username, for the places staff name a person (add a mentor, enrol someone, restrict a coupon).
-- Needs one of the Academy permissions that does that job; returns only the name and username.
create or replace function public.academy_find_user(p_username text)
returns table (id uuid, full_name text, username text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('academy.students.manage', null) or public.has_permission('academy.courses.manage', null)
          or public.has_permission('academy.coupons.manage', null) or public.has_permission('academy.certificates.issue', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select p.id, p.full_name, p.username from public.profiles p where p.username = lower(btrim(p_username)) and p.status = 'active';
end;
$$;
grant execute on function public.academy_find_user(text) to authenticated;

-- Projects students chose to share, for the Academy home page. Only certificates that are issued, whose holder switched on
-- "share my project", and that have a project link. Nothing else about the holder is returned.
create or replace function public.academy_public_showcase(p_limit integer default 6)
returns table (certificate_id text, recipient_name text, course_title text, project_title text, project_url text, issue_date text)
language sql stable security definer set search_path = '' as $$
  select c.certificate_id, c.snapshot ->> 'recipient_name', c.snapshot ->> 'course_title', c.snapshot ->> 'project_title', c.snapshot ->> 'project_url', c.snapshot ->> 'issue_date'
  from public.academy_certificates c
  join public.academy_profiles p on p.user_id = c.user_id
  where c.status = 'issued' and not c.name_withdrawn and p.share_project
    and nullif(c.snapshot ->> 'project_title', '') is not null and (c.snapshot ->> 'project_url') ~ '^https://'
  order by c.issued_at desc
  limit least(greatest(p_limit, 1), 12);
$$;
grant execute on function public.academy_public_showcase(integer) to anon, authenticated, service_role;

-- The usernames a coupon is restricted to, so the edit form can show them (and not silently drop the restriction on save).
create or replace function public.academy_coupon_usernames(p_coupon uuid)
returns table (username text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('academy.coupons.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select p.username from public.academy_coupon_users u join public.profiles p on p.id = u.user_id where u.coupon_id = p_coupon order by p.username;
end;
$$;
grant execute on function public.academy_coupon_usernames(uuid) to authenticated;

-- ── from 0070 ──────────────────────────────────────────────────────────────
create or replace function public._academy_timetable_valid(p_rows jsonb) returns boolean
language sql immutable set search_path = '' as $$
  -- A row with a missing field makes a comparison NULL; bool_and would skip it, so every row is forced to true/false first.
  select coalesce(bool_and(coalesce(
    jsonb_typeof(r) = 'object'
    and (r ->> 'day') in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
    and (r ->> 'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and (r ->> 'end') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and (r ->> 'end') > (r ->> 'start')
    and char_length(coalesce(r ->> 'topic', '')) <= 120,
  false)), true)
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r;
$$;

-- ── from 0072 ──────────────────────────────────────────────────────────────
-- ── What the worker writes back (service role only) ────────────────────────
alter table public.academy_live_google add column if not exists meet_url text check (meet_url is null or (meet_url ~ '^https://[^\s]+$' and char_length(meet_url) <= 500));

-- The event now exists on Google with exactly these guests. The hash is worked out here, from the same list, with the same ordering
-- the queue uses, so "has the list changed?" can never disagree with itself.
create or replace function public.academy_google_done(p_session uuid, p_event text, p_url text, p_emails text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_hash text := (select md5(coalesce(string_agg(e, ',' order by e), '')) from unnest(coalesce(p_emails, '{}')) e);
begin
  update public.academy_live_google set event_id = p_event, sync = 'synced', error = null, attempts = 0, attendees_hash = v_hash,
         attendee_count = coalesce(cardinality(p_emails), 0), meet_url = coalesce(p_url, meet_url), synced_at = now(), updated_at = now()
   where session_id = p_session;
  if p_url is not null then
    insert into public.academy_live_session_links(session_id, meeting_url) values (p_session, p_url)
    on conflict (session_id) do update set meeting_url = excluded.meeting_url;
  end if;
end;
$$;
revoke execute on function public.academy_google_done(uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.academy_google_done(uuid, text, text, text[]) to service_role;

-- The event was removed from Google (session cancelled, or automatic Meet switched off). Forget it, and forget the link if it was ours.
create or replace function public.academy_google_cleared(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select meet_url into v_url from public.academy_live_google where session_id = p_session;
  if v_url is not null then update public.academy_live_session_links set meeting_url = null where session_id = p_session and meeting_url = v_url; end if;
  update public.academy_live_google set event_id = null, meet_url = null, sync = 'synced', error = null, attempts = 0, attendees_hash = null, attendee_count = null, synced_at = now(), updated_at = now()
   where session_id = p_session;
end;
$$;
revoke execute on function public.academy_google_cleared(uuid) from public, anon, authenticated;
grant execute on function public.academy_google_cleared(uuid) to service_role;

-- A try failed. Retry later with growing gaps; a permanent problem (not connected, too many guests) stops straight away.
create or replace function public.academy_google_fail(p_session uuid, p_error text, p_permanent boolean default false)
returns void language sql security definer set search_path = '' as $$
  update public.academy_live_google set
    attempts = attempts + 1,
    error = left(p_error, 300),
    sync = case when p_permanent or attempts + 1 >= 5 then 'failed' else 'pending' end,
    next_try = now() + make_interval(mins => least(60, 2 * (attempts + 1) * (attempts + 1))),
    updated_at = now()
  where session_id = p_session;
$$;
revoke execute on function public.academy_google_fail(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.academy_google_fail(uuid, text, boolean) to service_role;

-- Staff pressed "Try again".
create or replace function public.academy_google_retry(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('academy.live.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.academy_live_google(session_id, sync, attempts, next_try, error) values (p_session, 'pending', 0, now(), null)
  on conflict (session_id) do update set sync = 'pending', attempts = 0, next_try = now(), error = null, updated_at = now();
end;
$$;
grant execute on function public.academy_google_retry(uuid) to authenticated;

create or replace function public.academy_google_tombstones_take(p_limit integer default 20)
returns table(event_id text) language sql security definer set search_path = '' as $$
  delete from public.academy_google_tombstones where event_id in (select t.event_id from public.academy_google_tombstones t order by created_at limit greatest(1, least(p_limit, 50)))
  returning event_id;
$$;
revoke execute on function public.academy_google_tombstones_take(integer) from public, anon, authenticated;
grant execute on function public.academy_google_tombstones_take(integer) to service_role;

create or replace function public.academy_google_clear(p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.academy_google_connection where id;
  perform public.write_audit_log(p_by, 'academy.google.disconnected', 'academy_google', 'connection', null, '{}'::jsonb);
end;
$$;
revoke execute on function public.academy_google_clear(uuid) from public, anon, authenticated;
grant execute on function public.academy_google_clear(uuid) to service_role;

-- ── from 0074: who may call what ───────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'academy\_%' or p.proname like '\_academy\_%')
       and p.proname not in ('academy_public_settings', 'academy_public_showcase', 'academy_quote', 'academy_catalog_prices',
                             'academy_verify_certificate', 'academy_is_staff', 'academy_has_access', 'academy_can_open_lesson')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end;
$$;
grant execute on function public._academy_timetable_valid(jsonb) to authenticated, service_role;
-- the public showcase is meant for visitors
grant execute on function public.academy_public_showcase(integer) to anon, authenticated, service_role;
-- the PostgREST API reads its function list at start; tell it to look again
notify pgrst, 'reload schema';

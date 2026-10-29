-- UniSphere Academy, phase 5: live classes on Google Calendar and Google Meet.
--
-- One Google account (the owner's Gmail) is connected to the Academy. For a live session that asks for it, the server creates a
-- Calendar event with a Meet link and invites the enrolled students' email addresses. Google then sends the invitations; invited
-- people join the Meet directly, anyone else has to ask to be let in.
--
-- Security notes:
--   * The refresh token is encrypted by the application before it reaches the database (AES-256-GCM, key from APP_SECRET), and the
--     table has no API grants and no policies: no browser session can read it, only the server's service role.
--   * Student email addresses leave the database only through _academy_session_attendees, only for sessions that asked for Google
--     invitations, only for students who hold valid access to that class.
--   * Everything the worker writes lives in its own table, so the audit log of live sessions shows what staff changed, not retries.

-- ── The connection (at most one row) ───────────────────────────────────────
create table public.academy_google_connection (
  id boolean primary key default true check (id),
  email text not null check (char_length(email) <= 254),
  refresh_token_enc text not null check (char_length(refresh_token_enc) <= 4000),
  scopes text not null check (char_length(scopes) <= 1000),
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.academy_google_connection enable row level security;
revoke all on public.academy_google_connection from anon, authenticated;

-- What an administrator may see: who is connected and whether it still works. Never the token.
create or replace function public.academy_google_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.academy_google_connection%rowtype;
begin
  if not (public.has_permission('academy.settings.manage', null) or public.has_permission('academy.live.manage', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v from public.academy_google_connection;
  if not found then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object('connected', v.status = 'connected', 'email', v.email, 'status', v.status, 'connected_at', v.connected_at, 'error', v.last_error);
end;
$$;
grant execute on function public.academy_google_status() to authenticated;

create or replace function public.academy_google_save(p_email text, p_enc text, p_scopes text, p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.academy_google_connection(id, email, refresh_token_enc, scopes, status, last_error, connected_by, connected_at)
  values (true, left(p_email, 254), p_enc, left(p_scopes, 1000), 'connected', null, p_by, now())
  on conflict (id) do update set email = excluded.email, refresh_token_enc = excluded.refresh_token_enc, scopes = excluded.scopes,
    status = 'connected', last_error = null, connected_by = excluded.connected_by, connected_at = now(), updated_at = now();
  perform public.write_audit_log(p_by, 'academy.google.connected', 'academy_google', 'connection', null, jsonb_build_object('email', left(p_email, 254)));
end;
$$;
revoke execute on function public.academy_google_save(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.academy_google_save(text, text, text, uuid) to service_role;

create or replace function public.academy_google_get()
returns table(email text, refresh_token_enc text, status text) language sql stable security definer set search_path = '' as $$
  select c.email, c.refresh_token_enc, c.status from public.academy_google_connection c;
$$;
revoke execute on function public.academy_google_get() from public, anon, authenticated;
grant execute on function public.academy_google_get() to service_role;

create or replace function public.academy_google_mark(p_status text, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.academy_google_connection set status = p_status, last_error = left(p_error, 300), updated_at = now() where p_status in ('connected', 'needs_reconnect');
$$;
revoke execute on function public.academy_google_mark(text, text) from public, anon, authenticated;
grant execute on function public.academy_google_mark(text, text) to service_role;

create or replace function public.academy_google_clear(p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.academy_google_connection where id;
  perform public.write_audit_log(p_by, 'academy.google.disconnected', 'academy_google', 'connection', null, '{}'::jsonb);
end;
$$;
revoke execute on function public.academy_google_clear(uuid) from public, anon, authenticated;
grant execute on function public.academy_google_clear(uuid) to service_role;

-- ── Live sessions ──────────────────────────────────────────────────────────
alter table public.academy_live_sessions add column auto_meet boolean not null default false;

-- Where each session stands with Google. Written only by the server.
create table public.academy_live_google (
  session_id uuid primary key references public.academy_live_sessions(id) on delete cascade,
  event_id text check (event_id is null or char_length(event_id) <= 200),
  sync text not null default 'pending' check (sync in ('pending', 'synced', 'failed')),
  error text check (error is null or char_length(error) <= 300),
  attendees_hash text,
  attendee_count integer,
  attempts integer not null default 0,
  next_try timestamptz not null default now(),
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);
create index academy_live_google_due_idx on public.academy_live_google(next_try) where sync = 'pending';
alter table public.academy_live_google enable row level security;
-- Staff may read the state (to show "invitations sent to 23 students" or the error); nobody can write through the API.
grant select on public.academy_live_google to authenticated;
create policy academy_live_google_read on public.academy_live_google for select to authenticated using (public.has_permission('academy.live.manage', null));

-- A deleted session must not leave its Google event behind: the event id waits here for the worker.
create table public.academy_google_tombstones (
  event_id text primary key check (char_length(event_id) <= 200),
  created_at timestamptz not null default now()
);
alter table public.academy_google_tombstones enable row level security;
revoke all on public.academy_google_tombstones from anon, authenticated;

-- Staff changed a session: mark it for the worker. Only the things Google shows matter.
create or replace function public.academy_live_google_mark() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.academy_google_tombstones(event_id)
    select g.event_id from public.academy_live_google g where g.session_id = old.id and g.event_id is not null
    on conflict do nothing;
    return old;
  end if;
  if tg_op = 'UPDATE' and not (
       new.auto_meet is distinct from old.auto_meet or new.title is distinct from old.title or new.description is distinct from old.description
    or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.status is distinct from old.status
    or new.course_id is distinct from old.course_id or new.cohort_id is distinct from old.cohort_id) then
    return new;
  end if;
  if new.auto_meet or exists (select 1 from public.academy_live_google g where g.session_id = new.id and g.event_id is not null) then
    insert into public.academy_live_google(session_id, sync, attempts, next_try, error)
    values (new.id, 'pending', 0, now(), null)
    on conflict (session_id) do update set sync = 'pending', attempts = 0, next_try = now(), error = null, updated_at = now();
  end if;
  return new;
end;
$$;
create trigger trg_academy_live_google_mark after insert or update on public.academy_live_sessions for each row execute function public.academy_live_google_mark();
create trigger trg_academy_live_google_tomb before delete on public.academy_live_sessions for each row execute function public.academy_live_google_mark();

-- Who is invited: students holding valid access to the class (and in its cohort, if it is for one), with a confirmed email and an
-- active account. Capped at Google's limit of 200 guests per event.
create or replace function public._academy_session_attendees(p_session uuid)
returns table(email text) language sql stable security definer set search_path = '' as $$
  select lower(u.email)::text
    from public.academy_live_sessions s
    join public.academy_enrollments e on e.course_id = s.course_id and e.status in ('active', 'completed')
         and (e.access_expires_at is null or e.access_expires_at > now()) and (s.cohort_id is null or e.cohort_id = s.cohort_id)
    join auth.users u on u.id = e.user_id and u.email is not null and u.email_confirmed_at is not null
    join public.profiles p on p.id = e.user_id and p.status in ('active', 'restricted')
   where s.id = p_session
   group by lower(u.email)
   order by lower(u.email)
   limit 201;
$$;
revoke execute on function public._academy_session_attendees(uuid) from public, anon, authenticated;
grant execute on function public._academy_session_attendees(uuid) to service_role;

-- The worker's queue. Takes due rows (a lease of 5 minutes so two workers never take the same one) and first re-queues synced,
-- upcoming sessions whose list of invited students has changed (someone enrolled or was refunded).
create or replace function public.academy_google_claim(p_limit integer default 10)
returns table(session_id uuid) language plpgsql security definer set search_path = '' as $$
begin
  update public.academy_live_google g set sync = 'pending', attempts = 0, next_try = now(), updated_at = now()
   from public.academy_live_sessions s
   where s.id = g.session_id and s.auto_meet and s.status = 'scheduled' and s.starts_at > now() and s.starts_at < now() + interval '45 days'
     and g.sync = 'synced' and g.synced_at < now() - interval '2 minutes'
     and g.attendees_hash is distinct from (select md5(coalesce(string_agg(a.email, ',' order by a.email), '')) from public._academy_session_attendees(s.id) a);
  return query
    with due as (
      select g.session_id from public.academy_live_google g
       where g.sync = 'pending' and g.next_try <= now()
       order by g.next_try limit greatest(1, least(p_limit, 50))
       for update skip locked
    )
    update public.academy_live_google g set next_try = now() + interval '5 minutes', updated_at = now()
      from due where g.session_id = due.session_id
    returning g.session_id;
end;
$$;
revoke execute on function public.academy_google_claim(integer) from public, anon, authenticated;
grant execute on function public.academy_google_claim(integer) to service_role;

-- ── What the worker writes back (service role only) ────────────────────────
alter table public.academy_live_google add column meet_url text check (meet_url is null or (meet_url ~ '^https://[^\s]+$' and char_length(meet_url) <= 500));

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

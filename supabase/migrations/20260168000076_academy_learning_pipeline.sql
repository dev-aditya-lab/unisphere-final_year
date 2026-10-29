-- UniSphere Academy: the learning pipeline.
--
-- Until now a person had to do most of the following by hand, and the people who teach were told nothing:
--   * a live class stayed "scheduled" until someone changed it, so a class that had started appeared nowhere;
--   * students were reminded about a class but not told when it was scheduled, moved, cancelled or starting;
--   * instructors and mentors received no notification at all and had nothing to look at;
--   * certificates were issued only when an administrator pressed a button, and a student could not see what was missing.
-- This migration makes those steps happen by themselves and gives the data the new pages need.

-- ── Settings ───────────────────────────────────────────────────────────────
insert into public.academy_settings(key, value, public_read, description) values
  ('certificate_auto_issue', 'true', false, 'Issue a certificate by itself as soon as a student meets the course requirements (and, where the course asks for it, has been approved). Turn off to issue every certificate by hand.')
on conflict (key) do nothing;

-- ── Who is in a class: students with access, the instructor and the course mentors ──
create or replace function public._academy_session_audience(p_session uuid)
returns table(user_id uuid, role text) language sql stable security definer set search_path = '' as $$
  select e.user_id, 'student'::text
    from public.academy_live_sessions s
    join public.academy_enrollments e on e.course_id = s.course_id and e.status in ('active', 'completed')
         and (e.access_expires_at is null or e.access_expires_at > now()) and (s.cohort_id is null or e.cohort_id = s.cohort_id)
   where s.id = p_session
  union
  select s.instructor_id, 'instructor'::text from public.academy_live_sessions s where s.id = p_session and s.instructor_id is not null
  union
  select m.user_id, 'mentor'::text from public.academy_live_sessions s join public.academy_course_mentors m on m.course_id = s.course_id where s.id = p_session;
$$;
revoke execute on function public._academy_session_audience(uuid) from public, anon, authenticated;
grant execute on function public._academy_session_audience(uuid) to service_role;

-- ── Tell everyone when a class is scheduled, moved or cancelled ────────────
create or replace function public.academy_live_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_event text; r record; v_title text;
begin
  if new.ends_at < now() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' then return new; end if;
    v_event := 'scheduled';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    v_event := 'cancelled';
  elsif new.status = 'scheduled' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at) then
    v_event := 'rescheduled';
  else
    return new;
  end if;
  select title into v_title from public.academy_courses where id = new.course_id;
  for r in select a.user_id, a.role from public._academy_session_audience(new.id) a loop
    perform public.notify(r.user_id, 'academy_live_scheduled', (select auth.uid()), 'academy_live_session', new.id,
      jsonb_build_object('event', v_event, 'title', new.title, 'course_id', new.course_id, 'course_title', v_title, 'starts_at', new.starts_at, 'role', r.role),
      'acad-sess:' || new.id::text || ':' || v_event || ':' || extract(epoch from new.starts_at)::bigint::text);
  end loop;
  return new;
end;
$$;
revoke execute on function public.academy_live_notify() from public, anon, authenticated;
create trigger trg_academy_live_notify after insert or update on public.academy_live_sessions for each row execute function public.academy_live_notify();

-- The Google sync only cares about a class that is cancelled or edited, not one that simply began or ended.
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
    or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
    or (new.status = 'cancelled') is distinct from (old.status = 'cancelled')
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

-- ── Classes move through their stages by themselves ────────────────────────
-- scheduled -> live (at the start time) -> completed (at the end time). Run by the worker every few minutes.
create or replace function public.academy_advance_sessions()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_started integer := 0; v_ended integer; v_remind integer := 0; v_title text;
begin
  for r in
    update public.academy_live_sessions set status = 'live'
     where status = 'scheduled' and starts_at <= now() and ends_at > now()
    returning id, title, course_id
  loop
    v_started := v_started + 1;
    select title into v_title from public.academy_courses where id = r.course_id;
    perform public.notify(a.user_id, 'academy_live_started', null, 'academy_live_session', r.id,
      jsonb_build_object('title', r.title, 'course_id', r.course_id, 'course_title', v_title, 'role', a.role), 'acad-live-now:' || r.id::text)
      from public._academy_session_audience(r.id) a;
  end loop;

  update public.academy_live_sessions set status = 'completed' where status in ('scheduled', 'live') and ends_at <= now();
  get diagnostics v_ended = row_count;

  -- The people teaching are reminded an hour ahead (students get theirs from academy_send_reminders).
  for r in
    select s.id, s.title, s.starts_at, s.course_id, a.user_id, a.role
      from public.academy_live_sessions s, lateral public._academy_session_audience(s.id) a
     where s.status = 'scheduled' and s.starts_at > now() and s.starts_at <= now() + interval '1 hour' and a.role <> 'student'
  loop
    insert into public.academy_reminders_sent(kind, entity_id, user_id) values ('teach:1h', r.id, r.user_id) on conflict do nothing;
    if found then
      perform public.notify(r.user_id, 'academy_live_reminder', null, 'academy_live_session', r.id,
        jsonb_build_object('course_id', r.course_id, 'title', r.title, 'starts_at', r.starts_at, 'hours', 1, 'role', r.role), 'acad-teach:' || r.id::text);
      v_remind := v_remind + 1;
    end if;
  end loop;
  return jsonb_build_object('started', v_started, 'ended', v_ended, 'instructor_reminders', v_remind);
end;
$$;
revoke execute on function public.academy_advance_sessions() from public, anon, authenticated;
grant execute on function public.academy_advance_sessions() to service_role;

-- ── Who joined ─────────────────────────────────────────────────────────────
create table public.academy_live_attendance (
  session_id uuid not null references public.academy_live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  joins integer not null default 1,
  primary key (session_id, user_id)
);
create index academy_live_attendance_user_idx on public.academy_live_attendance(user_id);
alter table public.academy_live_attendance enable row level security;
grant select on public.academy_live_attendance to authenticated;
-- A student sees their own; the people who run the class see everyone's.
create policy academy_live_attendance_read on public.academy_live_attendance for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('academy.live.manage', null)
         or public.academy_can_view_students((select s.course_id from public.academy_live_sessions s where s.id = session_id)));

-- The "Join" button. Counts the join (attendance as far as UniSphere can know: it cannot see inside Google Meet) and returns the link.
create or replace function public.academy_join_session(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_access jsonb;
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_access := public.academy_session_access(p_session);
  if v_access is null then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if v_access ->> 'meeting_url' is null then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  insert into public.academy_live_attendance(session_id, user_id) values (p_session, v_user)
  on conflict (session_id, user_id) do update set last_joined_at = now(), joins = public.academy_live_attendance.joins + 1;
  return jsonb_build_object('ok', true, 'url', v_access ->> 'meeting_url');
end;
$$;
grant execute on function public.academy_join_session(uuid) to authenticated;

-- ── The people who teach are told what concerns them ───────────────────────
create or replace function public.academy_notify_mentor_assigned() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  select title into v_title from public.academy_courses where id = new.course_id;
  perform public.notify(new.user_id, 'academy_mentor_assigned', (select auth.uid()), 'academy_course', new.course_id,
    jsonb_build_object('course_id', new.course_id, 'title', v_title, 'role', new.role), 'acad-assigned:' || new.course_id::text || ':' || new.user_id::text);
  return new;
end;
$$;
revoke execute on function public.academy_notify_mentor_assigned() from public, anon, authenticated;
create trigger trg_academy_notify_mentor_assigned after insert on public.academy_course_mentors for each row execute function public.academy_notify_mentor_assigned();

create or replace function public.academy_notify_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_course text; v_name text; r record;
begin
  if new.status <> 'submitted' then return new; end if;
  select a.title, c.title into v_title, v_course from public.academy_assignments a join public.academy_courses c on c.id = a.course_id where a.id = new.assignment_id;
  select full_name into v_name from public.profiles where id = new.user_id;
  for r in select m.user_id from public.academy_course_mentors m where m.course_id = new.course_id loop
    perform public.notify(r.user_id, 'academy_submission_received', new.user_id, 'academy_submission', new.id,
      jsonb_build_object('course_id', new.course_id, 'assignment', v_title, 'course_title', v_course, 'student', v_name, 'attempt', new.attempt), 'acad-subm:' || new.id::text);
  end loop;
  return new;
end;
$$;
revoke execute on function public.academy_notify_submission() from public, anon, authenticated;
create trigger trg_academy_notify_submission after insert on public.academy_submissions for each row execute function public.academy_notify_submission();

create or replace function public.academy_notify_enrolment_to_mentors() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_name text; r record;
begin
  if new.status <> 'active' then return new; end if;
  select title into v_title from public.academy_courses where id = new.course_id;
  select full_name into v_name from public.profiles where id = new.user_id;
  for r in select m.user_id from public.academy_course_mentors m where m.course_id = new.course_id loop
    perform public.notify(r.user_id, 'academy_student_enrolled', new.user_id, 'academy_course', new.course_id,
      jsonb_build_object('course_id', new.course_id, 'title', v_title, 'student', v_name), 'acad-enrol:' || new.id::text);
  end loop;
  return new;
end;
$$;
revoke execute on function public.academy_notify_enrolment_to_mentors() from public, anon, authenticated;
create trigger trg_academy_notify_enrolment_mentors after insert on public.academy_enrollments for each row execute function public.academy_notify_enrolment_to_mentors();

-- ── The instructor's dashboard ─────────────────────────────────────────────
-- Everything about the courses the caller teaches, counted from stored records. A person who teaches nothing gets nothing.
create or replace function public.academy_teaching_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_courses uuid[]; v_out jsonb;
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_courses from (
    select course_id as x from public.academy_course_mentors where user_id = v_user
    union select course_id from public.academy_live_sessions where instructor_id = v_user) t;
  if cardinality(v_courses) = 0 then return jsonb_build_object('teaches', false); end if;
  v_out := jsonb_build_object(
    'teaches', true,
    'courses', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'title', c.title, 'slug', c.slug, 'delivery_mode', c.delivery_mode, 'status', c.status,
        'students', (select count(*) from public.academy_enrollments e where e.course_id = c.id and e.status in ('active', 'completed')),
        'completed', (select count(*) from public.academy_enrollments e where e.course_id = c.id and e.status = 'completed'),
        'waiting_review', (select count(*) from public.academy_submissions s where s.course_id = c.id and s.status = 'submitted'),
        'next_class', (select s.starts_at from public.academy_live_sessions s where s.course_id = c.id and s.status in ('scheduled', 'live') and s.ends_at > now() order by s.starts_at limit 1)
      ) order by c.title) from public.academy_courses c where c.id = any (v_courses)), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'status', s.status, 'course_id', s.course_id, 'course_title', c.title,
        'expected', (select count(*) from public._academy_session_audience(s.id) a where a.role = 'student'),
        'joined', (select count(*) from public.academy_live_attendance a where a.session_id = s.id)
      ) order by s.starts_at) from public.academy_live_sessions s join public.academy_courses c on c.id = s.course_id
       where s.course_id = any (v_courses) and s.status in ('scheduled', 'live') and s.ends_at > now() and s.starts_at < now() + interval '30 days'), '[]'::jsonb),
    'recent_sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'course_title', c.title,
        'expected', (select count(*) from public._academy_session_audience(s.id) a where a.role = 'student'),
        'joined', (select count(*) from public.academy_live_attendance a where a.session_id = s.id)
      ) order by s.starts_at desc) from (select * from public.academy_live_sessions where course_id = any (v_courses) and status = 'completed' order by starts_at desc limit 5) s
       join public.academy_courses c on c.id = s.course_id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'assignment', a.title, 'course_title', c.title, 'course_id', s.course_id, 'student', p.full_name, 'submitted_at', s.submitted_at, 'late', s.is_late
      ) order by s.submitted_at) from (select * from public.academy_submissions where course_id = any (v_courses) and status = 'submitted' order by submitted_at limit 10) s
       join public.academy_assignments a on a.id = s.assignment_id join public.academy_courses c on c.id = s.course_id join public.profiles p on p.id = s.user_id), '[]'::jsonb),
    'new_students', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'course_title', c.title, 'enrolled_at', e.enrolled_at) order by e.enrolled_at desc)
       from (select * from public.academy_enrollments where course_id = any (v_courses) and status in ('active', 'completed') order by enrolled_at desc limit 8) e
       join public.academy_courses c on c.id = e.course_id join public.profiles p on p.id = e.user_id), '[]'::jsonb));
  return v_out;
end;
$$;
grant execute on function public.academy_teaching_overview() to authenticated;

-- ── Certificates ───────────────────────────────────────────────────────────
-- 1. What a student still needs for each certificate they are working towards.
create or replace function public.academy_my_certificate_progress()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'enrollment_id', e.id, 'course_id', c.id, 'code', c.code, 'title', c.title,
      'state', public._academy_completion_state(v_user, c.id),
      'approved', e.certificate_approved_at is not null,
      'consent', e.verify_consent_at is not null,
      'certificate', (select ce.status from public.academy_certificates ce where ce.enrollment_id = e.id and ce.replaces_id is null order by ce.created_at desc limit 1)
    ) order by e.enrolled_at desc)
    from public.academy_enrollments e join public.academy_courses c on c.id = e.course_id
    where e.user_id = v_user and e.status in ('active', 'completed') and (e.access_expires_at is null or e.access_expires_at > now())
      and not exists (select 1 from public.academy_certificates ce where ce.enrollment_id = e.id and ce.status = 'issued' and ce.replaces_id is null)), '[]'::jsonb);
end;
$$;
grant execute on function public.academy_my_certificate_progress() to authenticated;

-- 2. Issue by themselves: the same rules, with the server (no person) as the one asking. A browser session can never take this path,
--    because the check below only lets a caller with no user identity skip the permission, and only the service role has none.
do $$
declare v_def text; v_old constant text := 'if not public.has_permission(''academy.certificates.issue'', null) then raise exception ''forbidden'' using errcode = ''42501''; end if;';
begin
  v_def := pg_get_functiondef('public.academy_begin_certificate(uuid, uuid, text)'::regprocedure);
  if position(v_old in v_def) = 0 then
    if position('(select auth.uid()) is not null and not public.has_permission(''academy.certificates.issue''' in v_def) = 0 then
      raise exception 'academy_begin_certificate has an unexpected shape; not patched';
    end if;
  else
    execute replace(v_def, v_old, 'if (select auth.uid()) is not null and not public.has_permission(''academy.certificates.issue'', null) then raise exception ''forbidden'' using errcode = ''42501''; end if;');
  end if;
end;
$$;
revoke execute on function public.academy_begin_certificate(uuid, uuid, text) from public, anon;
grant execute on function public.academy_begin_certificate(uuid, uuid, text) to authenticated, service_role;

-- 3. Enrolments that qualify right now (the same test the administrator's "Issue all" uses), for the worker.
create or replace function public._academy_auto_issuable(p_limit integer default 10)
returns table(enrollment_id uuid) language sql stable security definer set search_path = '' as $$
  select e.id
    from public.academy_enrollments e
    join public.academy_courses c on c.id = e.course_id
   where e.status in ('active', 'completed') and e.verify_consent_at is not null
     and coalesce(public._academy_setting('certificate_auto_issue') = 'true'::jsonb, true)
     and not exists (select 1 from public.academy_certificates ce where ce.enrollment_id = e.id and ce.status in ('issued', 'pending', 'failed') and ce.replaces_id is null)
     and (not coalesce((c.certificate_criteria ->> 'manual_approval')::boolean, false) or e.certificate_approved_at is not null)
     and (public._academy_completion_state(e.user_id, e.course_id) ->> 'eligible')::boolean
   order by e.completed_at nulls last, e.enrolled_at
   limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public._academy_auto_issuable(integer) from public, anon, authenticated;
grant execute on function public._academy_auto_issuable(integer) to service_role;

-- A failed generation is retried by the worker a few times, then left for an administrator (it shows under Certificates).
-- Anything outside the visitors' list stays closed to them (see the function-privileges migration).
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'academy\_%' or p.proname like '\_academy\_%')
              and p.proname not in ('academy_public_settings', 'academy_public_showcase', 'academy_quote', 'academy_catalog_prices',
                                    'academy_verify_certificate', 'academy_is_staff', 'academy_has_access', 'academy_can_open_lesson')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end;
$$;
notify pgrst, 'reload schema';

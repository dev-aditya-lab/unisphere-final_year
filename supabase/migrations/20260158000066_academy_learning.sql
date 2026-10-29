-- 0066: UniSphere Academy, part 2 of 4: enrolments, progress, quizzes, assignments and grading, live classes, announcements,
-- reminders, and the notifications that go with them.
--
-- A student's learning data is only ever written by the functions below, which check who is asking and what they are allowed
-- to do. Students hold SELECT on their own rows and nothing else: they cannot enrol themselves, mark a graded item passed, or
-- change a score. See docs/ACADEMY.md.

-- ═══════════════ 1. Enrolments ═══════════════
create table public.academy_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete restrict,
  cohort_id uuid references public.academy_cohorts(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'expired', 'revoked', 'suspended', 'refunded')),
  source text not null check (source in ('free', 'paid', 'complimentary', 'scholarship')),
  order_id uuid,                                  -- the foreign key to academy_orders is added in 0067
  granted_by uuid references public.profiles(id) on delete set null,
  grant_reason text check (grant_reason is null or char_length(grant_reason) <= 300),
  -- The student agreed that their name and the course appear on the public certificate verification page.
  verify_consent_at timestamptz,
  enrolled_at timestamptz not null default now(),
  access_expires_at timestamptz,
  completed_at timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason) <= 300),
  -- Certificates that need a person's approval first (course criterion "manual_approval").
  certificate_approved_at timestamptz,
  certificate_approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live enrolment per student and course. An expired, revoked or refunded one does not block enrolling again.
create unique index academy_enrollments_live_idx on public.academy_enrollments(user_id, course_id) where status in ('active', 'completed', 'suspended');
create index academy_enrollments_course_idx on public.academy_enrollments(course_id, status);
create index academy_enrollments_user_idx on public.academy_enrollments(user_id, status);
create trigger trg_academy_enrollments_updated before update on public.academy_enrollments for each row execute function public.set_updated_at();
create trigger trg_academy_enrollments_audit after update or delete on public.academy_enrollments for each row execute function public.academy_audit('enrollment');

-- Is the caller a mentor assigned to this course? (Mentors see and grade only their own courses' students.)
create or replace function public.academy_is_course_mentor(p_course uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.academy_course_mentors cm join public.academy_mentors m on m.user_id = cm.user_id
    where cm.course_id = p_course and cm.user_id = (select auth.uid()) and m.active
  );
$$;
grant execute on function public.academy_is_course_mentor(uuid) to authenticated, service_role;

-- May the caller grade work in this course? Needs the grading permission AND to teach the course (or manage courses).
create or replace function public.academy_can_review(p_course uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('academy.assignments.review', null)
    and (public.has_permission('academy.courses.manage', null) or public.academy_is_course_mentor(p_course));
$$;
grant execute on function public.academy_can_review(uuid) to authenticated, service_role;

-- Who may see another person's learning rows for a course: staff who manage students or finances, support, and that course's mentors.
create or replace function public.academy_can_view_students(p_course uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('academy.students.view', null)
      or public.has_permission('academy.students.manage', null)
      or public.has_permission('academy.finance.view', null)
      or public.academy_is_course_mentor(p_course);
$$;
grant execute on function public.academy_can_view_students(uuid) to authenticated, service_role;

alter table public.academy_enrollments enable row level security;
grant select on public.academy_enrollments to authenticated;
create policy academy_enrollments_read on public.academy_enrollments for select to authenticated
  using (user_id = (select auth.uid()) or public.academy_can_view_students(course_id));

-- Seats left in a course (and a cohort). Unpaid orders that are still being held count, so the last seat cannot be sold twice.
-- Written in plpgsql: academy_orders is created in 0067.
create or replace function public._academy_seats_left(p_course uuid, p_cohort uuid, p_except_user uuid default null)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer;
  v_cap integer;
  v_used integer;
  v_cohort_used integer;
  v_left integer := null;
begin
  select enrollment_limit into v_limit from public.academy_courses where id = p_course;
  if v_limit is not null then
    select count(*) into v_used from public.academy_enrollments where course_id = p_course and status in ('active', 'completed', 'suspended');
    v_used := v_used + (select count(*) from public.academy_orders o where o.status = 'pending' and o.expires_at > now()
                          and o.user_id is distinct from p_except_user
                          and exists (select 1 from public.academy_order_items i where i.order_id = o.id and i.course_id = p_course));
    v_left := greatest(v_limit - v_used, 0);
  end if;
  if p_cohort is not null then
    select capacity into v_cap from public.academy_cohorts where id = p_cohort;
    if v_cap is not null then
      select count(*) into v_cohort_used from public.academy_enrollments where cohort_id = p_cohort and status in ('active', 'completed', 'suspended');
      v_cohort_used := v_cohort_used + (select count(*) from public.academy_orders o where o.status = 'pending' and o.expires_at > now()
                          and o.user_id is distinct from p_except_user
                          and exists (select 1 from public.academy_order_items i where i.order_id = o.id and i.cohort_id = p_cohort));
      v_left := least(coalesce(v_left, 2147483647), greatest(v_cap - v_cohort_used, 0));
    end if;
  end if;
  return v_left;     -- null = unlimited
end;
$$;
revoke execute on function public._academy_seats_left(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public._academy_seats_left(uuid, uuid, uuid) to service_role;

-- ═══════════════ 2. The student's own settings ═══════════════
create table public.academy_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- The name printed on certificates. Empty means the profile name.
  certificate_name text check (certificate_name is null or (char_length(certificate_name) between 2 and 80 and certificate_name !~ '[\x00-\x1f<>{}]')),
  -- Opt-ins for what a person who verifies a certificate may see beyond the name and the course.
  share_score boolean not null default false,
  share_project boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger trg_academy_profiles_updated before update on public.academy_profiles for each row execute function public.set_updated_at();
alter table public.academy_profiles enable row level security;
grant select, insert, update on public.academy_profiles to authenticated;
create policy academy_profiles_own on public.academy_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ═══════════════ 3. Progress ═══════════════
create table public.academy_lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index academy_lesson_progress_course_idx on public.academy_lesson_progress(course_id, user_id);
alter table public.academy_lesson_progress enable row level security;
grant select on public.academy_lesson_progress to authenticated;
create policy academy_lesson_progress_read on public.academy_lesson_progress for select to authenticated
  using (user_id = (select auth.uid()) or public.academy_can_view_students(course_id));

-- ═══════════════ 4. Quizzes (graded on the server; the answer key is never readable by a student) ═══════════════
create table public.academy_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  position integer not null default 0,
  prompt text not null check (char_length(prompt) between 3 and 600),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  multiple boolean not null default false,
  explanation text check (explanation is null or char_length(explanation) <= 600),
  created_at timestamptz not null default now()
);
create index academy_quiz_questions_lesson_idx on public.academy_quiz_questions(lesson_id, position);
create table public.academy_quiz_keys (
  question_id uuid primary key references public.academy_quiz_questions(id) on delete cascade,
  correct integer[] not null check (cardinality(correct) between 1 and 8)
);
create table public.academy_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  score_pct integer not null check (score_pct between 0 and 100),
  passed boolean not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index academy_quiz_attempts_idx on public.academy_quiz_attempts(user_id, lesson_id, created_at desc);

alter table public.academy_quiz_questions enable row level security;
alter table public.academy_quiz_keys enable row level security;
alter table public.academy_quiz_attempts enable row level security;
grant select on public.academy_quiz_questions to anon, authenticated;
grant insert, update, delete on public.academy_quiz_questions to authenticated;
grant select, insert, update, delete on public.academy_quiz_keys to authenticated;     -- the policy below admits course managers only
grant select on public.academy_quiz_attempts to authenticated;
create policy academy_quiz_questions_read on public.academy_quiz_questions for select to anon, authenticated using (public.academy_can_open_lesson(lesson_id));
create policy academy_quiz_questions_write on public.academy_quiz_questions for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));
create policy academy_quiz_keys_staff on public.academy_quiz_keys for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));
create policy academy_quiz_attempts_read on public.academy_quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or public.academy_can_view_students(course_id));

-- ═══════════════ 5. Assignments and submissions ═══════════════
create table public.academy_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  lesson_id uuid references public.academy_lessons(id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  summary text check (summary is null or char_length(summary) <= 400),
  instructions_md text check (instructions_md is null or char_length(instructions_md) <= 20000),
  objectives text[] not null default '{}' check (cardinality(objectives) <= 12),
  due_at timestamptz,
  max_score integer not null default 100 check (max_score between 1 and 1000),
  -- Share of max_score (percent) that counts as passed.
  pass_pct integer not null default 60 check (pass_pct between 1 and 100),
  -- [{ "key": "code_quality", "label": "Code quality", "max": 30 }, ...]; empty = one overall score.
  rubric jsonb not null default '[]'::jsonb check (jsonb_typeof(rubric) = 'array' and jsonb_array_length(rubric) <= 10),
  formats text[] not null default '{repo,demo,text}' check (formats <@ array['repo', 'demo', 'file', 'text'] and cardinality(formats) >= 1),
  allow_resubmission boolean not null default true,
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  allow_late boolean not null default true,
  required_for_certificate boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index academy_assignments_course_idx on public.academy_assignments(course_id, status);
create trigger trg_academy_assignments_updated before update on public.academy_assignments for each row execute function public.set_updated_at();
create trigger trg_academy_assignments_audit after insert or update or delete on public.academy_assignments for each row execute function public.academy_audit('assignment');

create or replace function public.academy_assignments_check()
returns trigger language plpgsql set search_path = '' as $$
declare r jsonb; v_sum integer := 0;
begin
  for r in select * from jsonb_array_elements(new.rubric) loop
    if jsonb_typeof(r) <> 'object' or (r ->> 'key') !~ '^[a-z][a-z0-9_]{1,29}$' or char_length(coalesce(r ->> 'label', '')) not between 2 and 60
       or coalesce((r ->> 'max')::integer, 0) not between 1 and 1000 then
      raise exception 'invalid_rubric' using errcode = '22023';
    end if;
    v_sum := v_sum + (r ->> 'max')::integer;
  end loop;
  if (select count(distinct x ->> 'key') from jsonb_array_elements(new.rubric) x) <> jsonb_array_length(new.rubric) then
    raise exception 'invalid_rubric' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger trg_academy_assignments_check before insert or update on public.academy_assignments for each row execute function public.academy_assignments_check();

create table public.academy_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.academy_assignments(id) on delete cascade,
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt integer not null check (attempt >= 1),
  repo_url text check (repo_url is null or (repo_url ~ '^https://[^\s]+$' and char_length(repo_url) <= 300)),
  demo_url text check (demo_url is null or (demo_url ~ '^https://[^\s]+$' and char_length(demo_url) <= 300)),
  notes text check (notes is null or char_length(notes) <= 4000),
  file_id uuid references public.files(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'graded', 'returned')),
  score integer check (score is null or score >= 0),
  score_pct integer check (score_pct is null or score_pct between 0 and 100),
  passed boolean,
  rubric_scores jsonb,
  feedback text check (feedback is null or char_length(feedback) <= 4000),
  is_late boolean not null default false,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (assignment_id, user_id, attempt)
);
create index academy_submissions_queue_idx on public.academy_submissions(course_id, status, submitted_at);
create index academy_submissions_user_idx on public.academy_submissions(user_id, assignment_id);

create table public.academy_submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.academy_submissions(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('graded', 'returned', 'regraded')),
  score integer,
  passed boolean,
  created_at timestamptz not null default now()
);
create index academy_submission_reviews_idx on public.academy_submission_reviews(submission_id, created_at);

alter table public.academy_assignments enable row level security;
alter table public.academy_submissions enable row level security;
alter table public.academy_submission_reviews enable row level security;
grant select on public.academy_assignments, public.academy_submissions, public.academy_submission_reviews to authenticated;
grant insert, update, delete on public.academy_assignments to authenticated;
create policy academy_assignments_read on public.academy_assignments for select to authenticated
  using ((status = 'published' and public.academy_has_access(course_id)) or public.academy_can_review(course_id) or public.academy_is_staff());
create policy academy_assignments_write on public.academy_assignments for all to authenticated
  using (public.has_permission('academy.courses.manage', null)) with check (public.has_permission('academy.courses.manage', null));
create policy academy_submissions_read on public.academy_submissions for select to authenticated
  using (user_id = (select auth.uid()) or public.academy_can_review(course_id) or public.has_permission('academy.students.manage', null));
create policy academy_submission_reviews_read on public.academy_submission_reviews for select to authenticated
  using (exists (select 1 from public.academy_submissions s where s.id = submission_id));

-- Who may open a file Academy tables point at. Files of other purposes are decided by the policies they already have.
create or replace function public.academy_can_read_file(p_file uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.files f
    where f.id = p_file and f.status = 'ready' and (
      (f.purpose = 'academy_resource' and exists (
        select 1 from public.academy_resources r where r.file_id = f.id and (public.academy_has_access(r.course_id) or public.academy_is_staff())))
      or (f.purpose = 'academy_template' and (public.has_permission('academy.templates.manage', null) or public.has_permission('academy.certificates.issue', null)))
      or (f.purpose = 'academy_submission' and exists (
        select 1 from public.academy_submissions s where s.file_id = f.id and (public.academy_can_review(s.course_id) or public.has_permission('academy.students.manage', null))))
    )
  );
$$;
grant execute on function public.academy_can_read_file(uuid) to authenticated, service_role;
create policy files_select_academy on public.files for select to authenticated using (public.academy_can_read_file(id));

-- ═══════════════ 6. Enrolling (internal) ═══════════════
-- The one place an enrolment is created. Idempotent: a student with a live enrolment gets that one back and nothing changes.
create or replace function public._academy_enroll(
  p_user uuid, p_course uuid, p_cohort uuid, p_source text, p_order uuid default null,
  p_granted_by uuid default null, p_reason text default null, p_consent boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_course public.academy_courses%rowtype;
  v_existing public.academy_enrollments%rowtype;
  v_days integer;
  v_id uuid;
begin
  select * into v_course from public.academy_courses where id = p_course;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into v_existing from public.academy_enrollments
   where user_id = p_user and course_id = p_course and status in ('active', 'completed', 'suspended');
  if found then
    if p_consent and v_existing.verify_consent_at is null then
      update public.academy_enrollments set verify_consent_at = now() where id = v_existing.id;
    end if;
    return jsonb_build_object('enrollment_id', v_existing.id, 'created', false);
  end if;

  v_days := coalesce(v_course.access_days, nullif(public._academy_setting('enrollment_default_access_days') #>> '{}', 'null')::integer);
  insert into public.academy_enrollments(user_id, course_id, cohort_id, status, source, order_id, granted_by, grant_reason, verify_consent_at, access_expires_at)
  values (p_user, p_course, p_cohort, 'active', p_source, p_order, p_granted_by, left(p_reason, 300),
          case when p_consent then now() end, case when v_days is not null then now() + make_interval(days => v_days) end)
  returning id into v_id;

  perform public.write_audit_log(coalesce(p_granted_by, p_user), 'academy.enrollment.created', 'academy_enrollment', v_id::text, null,
    jsonb_build_object('course', v_course.code, 'source', p_source));
  perform public.notify(p_user, 'academy_enrolled', null, 'academy_course', p_course,
    jsonb_build_object('course_id', p_course, 'title', v_course.title, 'source', p_source), 'acad-enrolled:' || v_id::text);
  return jsonb_build_object('enrollment_id', v_id, 'created', true);
end;
$$;
revoke execute on function public._academy_enroll(uuid, uuid, uuid, text, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public._academy_enroll(uuid, uuid, uuid, text, uuid, uuid, text, boolean) to service_role;

-- The student confirms the public-verification consent for an enrolment they already hold (e.g. a complimentary one).
create or replace function public.academy_give_verify_consent(p_enrollment uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.academy_enrollments set verify_consent_at = coalesce(verify_consent_at, now())
   where id = p_enrollment and user_id = (select auth.uid());
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;
grant execute on function public.academy_give_verify_consent(uuid) to authenticated;

-- Staff: enrol someone by hand (complimentary or scholarship). The reason is mandatory and the action is audited.
create or replace function public.academy_admin_enroll(p_user uuid, p_course uuid, p_cohort uuid, p_source text, p_reason text, p_access_days integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_res jsonb;
begin
  if not public.has_permission('academy.students.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_source not in ('complimentary', 'scholarship') then raise exception 'invalid_source' using errcode = '22023'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_user = v_actor then raise exception 'cannot_grant_to_self' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then raise exception 'target_unavailable' using errcode = '22023'; end if;
  if not exists (select 1 from public.academy_courses where id = p_course and status in ('published', 'unpublished')) then raise exception 'course_unavailable' using errcode = '22023'; end if;
  v_res := public._academy_enroll(p_user, p_course, p_cohort, p_source, null, v_actor, v_reason, false);
  if p_access_days is not null and (v_res ->> 'created')::boolean then
    update public.academy_enrollments set access_expires_at = now() + make_interval(days => least(greatest(p_access_days, 1), 3650))
     where id = (v_res ->> 'enrollment_id')::uuid;
  end if;
  return v_res;
end;
$$;
grant execute on function public.academy_admin_enroll(uuid, uuid, uuid, text, text, integer) to authenticated;

-- Staff: suspend, restore, revoke or extend an enrolment.
create or replace function public.academy_admin_set_enrollment(p_enrollment uuid, p_action text, p_reason text, p_days integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_e public.academy_enrollments%rowtype;
begin
  if not public.has_permission('academy.students.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_e from public.academy_enrollments where id = p_enrollment for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_action = 'suspend' and v_e.status in ('active', 'completed') then
    update public.academy_enrollments set status = 'suspended', end_reason = left(v_reason, 300) where id = p_enrollment;
  elsif p_action = 'restore' and v_e.status = 'suspended' then
    update public.academy_enrollments set status = case when completed_at is not null then 'completed' else 'active' end, end_reason = null where id = p_enrollment;
  elsif p_action = 'revoke' and v_e.status in ('active', 'completed', 'suspended', 'expired') then
    update public.academy_enrollments set status = 'revoked', ended_at = now(), end_reason = left(v_reason, 300) where id = p_enrollment;
  elsif p_action = 'extend' and v_e.status in ('active', 'completed', 'expired') and p_days between 1 and 3650 then
    update public.academy_enrollments
       set access_expires_at = greatest(coalesce(access_expires_at, now()), now()) + make_interval(days => p_days),
           status = case when status = 'expired' then (case when completed_at is not null then 'completed' else 'active' end) else status end
     where id = p_enrollment;
  else
    raise exception 'invalid_state' using errcode = '22023';
  end if;
  perform public.write_audit_log(v_actor, 'academy.enrollment.' || p_action, 'academy_enrollment', p_enrollment::text, null, jsonb_build_object('reason', left(v_reason, 200)));
end;
$$;
grant execute on function public.academy_admin_set_enrollment(uuid, text, text, integer) to authenticated;

-- Staff: approve a certificate for a course whose criteria say "a person must approve".
create or replace function public.academy_approve_certificate(p_enrollment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if not public.has_permission('academy.certificates.issue', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.academy_enrollments set certificate_approved_at = now(), certificate_approved_by = v_actor
   where id = p_enrollment and certificate_approved_at is null;
  perform public.write_audit_log(v_actor, 'academy.certificate.approved', 'academy_enrollment', p_enrollment::text, null, '{}'::jsonb);
end;
$$;
grant execute on function public.academy_approve_certificate(uuid) to authenticated;

-- ═══════════════ 7. Progress and completion ═══════════════
-- Everything the certificate criteria ask about, computed from stored facts only.
create or replace function public._academy_completion_state(p_user uuid, p_course uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_criteria jsonb;
  v_total integer;
  v_done integer;
  v_req integer;
  v_passed integer;
  v_avg numeric;
  v_pct integer;
  v_min_completion integer;
  v_min_score integer;
  v_require_assignments boolean;
  v_reasons text[] := '{}';
begin
  select certificate_criteria into v_criteria from public.academy_courses where id = p_course;
  v_min_completion := coalesce((v_criteria ->> 'min_completion_pct')::integer, 100);
  v_min_score := coalesce((v_criteria ->> 'min_score_pct')::integer, 0);
  v_require_assignments := coalesce((v_criteria ->> 'require_assignments')::boolean, true);

  select count(*) into v_total from public.academy_lessons where course_id = p_course;
  select count(*) into v_done from public.academy_lesson_progress where user_id = p_user and course_id = p_course;
  v_pct := case when v_total = 0 then 0 else floor(v_done * 100.0 / v_total)::integer end;

  select count(*) into v_req from public.academy_assignments a where a.course_id = p_course and a.status = 'published' and a.required_for_certificate;
  select count(*) into v_passed from public.academy_assignments a
   where a.course_id = p_course and a.status = 'published' and a.required_for_certificate
     and exists (select 1 from public.academy_submissions s where s.assignment_id = a.id and s.user_id = p_user and s.passed);

  -- Average of the best result in each scored item: required assignments and quizzes.
  select avg(best) into v_avg from (
    select max(s.score_pct) as best from public.academy_submissions s join public.academy_assignments a on a.id = s.assignment_id
     where s.user_id = p_user and a.course_id = p_course and a.required_for_certificate and s.status = 'graded' group by s.assignment_id
    union all
    select max(q.score_pct) from public.academy_quiz_attempts q where q.user_id = p_user and q.course_id = p_course group by q.lesson_id
  ) t;

  if v_pct < v_min_completion then v_reasons := array_append(v_reasons, 'lessons'); end if;
  if v_require_assignments and v_passed < v_req then v_reasons := array_append(v_reasons, 'assignments'); end if;
  if v_min_score > 0 and (v_avg is null or v_avg < v_min_score) then v_reasons := array_append(v_reasons, 'score'); end if;
  if v_total = 0 then v_reasons := array_append(v_reasons, 'no_lessons'); end if;

  return jsonb_build_object(
    'lessons_total', v_total, 'lessons_done', v_done, 'completion_pct', v_pct,
    'assignments_required', v_req, 'assignments_passed', v_passed,
    'avg_score_pct', case when v_avg is null then null else round(v_avg)::integer end,
    'eligible', cardinality(v_reasons) = 0, 'missing', to_jsonb(v_reasons),
    'manual_approval', coalesce((v_criteria ->> 'manual_approval')::boolean, false));
end;
$$;
revoke execute on function public._academy_completion_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public._academy_completion_state(uuid, uuid) to service_role;

-- A student's own progress in one course.
create or replace function public.academy_my_progress(p_course uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return public._academy_completion_state((select auth.uid()), p_course);
end;
$$;
grant execute on function public.academy_my_progress(uuid) to authenticated;

-- After anything that can finish a course: mark the enrolment completed (once) and tell the student.
create or replace function public._academy_after_progress(p_user uuid, p_course uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb;
  v_e public.academy_enrollments%rowtype;
  v_title text;
begin
  select * into v_e from public.academy_enrollments where user_id = p_user and course_id = p_course and status = 'active';
  if not found then return; end if;
  v_state := public._academy_completion_state(p_user, p_course);
  if (v_state ->> 'eligible')::boolean then
    update public.academy_enrollments set status = 'completed', completed_at = now() where id = v_e.id;
    select title into v_title from public.academy_courses where id = p_course;
    perform public.notify(p_user, 'academy_completed', null, 'academy_course', p_course,
      jsonb_build_object('course_id', p_course, 'title', v_title, 'manual_approval', (v_state ->> 'manual_approval')::boolean), 'acad-completed:' || v_e.id::text);
  end if;
end;
$$;
revoke execute on function public._academy_after_progress(uuid, uuid) from public, anon, authenticated;
grant execute on function public._academy_after_progress(uuid, uuid) to service_role;

-- A student marks an ordinary lesson (video, reading, resource) as done. Quizzes and assignments cannot be marked: they finish
-- only through grading.
create or replace function public.academy_complete_lesson(p_lesson uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_l public.academy_lessons%rowtype;
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_l from public.academy_lessons where id = p_lesson;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public._academy_has_access(v_user, v_l.course_id) then raise exception 'no_access' using errcode = '42501'; end if;
  if v_l.kind in ('quiz', 'assignment') then raise exception 'graded_lesson' using errcode = '22023'; end if;
  insert into public.academy_lesson_progress(user_id, lesson_id, course_id) values (v_user, p_lesson, v_l.course_id) on conflict do nothing;
  perform public._academy_after_progress(v_user, v_l.course_id);
  return public._academy_completion_state(v_user, v_l.course_id);
end;
$$;
grant execute on function public.academy_complete_lesson(uuid) to authenticated;

create or replace function public.academy_uncomplete_lesson(p_lesson uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_l public.academy_lessons%rowtype;
begin
  select * into v_l from public.academy_lessons where id = p_lesson;
  if not found or v_user is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_l.kind in ('quiz', 'assignment') then raise exception 'graded_lesson' using errcode = '22023'; end if;
  delete from public.academy_lesson_progress where user_id = v_user and lesson_id = p_lesson;
end;
$$;
grant execute on function public.academy_uncomplete_lesson(uuid) to authenticated;

-- ═══════════════ 8. Quiz grading ═══════════════
-- p_answers: { "<question id>": [selected option indexes] }. The result never includes the key.
create or replace function public.academy_submit_quiz(p_lesson uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_l public.academy_lessons%rowtype;
  v_total integer := 0;
  v_right integer := 0;
  v_q record;
  v_sel integer[];
  v_pct integer;
  v_passed boolean;
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'invalid_answers' using errcode = '22023'; end if;
  select * into v_l from public.academy_lessons where id = p_lesson and kind = 'quiz';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public._academy_has_access(v_user, v_l.course_id) then raise exception 'no_access' using errcode = '42501'; end if;
  if (select count(*) from public.academy_quiz_attempts where user_id = v_user and lesson_id = p_lesson and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_attempts' using errcode = '22023';
  end if;

  for v_q in select q.id, q.multiple, k.correct from public.academy_quiz_questions q join public.academy_quiz_keys k on k.question_id = q.id where q.lesson_id = p_lesson loop
    v_total := v_total + 1;
    select coalesce(array_agg(distinct x::integer order by x::integer), '{}') into v_sel
      from jsonb_array_elements_text(coalesce(p_answers -> v_q.id::text, '[]'::jsonb)) x where x ~ '^[0-9]$';
    if v_sel = (select array_agg(distinct c order by c) from unnest(v_q.correct) c) then v_right := v_right + 1; end if;
  end loop;
  if v_total = 0 then raise exception 'quiz_empty' using errcode = '22023'; end if;

  v_pct := round(v_right * 100.0 / v_total)::integer;
  v_passed := v_pct >= v_l.pass_pct;
  insert into public.academy_quiz_attempts(user_id, lesson_id, course_id, score_pct, passed, answers) values (v_user, p_lesson, v_l.course_id, v_pct, v_passed, p_answers);
  if v_passed then
    insert into public.academy_lesson_progress(user_id, lesson_id, course_id) values (v_user, p_lesson, v_l.course_id) on conflict do nothing;
    perform public._academy_after_progress(v_user, v_l.course_id);
  end if;
  return jsonb_build_object('score_pct', v_pct, 'passed', v_passed, 'correct', v_right, 'total', v_total, 'pass_pct', v_l.pass_pct);
end;
$$;
grant execute on function public.academy_submit_quiz(uuid, jsonb) to authenticated;

-- ═══════════════ 9. Assignments: submit, grade ═══════════════
create or replace function public.academy_submit_assignment(p_assignment uuid, p_repo text, p_demo text, p_notes text, p_file uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_a public.academy_assignments%rowtype;
  v_prev record;
  v_attempt integer;
  v_id uuid;
  v_repo text := nullif(btrim(coalesce(p_repo, '')), '');
  v_demo text := nullif(btrim(coalesce(p_demo, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_a from public.academy_assignments where id = p_assignment and status = 'published';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public._academy_has_access(v_user, v_a.course_id) then raise exception 'no_access' using errcode = '42501'; end if;

  -- Only the kinds of evidence the assignment asks for are accepted, and something must be given.
  if (v_repo is not null and not 'repo' = any(v_a.formats)) or (v_demo is not null and not 'demo' = any(v_a.formats))
     or (v_notes is not null and not 'text' = any(v_a.formats)) or (p_file is not null and not 'file' = any(v_a.formats)) then
    raise exception 'format_not_allowed' using errcode = '22023';
  end if;
  if v_repo is null and v_demo is null and v_notes is null and p_file is null then raise exception 'empty_submission' using errcode = '22023'; end if;
  if p_file is not null and not exists (
    select 1 from public.files f where f.id = p_file and f.owner_id = v_user and f.purpose = 'academy_submission' and f.status = 'ready'
  ) then raise exception 'invalid_file' using errcode = '22023'; end if;

  select coalesce(max(attempt), 0) into v_attempt from public.academy_submissions where assignment_id = p_assignment and user_id = v_user;
  if v_attempt > 0 then
    select status, passed into v_prev from public.academy_submissions where assignment_id = p_assignment and user_id = v_user and attempt = v_attempt;
    if v_prev.status = 'submitted' then raise exception 'awaiting_review' using errcode = '22023'; end if;
    if v_prev.passed then raise exception 'already_passed' using errcode = '22023'; end if;
    if not v_a.allow_resubmission and v_prev.status = 'graded' then raise exception 'resubmission_closed' using errcode = '22023'; end if;
    if v_attempt >= v_a.max_attempts then raise exception 'attempts_used' using errcode = '22023'; end if;
  end if;
  if v_a.due_at is not null and v_a.due_at < now() and not v_a.allow_late then raise exception 'deadline_passed' using errcode = '22023'; end if;

  insert into public.academy_submissions(assignment_id, course_id, user_id, attempt, repo_url, demo_url, notes, file_id, is_late)
  values (p_assignment, v_a.course_id, v_user, v_attempt + 1, v_repo, v_demo, left(v_notes, 4000), p_file, v_a.due_at is not null and v_a.due_at < now())
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.academy_submit_assignment(uuid, text, text, text, uuid) to authenticated;

-- p_scores: { "<rubric key>": points } when the assignment has a rubric; otherwise p_score is the overall score.
create or replace function public.academy_grade_submission(p_submission uuid, p_scores jsonb, p_score integer, p_feedback text, p_action text default 'grade')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_s public.academy_submissions%rowtype;
  v_a public.academy_assignments%rowtype;
  v_feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
  v_r jsonb;
  v_sum integer := 0;
  v_max integer := 0;
  v_score integer;
  v_pct integer;
  v_passed boolean;
  v_title text;
  v_was_graded boolean;
begin
  select * into v_s from public.academy_submissions where id = p_submission for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.academy_can_review(v_s.course_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_s.user_id = v_actor then raise exception 'cannot_review_own_work' using errcode = '42501'; end if;
  select * into v_a from public.academy_assignments where id = v_s.assignment_id;
  v_was_graded := v_s.status = 'graded';

  if p_action = 'return' then
    if v_feedback is null or char_length(v_feedback) < 3 then raise exception 'feedback_required' using errcode = '22023'; end if;
    update public.academy_submissions set status = 'returned', feedback = left(v_feedback, 4000), graded_by = v_actor, graded_at = now(),
           score = null, score_pct = null, passed = false, rubric_scores = null where id = p_submission;
    insert into public.academy_submission_reviews(submission_id, reviewer_id, action, passed) values (p_submission, v_actor, 'returned', false);
    v_passed := false;
  elsif p_action = 'grade' then
    if jsonb_array_length(v_a.rubric) > 0 then
      if jsonb_typeof(p_scores) <> 'object' then raise exception 'invalid_scores' using errcode = '22023'; end if;
      for v_r in select * from jsonb_array_elements(v_a.rubric) loop
        v_max := v_max + (v_r ->> 'max')::integer;
        if not (p_scores ? (v_r ->> 'key')) or (p_scores ->> (v_r ->> 'key')) !~ '^[0-9]{1,4}$'
           or (p_scores ->> (v_r ->> 'key'))::integer > (v_r ->> 'max')::integer then
          raise exception 'invalid_scores' using errcode = '22023';
        end if;
        v_sum := v_sum + (p_scores ->> (v_r ->> 'key'))::integer;
      end loop;
      v_score := round(v_sum * v_a.max_score::numeric / v_max)::integer;
    else
      if p_score is null or p_score < 0 or p_score > v_a.max_score then raise exception 'invalid_scores' using errcode = '22023'; end if;
      v_score := p_score;
    end if;
    v_pct := round(v_score * 100.0 / v_a.max_score)::integer;
    v_passed := v_pct >= v_a.pass_pct;
    update public.academy_submissions set status = 'graded', score = v_score, score_pct = v_pct, passed = v_passed,
           rubric_scores = case when jsonb_array_length(v_a.rubric) > 0 then p_scores end, feedback = left(v_feedback, 4000),
           graded_by = v_actor, graded_at = now() where id = p_submission;
    insert into public.academy_submission_reviews(submission_id, reviewer_id, action, score, passed)
      values (p_submission, v_actor, case when v_was_graded then 'regraded' else 'graded' end, v_score, v_passed);
    if v_passed and v_a.lesson_id is not null then
      insert into public.academy_lesson_progress(user_id, lesson_id, course_id) values (v_s.user_id, v_a.lesson_id, v_s.course_id) on conflict do nothing;
    end if;
    perform public._academy_after_progress(v_s.user_id, v_s.course_id);
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  select title into v_title from public.academy_courses where id = v_s.course_id;
  perform public.notify(v_s.user_id, 'academy_feedback', null, 'academy_submission', p_submission,
    jsonb_build_object('course_id', v_s.course_id, 'assignment', v_a.title, 'passed', v_passed, 'returned', p_action = 'return'),
    'acad-feedback:' || p_submission::text || ':' || extract(epoch from now())::bigint::text);
  perform public.write_audit_log(v_actor, 'academy.submission.' || p_action, 'academy_submission', p_submission::text, null,
    jsonb_build_object('assignment', v_a.title, 'passed', v_passed));
  return jsonb_build_object('passed', v_passed, 'score', v_score, 'score_pct', v_pct);
end;
$$;
grant execute on function public.academy_grade_submission(uuid, jsonb, integer, text, text) to authenticated;

-- ═══════════════ 10. Live classes ═══════════════
create table public.academy_live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  cohort_id uuid references public.academy_cohorts(id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  description text check (description is null or char_length(description) <= 1000),
  instructor_id uuid references public.academy_mentors(user_id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) <= 60),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  -- A recording may be made available only after the people in the class were told it would be recorded.
  recording_consent boolean not null default false,
  recording_available boolean not null default false,
  recording_expires_at timestamptz,
  resources_note text check (resources_note is null or char_length(resources_note) <= 600),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (not recording_available or recording_consent)
);
create index academy_live_sessions_course_idx on public.academy_live_sessions(course_id, starts_at);
create index academy_live_sessions_upcoming_idx on public.academy_live_sessions(starts_at) where status = 'scheduled';
create trigger trg_academy_live_sessions_updated before update on public.academy_live_sessions for each row execute function public.set_updated_at();
create trigger trg_academy_live_sessions_audit after insert or update or delete on public.academy_live_sessions for each row execute function public.academy_audit('live_session');

-- The addresses live apart from the session row. No API role can select this table: the link is handed out only by
-- academy_session_access() below, to an eligible student, close to the class.
create table public.academy_live_session_links (
  session_id uuid primary key references public.academy_live_sessions(id) on delete cascade,
  meeting_url text check (meeting_url is null or (meeting_url ~ '^https://[^\s]+$' and char_length(meeting_url) <= 500)),
  recording_url text check (recording_url is null or (recording_url ~ '^https://[^\s]+$' and char_length(recording_url) <= 500))
);
alter table public.academy_live_sessions enable row level security;
alter table public.academy_live_session_links enable row level security;
grant select on public.academy_live_sessions to authenticated;
grant insert, update, delete on public.academy_live_sessions to authenticated;
grant select, insert, update, delete on public.academy_live_session_links to authenticated;     -- the policy below admits live managers only

-- A student is eligible when they hold valid access to the course and, if the class is for one cohort, belong to it.
create or replace function public._academy_session_eligible(p_user uuid, p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.academy_live_sessions s
    join public.academy_enrollments e on e.course_id = s.course_id and e.user_id = p_user and e.status in ('active', 'completed')
         and (e.access_expires_at is null or e.access_expires_at > now())
    where s.id = p_session and (s.cohort_id is null or e.cohort_id = s.cohort_id)
  );
$$;
revoke execute on function public._academy_session_eligible(uuid, uuid) from public, anon, authenticated;
grant execute on function public._academy_session_eligible(uuid, uuid) to service_role;

create or replace function public.academy_session_visible(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('academy.live.manage', null) or public.academy_can_view_students((select course_id from public.academy_live_sessions where id = p_session))
      or public._academy_session_eligible((select auth.uid()), p_session);
$$;
grant execute on function public.academy_session_visible(uuid) to authenticated, service_role;

create policy academy_live_sessions_read on public.academy_live_sessions for select to authenticated using (public.academy_session_visible(id));
create policy academy_live_sessions_write on public.academy_live_sessions for all to authenticated
  using (public.has_permission('academy.live.manage', null)) with check (public.has_permission('academy.live.manage', null));
create policy academy_live_session_links_staff on public.academy_live_session_links for all to authenticated
  using (public.has_permission('academy.live.manage', null)) with check (public.has_permission('academy.live.manage', null));

-- The meeting address (from an hour before the class until it ends) and the recording address (while the recording is available)
-- for an eligible student; staff always.
create or replace function public.academy_session_access(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_s public.academy_live_sessions%rowtype;
  v_l public.academy_live_session_links%rowtype;
  v_staff boolean := public.has_permission('academy.live.manage', null);
begin
  select * into v_s from public.academy_live_sessions where id = p_session;
  if not found or v_user is null then return null; end if;
  if not (v_staff or public._academy_session_eligible(v_user, p_session)) then return null; end if;
  select * into v_l from public.academy_live_session_links where session_id = p_session;
  return jsonb_build_object(
    'meeting_url', case when v_s.status <> 'cancelled' and (v_staff or (now() >= v_s.starts_at - interval '1 hour' and now() <= v_s.ends_at + interval '2 hours')) then v_l.meeting_url end,
    'recording_url', case when v_s.recording_available and v_s.recording_consent and (v_s.recording_expires_at is null or v_s.recording_expires_at > now()) or v_staff then v_l.recording_url end);
end;
$$;
grant execute on function public.academy_session_access(uuid) to authenticated;

-- ═══════════════ 11. Announcements ═══════════════
create table public.academy_announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.academy_courses(id) on delete cascade,     -- null = every active student
  title text not null check (char_length(title) between 3 and 100),
  message text not null check (char_length(message) between 3 and 2000),
  created_by uuid references public.profiles(id) on delete set null,
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);
create index academy_announcements_idx on public.academy_announcements(course_id, created_at desc);
alter table public.academy_announcements enable row level security;
grant select on public.academy_announcements to authenticated;
create policy academy_announcements_read on public.academy_announcements for select to authenticated
  using (public.academy_is_staff() or (course_id is not null and public.academy_has_access(course_id))
         or (course_id is null and exists (select 1 from public.academy_enrollments e where e.user_id = (select auth.uid()) and e.status in ('active', 'completed'))));

create or replace function public.academy_post_announcement(p_course uuid, p_title text, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_n integer := 0;
  v_u record;
begin
  if not public.has_permission('academy.announce', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.academy_announcements(course_id, title, message, created_by) values (p_course, btrim(p_title), btrim(p_message), v_actor) returning id into v_id;
  -- Everyone with a valid enrolment (in that course, or in any course) is told once, subject to their own Academy notification switches.
  for v_u in
    select distinct e.user_id from public.academy_enrollments e
     where e.status in ('active', 'completed') and (e.access_expires_at is null or e.access_expires_at > now())
       and (p_course is null or e.course_id = p_course)
     limit 20000
  loop
    perform public.notify(v_u.user_id, 'academy_announcement', null, 'academy_announcement', v_id,
      jsonb_build_object('course_id', p_course, 'title', left(btrim(p_title), 100)), 'acad-ann:' || v_id::text);
    v_n := v_n + 1;
  end loop;
  update public.academy_announcements set recipients = v_n where id = v_id;
  perform public.write_audit_log(v_actor, 'academy.announcement.posted', 'academy_announcement', v_id::text, null, jsonb_build_object('recipients', v_n));
  return jsonb_build_object('id', v_id, 'recipients', v_n);
end;
$$;
grant execute on function public.academy_post_announcement(uuid, text, text) to authenticated;

-- ═══════════════ 12. Reminders (run by the worker) ═══════════════
-- One row per reminder already sent, so a repeated run (or a notification the student has since read) never sends it twice.
create table public.academy_reminders_sent (
  kind text not null,
  entity_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (kind, entity_id, user_id)
);
alter table public.academy_reminders_sent enable row level security;     -- no policy, no grant: the database's own bookkeeping

create or replace function public.academy_send_reminders()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hours integer[];
  v_assign_h integer := coalesce((public._academy_setting('assignment_reminder_hours') #>> '{}')::integer, 24);
  v_live integer := 0;
  v_due integer := 0;
  v_h integer;
  r record;
  v_kind text;
begin
  select coalesce(array_agg(x::integer order by x::integer), '{}') into v_hours
    from jsonb_array_elements_text(coalesce(public._academy_setting('live_reminder_hours'), '[24,1]'::jsonb)) x where x ~ '^[0-9]{1,3}$';

  -- Live classes: each student gets the reminder for the smallest window the class has entered, once per window.
  for r in
    select s.id, s.title, s.starts_at, s.course_id, s.cohort_id, e.user_id
      from public.academy_live_sessions s
      join public.academy_enrollments e on e.course_id = s.course_id and e.status in ('active', 'completed')
           and (e.access_expires_at is null or e.access_expires_at > now()) and (s.cohort_id is null or e.cohort_id = s.cohort_id)
     where s.status = 'scheduled' and s.starts_at > now() and s.starts_at <= now() + make_interval(hours => coalesce(v_hours[cardinality(v_hours)], 24))
  loop
    v_h := null;
    foreach v_kind in array (select array_agg(x::text) from unnest(v_hours) x) loop
      if r.starts_at <= now() + make_interval(hours => v_kind::integer) then v_h := v_kind::integer; exit; end if;
    end loop;
    continue when v_h is null;
    insert into public.academy_reminders_sent(kind, entity_id, user_id) values ('live:' || v_h, r.id, r.user_id) on conflict do nothing;
    if found then
      perform public.notify(r.user_id, 'academy_live_reminder', null, 'academy_live_session', r.id,
        jsonb_build_object('course_id', r.course_id, 'title', r.title, 'starts_at', r.starts_at, 'hours', v_h), 'acad-live:' || r.id::text || ':' || v_h);
      v_live := v_live + 1;
    end if;
  end loop;

  -- Assignment deadlines: students who have not submitted yet.
  for r in
    select a.id, a.title, a.course_id, a.due_at, e.user_id
      from public.academy_assignments a
      join public.academy_enrollments e on e.course_id = a.course_id and e.status = 'active' and (e.access_expires_at is null or e.access_expires_at > now())
     where a.status = 'published' and a.due_at > now() and a.due_at <= now() + make_interval(hours => v_assign_h)
       and not exists (select 1 from public.academy_submissions s where s.assignment_id = a.id and s.user_id = e.user_id)
  loop
    insert into public.academy_reminders_sent(kind, entity_id, user_id) values ('due', r.id, r.user_id) on conflict do nothing;
    if found then
      perform public.notify(r.user_id, 'academy_assignment_due', null, 'academy_assignment', r.id,
        jsonb_build_object('course_id', r.course_id, 'title', r.title, 'due_at', r.due_at), 'acad-due:' || r.id::text);
      v_due := v_due + 1;
    end if;
  end loop;

  -- Housekeeping that belongs to the same loop: finished classes, ended recordings, expired access.
  update public.academy_live_sessions set status = 'completed' where status in ('scheduled', 'live') and ends_at < now() - interval '1 hour';
  update public.academy_live_sessions set recording_available = false where recording_available and recording_expires_at is not null and recording_expires_at < now();
  update public.academy_live_session_links l set recording_url = null
    from public.academy_live_sessions s where s.id = l.session_id and l.recording_url is not null and s.recording_expires_at is not null and s.recording_expires_at < now();
  update public.academy_enrollments set status = 'expired', ended_at = now(), end_reason = 'Access period ended'
   where status in ('active', 'completed') and access_expires_at is not null and access_expires_at < now();

  return jsonb_build_object('live', v_live, 'assignments_due', v_due);
end;
$$;
revoke execute on function public.academy_send_reminders() from public, anon, authenticated;
grant execute on function public.academy_send_reminders() to service_role;

-- When an administrator marks a recording available, it expires after the retention period unless one was set.
create or replace function public.academy_live_sessions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.recording_available and (tg_op = 'INSERT' or not old.recording_available) and new.recording_expires_at is null then
    new.recording_expires_at := now() + make_interval(days => coalesce((public._academy_setting('recording_retention_days') #>> '{}')::integer, 180));
  end if;
  if not new.recording_available then new.recording_expires_at := null; end if;
  return new;
end;
$$;
create trigger trg_academy_live_sessions_guard before insert or update on public.academy_live_sessions for each row execute function public.academy_live_sessions_guard();

-- ═══════════════ 13. Erasure ═══════════════
-- Called by the account-erasure job just before the account is deleted. Learning data goes with the account (foreign keys).
-- What stays, by design: order and payment rows (financial records, with the buyer's name removed) and issued certificates
-- (the public record stays verifiable, the holder's name is withdrawn). The tables for those are created in 0067 / 0068.
create or replace function public.academy_erase_user(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_orders integer := 0; v_certs integer := 0;
begin
  if to_regclass('public.academy_orders') is not null then
    update public.academy_orders set buyer_name = null, buyer_username = null where user_id = p_user;
    get diagnostics v_orders = row_count;
  end if;
  if to_regclass('public.academy_certificates') is not null then
    update public.academy_certificates
       set name_withdrawn = true, snapshot = jsonb_set(snapshot, '{recipient_name}', '"Name withdrawn at the holder''s request"'::jsonb)
     where user_id = p_user;
    get diagnostics v_certs = row_count;
  end if;
  delete from public.academy_reminders_sent where user_id = p_user;
  return jsonb_build_object('orders_anonymised', v_orders, 'certificates_name_withdrawn', v_certs);
end;
$$;
revoke execute on function public.academy_erase_user(uuid) from public, anon, authenticated;
grant execute on function public.academy_erase_user(uuid) to service_role;

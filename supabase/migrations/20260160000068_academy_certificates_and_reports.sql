-- 0068: UniSphere Academy, part 4 of 4: certificate templates, issued certificates, public verification, and the staff reports.
--
-- Certificates in short:
--   * A template is an uploaded PDF plus a list of fields placed on it (text with {{variables}}, a QR code). The PDF itself is never
--     edited: at issue time the server draws the fields over it (an overlay) and stores the result.
--   * A template VERSION is immutable once active, and every certificate records the version it was made with.
--   * A certificate gets its public ID (US-2026-WD-00142) from a database sequence on the server; it is unique, never reused, never
--     supplied by a client, and a revoked certificate keeps its row and its ID.
--   * The snapshot taken at issue time is the record of what was achieved. Later edits to the course or the student's profile do
--     not rewrite it.
--   * The public verification page reads one SECURITY DEFINER function that returns approved fields only. The table itself has
--     no anonymous access.

-- ═══════════════ 1. Templates ═══════════════
create table public.academy_cert_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index academy_cert_templates_default_idx on public.academy_cert_templates(is_default) where is_default;
create trigger trg_academy_cert_templates_updated before update on public.academy_cert_templates for each row execute function public.set_updated_at();
create trigger trg_academy_cert_templates_audit after insert or update or delete on public.academy_cert_templates for each row execute function public.academy_audit('cert_template');

create table public.academy_cert_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.academy_cert_templates(id) on delete cascade,
  version integer not null check (version >= 1),
  file_id uuid not null references public.files(id) on delete restrict,
  page_count integer not null check (page_count between 1 and 20),
  -- Size of the page the fields are placed on, in PDF points. Field positions are fractions of it.
  page_width numeric not null check (page_width between 100 and 5000),
  page_height numeric not null check (page_height between 100 and 5000),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 40),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by uuid references public.profiles(id) on delete set null,
  unique (template_id, version)
);
create unique index academy_cert_versions_active_idx on public.academy_cert_template_versions(template_id) where status = 'active';
create trigger trg_academy_cert_versions_audit after insert or update or delete on public.academy_cert_template_versions for each row execute function public.academy_audit('cert_template_version');

alter table public.academy_courses add constraint academy_courses_template_fk foreign key (certificate_template_id) references public.academy_cert_templates(id) on delete set null;

-- The variables a field may use. Required ones are always known when a certificate is made.
create or replace function public._academy_cert_variables() returns text[] language sql immutable set search_path = '' as $$
  select array['student_name', 'course_title', 'course_code', 'certificate_id', 'issue_date', 'program_duration', 'skills_covered',
               'project_title', 'project_url', 'assessment_score', 'mentor_name', 'issuing_organization', 'completion_date'];
$$;
create or replace function public._academy_cert_required_variables() returns text[] language sql immutable set search_path = '' as $$
  select array['student_name', 'course_title', 'course_code', 'certificate_id', 'issue_date', 'issuing_organization'];
$$;

-- Problems with a field list (an empty array = fine). p_complete also asks for the pieces every certificate must have.
create or replace function public._academy_validate_fields(p_fields jsonb, p_pages integer, p_complete boolean)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  f jsonb; v text; m text[]; i integer := 0;
  v_problems text[] := '{}';
  v_has_qr boolean := false; v_has_name boolean := false; v_has_id boolean := false; v_has_course boolean := false;
  v_ids text[] := '{}';
begin
  if jsonb_typeof(p_fields) <> 'array' then return array['fields must be a list']; end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    i := i + 1;
    if jsonb_typeof(f) <> 'object' then v_problems := v_problems || format('field %s is not an object', i); continue; end if;
    if coalesce(f ->> 'id', '') !~ '^[a-z0-9_-]{1,24}$' or (f ->> 'id') = any (v_ids) then v_problems := v_problems || format('field %s needs a unique id', i); end if;
    v_ids := v_ids || coalesce(f ->> 'id', '');
    if coalesce(f ->> 'kind', '') not in ('text', 'qr') then v_problems := v_problems || format('field %s has an unknown kind', i); continue; end if;
    if coalesce((f ->> 'page')::integer, -1) not between 0 and p_pages - 1 then v_problems := v_problems || format('field %s is on a page that does not exist', i); end if;
    if coalesce((f ->> 'x')::numeric, -1) not between 0 and 1 or coalesce((f ->> 'y')::numeric, -1) not between 0 and 1
       or coalesce((f ->> 'w')::numeric, -1) not between 0.01 and 1 then
      v_problems := v_problems || format('field %s has an invalid position or size', i);
    end if;
    if f ->> 'kind' = 'qr' then
      v_has_qr := true;
    else
      if char_length(coalesce(f ->> 'text', '')) not between 1 and 400 then v_problems := v_problems || format('field %s needs text (up to 400 characters)', i); end if;
      if coalesce(f ->> 'font', '') not in ('Helvetica', 'HelveticaBold', 'HelveticaOblique', 'TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'Courier', 'CourierBold') then
        v_problems := v_problems || format('field %s uses an unsupported font', i);
      end if;
      if coalesce((f ->> 'size')::numeric, 0) not between 6 and 120 then v_problems := v_problems || format('field %s has an unsupported font size', i); end if;
      if coalesce(f ->> 'color', '') !~ '^#[0-9a-fA-F]{6}$' then v_problems := v_problems || format('field %s has an invalid colour', i); end if;
      if coalesce(f ->> 'align', '') not in ('left', 'center', 'right') then v_problems := v_problems || format('field %s has an invalid alignment', i); end if;
      for m in select regexp_matches(coalesce(f ->> 'text', ''), '\{\{\s*([a-zA-Z0-9_]*)\s*\}\}', 'g') loop
        v := m[1];
        if not (v = any (public._academy_cert_variables())) then v_problems := v_problems || format('field %s uses an unknown variable {{%s}}', i, v); end if;
        if v = 'student_name' then v_has_name := true; end if;
        if v = 'certificate_id' then v_has_id := true; end if;
        if v = 'course_title' then v_has_course := true; end if;
      end loop;
      -- A stray brace pair that is not a variable would print literally.
      if regexp_replace(coalesce(f ->> 'text', ''), '\{\{\s*[a-zA-Z0-9_]*\s*\}\}', '', 'g') ~ '\{\{|\}\}' then v_problems := v_problems || format('field %s has a broken {{variable}}', i); end if;
    end if;
  end loop;
  if p_complete then
    if not v_has_qr then v_problems := array_append(v_problems, 'add the QR code'); end if;
    if not v_has_name then v_problems := array_append(v_problems, 'add the {{student_name}} field'); end if;
    if not v_has_id then v_problems := array_append(v_problems, 'add the {{certificate_id}} field'); end if;
    if not v_has_course then v_problems := array_append(v_problems, 'add the {{course_title}} field'); end if;
  end if;
  return v_problems;
exception when others then
  return array['the field list could not be read'];
end;
$$;

-- Immutable once active: an issued certificate's template can always be reproduced.
create or replace function public.academy_cert_versions_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' and (new.fields is distinct from old.fields or new.file_id is distinct from old.file_id
     or new.page_width is distinct from old.page_width or new.page_height is distinct from old.page_height or new.page_count is distinct from old.page_count) then
    raise exception 'version_locked' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger trg_academy_cert_versions_guard before update on public.academy_cert_template_versions for each row execute function public.academy_cert_versions_guard();

alter table public.academy_cert_templates enable row level security;
alter table public.academy_cert_template_versions enable row level security;
grant select on public.academy_cert_templates, public.academy_cert_template_versions to authenticated;
create policy academy_cert_templates_read on public.academy_cert_templates for select to authenticated
  using (public.has_permission('academy.templates.manage', null) or public.has_permission('academy.certificates.issue', null));
create policy academy_cert_versions_read on public.academy_cert_template_versions for select to authenticated
  using (public.has_permission('academy.templates.manage', null) or public.has_permission('academy.certificates.issue', null));

-- Template writes: functions only, so each one checks the file, the fields and the permission together.
create or replace function public.academy_save_template(p_id uuid, p_name text, p_description text, p_is_default boolean, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_id uuid := p_id;
begin
  if not public.has_permission('academy.templates.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_id is null then
    insert into public.academy_cert_templates(name, description, created_by) values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), v_actor) returning id into v_id;
  else
    update public.academy_cert_templates set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''), active = coalesce(p_active, active) where id = v_id;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  if p_is_default is true then
    update public.academy_cert_templates set is_default = false where is_default and id <> v_id;
    update public.academy_cert_templates set is_default = true where id = v_id;
  elsif p_is_default is false then
    update public.academy_cert_templates set is_default = false where id = v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function public.academy_save_template(uuid, text, text, boolean, boolean) to authenticated;

-- A new draft version from an uploaded PDF. The first version starts empty; later ones start from the last version's fields.
create or replace function public.academy_new_template_version(p_template uuid, p_file uuid, p_pages integer, p_width numeric, p_height numeric, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_next integer; v_prev jsonb; v_id uuid;
begin
  if not public.has_permission('academy.templates.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.files f where f.id = p_file and f.purpose = 'academy_template' and f.status = 'ready' and f.mime_type = 'application/pdf') then
    raise exception 'invalid_file' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.academy_cert_template_versions where template_id = p_template;
  select fields into v_prev from public.academy_cert_template_versions where template_id = p_template order by version desc limit 1;
  insert into public.academy_cert_template_versions(template_id, version, file_id, page_count, page_width, page_height, fields, notes, created_by)
  values (p_template, v_next, p_file, p_pages, p_width, p_height, coalesce(v_prev, '[]'::jsonb), left(p_notes, 300), v_actor) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.academy_new_template_version(uuid, uuid, integer, numeric, numeric, text) to authenticated;

create or replace function public.academy_save_template_fields(p_version uuid, p_fields jsonb)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_v public.academy_cert_template_versions%rowtype; v_problems text[];
begin
  if not public.has_permission('academy.templates.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_v from public.academy_cert_template_versions where id = p_version for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_v.status <> 'draft' then raise exception 'version_locked' using errcode = '22023'; end if;
  v_problems := public._academy_validate_fields(p_fields, v_v.page_count, false);
  if cardinality(v_problems) > 0 then return v_problems; end if;
  update public.academy_cert_template_versions set fields = p_fields where id = p_version;
  return '{}';
end;
$$;
grant execute on function public.academy_save_template_fields(uuid, jsonb) to authenticated;

-- Make a draft the live version of its template (the previous live one is archived). Everything must validate first.
create or replace function public.academy_activate_template_version(p_version uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_v public.academy_cert_template_versions%rowtype; v_problems text[];
begin
  if not public.has_permission('academy.templates.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_v from public.academy_cert_template_versions where id = p_version for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_v.status <> 'draft' then raise exception 'invalid_state' using errcode = '22023'; end if;
  v_problems := public._academy_validate_fields(v_v.fields, v_v.page_count, true);
  if cardinality(v_problems) > 0 then return v_problems; end if;
  update public.academy_cert_template_versions set status = 'archived' where template_id = v_v.template_id and status = 'active';
  update public.academy_cert_template_versions set status = 'active', activated_at = now(), activated_by = v_actor where id = p_version;
  perform public.write_audit_log(v_actor, 'academy.template.activated', 'academy_cert_template_version', p_version::text, null, jsonb_build_object('version', v_v.version));
  return '{}';
end;
$$;
grant execute on function public.academy_activate_template_version(uuid) to authenticated;

create or replace function public.academy_deactivate_template_version(p_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid());
begin
  if not public.has_permission('academy.templates.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.academy_cert_template_versions set status = 'archived' where id = p_version and status = 'active';
  if not found then raise exception 'invalid_state' using errcode = '22023'; end if;
  perform public.write_audit_log(v_actor, 'academy.template.deactivated', 'academy_cert_template_version', p_version::text, null, '{}'::jsonb);
end;
$$;
grant execute on function public.academy_deactivate_template_version(uuid) to authenticated;

-- Assign a template to a course or program (null = use the default).
create or replace function public.academy_assign_template(p_course uuid, p_template uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('academy.templates.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.academy_courses set certificate_template_id = p_template where id = p_course;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;
grant execute on function public.academy_assign_template(uuid, uuid) to authenticated;

-- ═══════════════ 2. Issued certificates ═══════════════
create sequence public.academy_certificate_seq;

create table public.academy_certificates (
  id uuid primary key default gen_random_uuid(),
  -- The public ID. Never reused, even after revocation.
  certificate_id text not null unique check (certificate_id ~ '^[A-Z0-9]{2,6}-[0-9]{4}-[A-Z0-9]{1,8}-[0-9]{4,8}$'),
  user_id uuid references public.profiles(id) on delete set null,
  enrollment_id uuid references public.academy_enrollments(id) on delete set null,
  course_id uuid not null references public.academy_courses(id) on delete restrict,
  course_code text not null,
  template_version_id uuid not null references public.academy_cert_template_versions(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'issued', 'revoked', 'failed')),
  snapshot jsonb not null,
  name_withdrawn boolean not null default false,
  pdf_key text,
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes integer,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),          -- internal
  revoke_public_note text check (revoke_public_note is null or char_length(revoke_public_note) <= 200),  -- shown on the verification page
  replaces_id uuid references public.academy_certificates(id) on delete restrict,
  replaced_by_id uuid references public.academy_certificates(id) on delete restrict,
  verify_count integer not null default 0,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live certificate per enrolment, and one replacement per certificate.
create unique index academy_certificates_live_idx on public.academy_certificates(enrollment_id) where enrollment_id is not null and status in ('pending', 'issued', 'failed') and replaces_id is null;
create unique index academy_certificates_replaces_idx on public.academy_certificates(replaces_id) where replaces_id is not null;
create index academy_certificates_user_idx on public.academy_certificates(user_id);
create index academy_certificates_course_idx on public.academy_certificates(course_id, status);
create index academy_certificates_issued_idx on public.academy_certificates(issued_at desc);
create trigger trg_academy_certificates_updated before update on public.academy_certificates for each row execute function public.set_updated_at();

-- A certificate's identity and snapshot never change.
create or replace function public.academy_certificates_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.certificate_id is distinct from old.certificate_id or new.course_id is distinct from old.course_id
     or new.course_code is distinct from old.course_code or (new.template_version_id is distinct from old.template_version_id and old.status = 'issued') then
    raise exception 'certificate_immutable' using errcode = '22023';
  end if;
  if new.snapshot is distinct from old.snapshot and old.status = 'issued' and not (new.name_withdrawn and not old.name_withdrawn) then
    raise exception 'certificate_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger trg_academy_certificates_guard before update on public.academy_certificates for each row execute function public.academy_certificates_guard();

create table public.academy_certificate_events (
  id bigint generated always as identity primary key,
  certificate_id uuid not null references public.academy_certificates(id) on delete restrict,
  action text not null check (action in ('begun', 'issued', 'generation_failed', 'revoked', 'reissued', 'replaced')),
  actor_id uuid references public.profiles(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index academy_certificate_events_idx on public.academy_certificate_events(certificate_id, created_at);
create trigger trg_academy_certificate_events_ro before update or delete on public.academy_certificate_events for each row execute function public.academy_append_only();

alter table public.academy_certificates enable row level security;
alter table public.academy_certificate_events enable row level security;
grant select on public.academy_certificates, public.academy_certificate_events to authenticated;
-- A holder sees their own. Certificate staff see all. The public sees nothing here: it uses academy_verify_certificate().
create policy academy_certificates_read on public.academy_certificates for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('academy.certificates.issue', null) or public.has_permission('academy.certificates.revoke', null));
create policy academy_certificate_events_read on public.academy_certificate_events for select to authenticated
  using (public.has_permission('academy.certificates.issue', null) or public.has_permission('academy.certificates.revoke', null));

-- Step 1 of issuing: check the student is eligible, take the snapshot, reserve the ID. The server then draws the PDF and calls
-- academy_finish_certificate (or academy_fail_certificate). Asking again for an enrolment that already has a certificate returns it.
create or replace function public.academy_begin_certificate(p_enrollment uuid, p_replaces uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_e public.academy_enrollments%rowtype;
  v_c public.academy_courses%rowtype;
  v_state jsonb;
  v_tpl uuid;
  v_ver public.academy_cert_template_versions%rowtype;
  v_ap public.academy_profiles%rowtype;
  v_prof public.profiles%rowtype;
  v_existing public.academy_certificates%rowtype;
  v_old public.academy_certificates%rowtype;
  v_cat text;
  v_name text;
  v_mentor text;
  v_proj record;
  v_snapshot jsonb;
  v_id uuid;
  v_public_id text;
  v_org text := coalesce(public._academy_setting('certificate_prefix') #>> '{}', 'US');
begin
  if not public.has_permission('academy.certificates.issue', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_e from public.academy_enrollments where id = p_enrollment for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_c from public.academy_courses where id = v_e.course_id;
  if v_e.status not in ('active', 'completed') then return jsonb_build_object('ok', false, 'error', 'enrollment_not_active'); end if;

  v_state := public._academy_completion_state(v_e.user_id, v_e.course_id);
  if not (v_state ->> 'eligible')::boolean then return jsonb_build_object('ok', false, 'error', 'not_eligible', 'missing', v_state -> 'missing'); end if;
  if coalesce((v_c.certificate_criteria ->> 'manual_approval')::boolean, false) and v_e.certificate_approved_at is null then
    return jsonb_build_object('ok', false, 'error', 'approval_required');
  end if;
  if v_e.verify_consent_at is null then return jsonb_build_object('ok', false, 'error', 'consent_required'); end if;

  -- Already issued for this enrolment (and not a deliberate reissue): hand back the same certificate.
  select * into v_existing from public.academy_certificates where enrollment_id = p_enrollment and replaces_id is null and status in ('pending', 'issued', 'failed');
  if found and p_replaces is null then
    if v_existing.status = 'issued' then return jsonb_build_object('ok', true, 'existing', true, 'id', v_existing.id, 'certificate_id', v_existing.certificate_id); end if;
    -- Pending or failed: try the same record again with the current template.
    v_tpl := coalesce(v_c.certificate_template_id, (select id from public.academy_cert_templates where is_default and active));
    select v.* into v_ver from public.academy_cert_template_versions v join public.academy_cert_templates t on t.id = v.template_id
     where v.template_id = v_tpl and v.status = 'active' and t.active;
    if not found then return jsonb_build_object('ok', false, 'error', 'no_template'); end if;
    update public.academy_certificates set status = 'pending', template_version_id = v_ver.id where id = v_existing.id;
    return jsonb_build_object('ok', true, 'id', v_existing.id, 'certificate_id', v_existing.certificate_id, 'template_version_id', v_ver.id, 'snapshot', v_existing.snapshot);
  end if;

  if p_replaces is not null then
    select * into v_old from public.academy_certificates where id = p_replaces and enrollment_id = p_enrollment and status = 'issued' for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'cannot_replace'); end if;
    if exists (select 1 from public.academy_certificates where replaces_id = p_replaces) then
      -- A replacement was already begun (perhaps one that failed): continue it instead of starting another.
      select * into v_existing from public.academy_certificates where replaces_id = p_replaces;
      if v_existing.status in ('pending', 'failed') then
        v_tpl := coalesce(v_c.certificate_template_id, (select id from public.academy_cert_templates where is_default and active));
        select v.* into v_ver from public.academy_cert_template_versions v join public.academy_cert_templates t on t.id = v.template_id where v.template_id = v_tpl and v.status = 'active' and t.active;
        if not found then return jsonb_build_object('ok', false, 'error', 'no_template'); end if;
        update public.academy_certificates set status = 'pending', template_version_id = v_ver.id where id = v_existing.id;
        return jsonb_build_object('ok', true, 'id', v_existing.id, 'certificate_id', v_existing.certificate_id, 'template_version_id', v_ver.id, 'snapshot', v_existing.snapshot);
      end if;
      return jsonb_build_object('ok', false, 'error', 'cannot_replace');
    end if;
  end if;

  v_tpl := coalesce(v_c.certificate_template_id, (select id from public.academy_cert_templates where is_default and active));
  select v.* into v_ver from public.academy_cert_template_versions v join public.academy_cert_templates t on t.id = v.template_id
   where v.template_id = v_tpl and v.status = 'active' and t.active;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_template'); end if;

  select * into v_prof from public.profiles where id = v_e.user_id;
  select * into v_ap from public.academy_profiles where user_id = v_e.user_id;
  v_name := btrim(coalesce(nullif(v_ap.certificate_name, ''), v_prof.full_name));
  select code_prefix into v_cat from public.academy_categories where id = v_c.category_id;
  select m.display_name into v_mentor from public.academy_course_mentors cm join public.academy_mentors m on m.user_id = cm.user_id
   where cm.course_id = v_c.id order by (cm.role = 'lead') desc, cm.position limit 1;
  -- The student's best passed required assignment is the project shown on the certificate (its link only if they agreed to share it).
  select a.title as title, s.demo_url, s.repo_url into v_proj
    from public.academy_submissions s join public.academy_assignments a on a.id = s.assignment_id
   where s.user_id = v_e.user_id and a.course_id = v_c.id and s.passed order by s.score_pct desc nulls last, s.graded_at desc limit 1;

  v_snapshot := jsonb_build_object(
    'recipient_name', v_name, 'course_title', v_c.title, 'course_code', v_c.code, 'kind', v_c.kind,
    'issuing_organization', coalesce(public._academy_setting('issuing_organization') #>> '{}', 'UniSphere Academy'),
    'mentor_name', v_mentor, 'issue_date', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'completion_date', to_char(coalesce(v_e.completed_at, now()) at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'program_duration', v_c.duration_label, 'skills', to_jsonb(v_c.skills),
    'project_title', v_proj.title,
    'project_url', case when coalesce(v_ap.share_project, false) then coalesce(v_proj.demo_url, v_proj.repo_url) end,
    'score_pct', v_state -> 'avg_score_pct', 'template_version', v_ver.version, 'correction_note', left(p_note, 200));

  v_public_id := v_org || '-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || coalesce(v_cat, 'GEN') || '-' || lpad(nextval('public.academy_certificate_seq')::text, 5, '0');
  insert into public.academy_certificates(certificate_id, user_id, enrollment_id, course_id, course_code, template_version_id, status, snapshot, replaces_id)
  values (v_public_id, v_e.user_id, p_enrollment, v_c.id, v_c.code, v_ver.id, 'pending', v_snapshot, p_replaces) returning id into v_id;
  insert into public.academy_certificate_events(certificate_id, action, actor_id, detail) values (v_id, 'begun', v_actor, jsonb_build_object('replaces', p_replaces));
  return jsonb_build_object('ok', true, 'id', v_id, 'certificate_id', v_public_id, 'template_version_id', v_ver.id, 'snapshot', v_snapshot);
end;
$$;
grant execute on function public.academy_begin_certificate(uuid, uuid, text) to authenticated;

-- Step 2 (server only): the PDF has been stored; make the certificate real.
create or replace function public.academy_finish_certificate(p_id uuid, p_pdf_key text, p_sha256 text, p_bytes integer, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_c public.academy_certificates%rowtype; v_old public.academy_certificates%rowtype; v_title text;
begin
  select * into v_c from public.academy_certificates where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_c.status = 'issued' then return jsonb_build_object('ok', true, 'already', true); end if;
  if v_c.status not in ('pending', 'failed') then return jsonb_build_object('ok', false, 'error', 'invalid_state'); end if;
  update public.academy_certificates set status = 'issued', pdf_key = p_pdf_key, pdf_sha256 = p_sha256, pdf_bytes = p_bytes, issued_by = p_actor, issued_at = now() where id = p_id;
  insert into public.academy_certificate_events(certificate_id, action, actor_id, detail) values (p_id, 'issued', p_actor, jsonb_build_object('sha256', p_sha256));

  if v_c.replaces_id is not null then
    -- A corrected certificate replaces the old one: the old one is revoked as superseded and points to the new.
    select * into v_old from public.academy_certificates where id = v_c.replaces_id for update;
    update public.academy_certificates set status = 'revoked', revoked_at = now(), revoked_by = p_actor, revoke_reason = 'Replaced by a corrected certificate',
           revoke_public_note = 'Replaced by a corrected certificate', replaced_by_id = p_id where id = v_c.replaces_id and status = 'issued';
    insert into public.academy_certificate_events(certificate_id, action, actor_id, detail) values (v_c.replaces_id, 'replaced', p_actor, jsonb_build_object('by', v_c.certificate_id));
    insert into public.academy_certificate_events(certificate_id, action, actor_id, detail) values (p_id, 'reissued', p_actor, jsonb_build_object('replaces', v_old.certificate_id));
  end if;
  if v_c.user_id is not null then
    perform public.notify(v_c.user_id, 'academy_certificate', null, 'academy_certificate', p_id,
      jsonb_build_object('event', case when v_c.replaces_id is null then 'issued' else 'reissued' end, 'certificate_id', v_c.certificate_id, 'title', v_c.snapshot ->> 'course_title'),
      'acad-cert:' || p_id::text);
  end if;
  perform public.write_audit_log(p_actor, 'academy.certificate.issued', 'academy_certificate', p_id::text, null, jsonb_build_object('certificate_id', v_c.certificate_id));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.academy_finish_certificate(uuid, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.academy_finish_certificate(uuid, text, text, integer, uuid) to service_role;

create or replace function public.academy_fail_certificate(p_id uuid, p_error text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.academy_certificates set status = 'failed' where id = p_id and status = 'pending';
  if found then insert into public.academy_certificate_events(certificate_id, action, actor_id, detail) values (p_id, 'generation_failed', p_actor, jsonb_build_object('error', left(p_error, 300))); end if;
end;
$$;
revoke execute on function public.academy_fail_certificate(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.academy_fail_certificate(uuid, text, uuid) to service_role;

create or replace function public.academy_revoke_certificate(p_id uuid, p_reason text, p_public_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_c public.academy_certificates%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.has_permission('academy.certificates.revoke', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_c from public.academy_certificates where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_c.status <> 'issued' then raise exception 'invalid_state' using errcode = '22023'; end if;
  update public.academy_certificates set status = 'revoked', revoked_at = now(), revoked_by = v_actor, revoke_reason = left(v_reason, 500),
         revoke_public_note = nullif(left(btrim(coalesce(p_public_note, '')), 200), '') where id = p_id;
  insert into public.academy_certificate_events(certificate_id, action, actor_id, detail) values (p_id, 'revoked', v_actor, jsonb_build_object('reason', left(v_reason, 200)));
  perform public.write_audit_log(v_actor, 'academy.certificate.revoked', 'academy_certificate', p_id::text, null, jsonb_build_object('certificate_id', v_c.certificate_id, 'reason', left(v_reason, 200)));
  if v_c.user_id is not null then
    perform public.notify(v_c.user_id, 'academy_certificate', null, 'academy_certificate', p_id,
      jsonb_build_object('event', 'revoked', 'certificate_id', v_c.certificate_id, 'title', v_c.snapshot ->> 'course_title'), 'acad-cert-rev:' || p_id::text);
  end if;
end;
$$;
grant execute on function public.academy_revoke_certificate(uuid, text, text) to authenticated;

-- ═══════════════ 3. Public verification ═══════════════
-- The only thing a visitor can call. It reads the authoritative record and returns approved fields; it never returns an email,
-- a phone number, a file, an internal note or the revocation reason. A recipient's score and project link appear only if the
-- recipient switched those on in their Academy profile.
create or replace function public.academy_verify_certificate(p_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id text := upper(btrim(coalesce(p_id, '')));
  v_c public.academy_certificates%rowtype;
  v_ap public.academy_profiles%rowtype;
  v_repl text;
  v_snap jsonb;
begin
  if v_id !~ '^[A-Z0-9]{2,6}-[0-9]{4}-[A-Z0-9]{1,8}-[0-9]{4,8}$' then return jsonb_build_object('status', 'not_found'); end if;
  select * into v_c from public.academy_certificates where certificate_id = v_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_c.status in ('pending', 'failed') then return jsonb_build_object('status', 'pending', 'certificate_id', v_c.certificate_id); end if;

  update public.academy_certificates set verify_count = verify_count + 1, last_verified_at = now() where id = v_c.id;
  select * into v_ap from public.academy_profiles where user_id = v_c.user_id;
  select certificate_id into v_repl from public.academy_certificates where id = v_c.replaced_by_id;
  v_snap := v_c.snapshot;
  return jsonb_build_object(
    'status', case when v_c.status = 'issued' then 'valid' else 'revoked' end,
    'certificate_id', v_c.certificate_id,
    'recipient_name', v_snap ->> 'recipient_name',
    'name_withdrawn', v_c.name_withdrawn,
    'course_title', v_snap ->> 'course_title', 'course_code', v_snap ->> 'course_code', 'kind', v_snap ->> 'kind',
    'issuing_organization', v_snap ->> 'issuing_organization', 'mentor_name', v_snap ->> 'mentor_name',
    'issue_date', v_snap ->> 'issue_date', 'completion_date', v_snap ->> 'completion_date',
    'program_duration', v_snap ->> 'program_duration', 'skills', v_snap -> 'skills',
    'project_title', case when coalesce(v_ap.share_project, false) then v_snap ->> 'project_title' end,
    'project_url', case when coalesce(v_ap.share_project, false) then v_snap ->> 'project_url' end,
    'score_pct', case when coalesce(v_ap.share_score, false) then v_snap -> 'score_pct' end,
    'revoked_at', v_c.revoked_at, 'revoked_note', v_c.revoke_public_note, 'replaced_by', v_repl);
end;
$$;
grant execute on function public.academy_verify_certificate(text) to anon, authenticated, service_role;

-- ═══════════════ 4. Staff views and reports ═══════════════
-- Students with their course and progress, searchable. A mentor sees only their own courses' students (academy_can_view_students).
create or replace function public.academy_admin_enrollments(
  p_search text default null, p_status text default null, p_course uuid default null, p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, user_id uuid, full_name text, username text, email text, course_id uuid, course_code text, course_title text, cohort_name text,
  status text, source text, enrolled_at timestamptz, access_expires_at timestamptz, completed_at timestamptz, completion_pct integer,
  certificate_status text, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not (public.has_permission('academy.students.view', null) or public.has_permission('academy.students.manage', null)
          or public.has_permission('academy.finance.view', null) or public.has_permission('academy.assignments.review', null)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select e.id, e.user_id, p.full_name, p.username, u.email::text, c.id, c.code, c.title, h.name, e.status, e.source, e.enrolled_at, e.access_expires_at, e.completed_at,
         (public._academy_completion_state(e.user_id, e.course_id) ->> 'completion_pct')::integer,
         (select ce.status from public.academy_certificates ce where ce.enrollment_id = e.id and ce.replaces_id is null order by ce.created_at desc limit 1),
         count(*) over ()
  from public.academy_enrollments e
  join public.academy_courses c on c.id = e.course_id
  join public.profiles p on p.id = e.user_id
  left join auth.users u on u.id = e.user_id
  left join public.academy_cohorts h on h.id = e.cohort_id
  where public.academy_can_view_students(e.course_id)
    and (p_status is null or e.status = p_status) and (p_course is null or e.course_id = p_course)
    and (v_q is null or p.full_name ilike '%' || v_q || '%' or p.username ilike '%' || v_q || '%' or c.code ilike '%' || v_q || '%' or c.title ilike '%' || v_q || '%'
         or (public.has_permission('academy.students.manage', null) and u.email ilike '%' || v_q || '%'))
  order by e.enrolled_at desc
  limit least(greatest(p_limit, 1), 5000) offset greatest(p_offset, 0);
end;
$$;
grant execute on function public.academy_admin_enrollments(text, text, uuid, integer, integer) to authenticated;

-- The grading queue: submissions waiting for the caller to review (their courses only).
create or replace function public.academy_review_queue(p_status text default 'submitted', p_course uuid default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, assignment_id uuid, assignment_title text, course_id uuid, course_code text, user_id uuid, full_name text, username text,
  attempt integer, status text, repo_url text, demo_url text, notes text, file_id uuid, is_late boolean, score integer, score_pct integer,
  passed boolean, feedback text, submitted_at timestamptz, graded_at timestamptz, max_score integer, rubric jsonb, rubric_scores jsonb, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('academy.assignments.review', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select s.id, a.id, a.title, c.id, c.code, s.user_id, p.full_name, p.username, s.attempt, s.status, s.repo_url, s.demo_url, s.notes, s.file_id, s.is_late,
         s.score, s.score_pct, s.passed, s.feedback, s.submitted_at, s.graded_at, a.max_score, a.rubric, s.rubric_scores, count(*) over ()
  from public.academy_submissions s
  join public.academy_assignments a on a.id = s.assignment_id
  join public.academy_courses c on c.id = s.course_id
  join public.profiles p on p.id = s.user_id
  where public.academy_can_review(s.course_id) and (p_status is null or s.status = p_status) and (p_course is null or s.course_id = p_course)
  order by case when s.status = 'submitted' then s.submitted_at end asc nulls last, s.submitted_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;
grant execute on function public.academy_review_queue(text, uuid, integer, integer) to authenticated;

-- Certificates for the certificate dashboard.
create or replace function public.academy_admin_certificates(
  p_search text default null, p_status text default null, p_course uuid default null, p_template uuid default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, certificate_id text, status text, recipient_name text, course_id uuid, course_code text, course_title text,
  template_name text, template_version integer, issued_at timestamptz, issued_by_name text, revoked_at timestamptz, revoke_reason text,
  replaces_certificate_id text, verify_count integer, last_verified_at timestamptz, has_pdf boolean, enrollment_id uuid, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not (public.has_permission('academy.certificates.issue', null) or public.has_permission('academy.certificates.revoke', null)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select c.id, c.certificate_id, c.status, c.snapshot ->> 'recipient_name', c.course_id, c.course_code, c.snapshot ->> 'course_title', t.name, v.version,
         c.issued_at, ib.full_name, c.revoked_at, c.revoke_reason, rp.certificate_id, c.verify_count, c.last_verified_at, c.pdf_key is not null, c.enrollment_id, count(*) over ()
  from public.academy_certificates c
  join public.academy_cert_template_versions v on v.id = c.template_version_id
  join public.academy_cert_templates t on t.id = v.template_id
  left join public.profiles ib on ib.id = c.issued_by
  left join public.academy_certificates rp on rp.id = c.replaces_id
  where (p_status is null or c.status = p_status) and (p_course is null or c.course_id = p_course) and (p_template is null or t.id = p_template)
    and (p_from is null or c.issued_at >= p_from) and (p_to is null or c.issued_at < p_to)
    and (v_q is null or c.certificate_id ilike '%' || v_q || '%' or c.course_code ilike '%' || v_q || '%'
         or (c.snapshot ->> 'recipient_name') ilike '%' || v_q || '%' or (c.snapshot ->> 'course_title') ilike '%' || v_q || '%')
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 5000) offset greatest(p_offset, 0);
end;
$$;
grant execute on function public.academy_admin_certificates(text, text, uuid, uuid, timestamptz, timestamptz, integer, integer) to authenticated;

-- Enrolments that satisfy the criteria and have no certificate yet (for bulk issuing).
create or replace function public.academy_issuable_enrollments(p_course uuid default null, p_limit integer default 200)
returns table (enrollment_id uuid, user_id uuid, full_name text, course_id uuid, course_code text, course_title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('academy.certificates.issue', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select e.id, e.user_id, p.full_name, c.id, c.code, c.title
  from public.academy_enrollments e
  join public.academy_courses c on c.id = e.course_id
  join public.profiles p on p.id = e.user_id
  where e.status in ('active', 'completed') and e.verify_consent_at is not null
    and (p_course is null or e.course_id = p_course)
    and not exists (select 1 from public.academy_certificates ce where ce.enrollment_id = e.id and ce.status in ('issued', 'pending') and ce.replaces_id is null)
    and (not coalesce((c.certificate_criteria ->> 'manual_approval')::boolean, false) or e.certificate_approved_at is not null)
    and (public._academy_completion_state(e.user_id, e.course_id) ->> 'eligible')::boolean
  order by e.completed_at nulls last
  limit least(greatest(p_limit, 1), 500);
end;
$$;
grant execute on function public.academy_issuable_enrollments(uuid, integer) to authenticated;

-- The Academy console's overview. Every figure is counted from stored records; money figures need academy.finance.view.
-- Definitions: gross = successful payments received; refunded = refunds the gateway completed; net = gross - refunded
-- (before gateway fees, which are not recorded here, and before tax, which is included in the figures as charged).
create or replace function public.academy_admin_overview(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 730);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_fin boolean := public.has_permission('academy.finance.view', null);
  v_out jsonb;
begin
  if not public.academy_is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_out := jsonb_build_object(
    'published_courses', (select count(*) from public.academy_courses where status = 'published'),
    'draft_courses', (select count(*) from public.academy_courses where status = 'draft'),
    'active_enrollments', (select count(*) from public.academy_enrollments where status in ('active', 'completed')),
    'new_enrollments', (select count(*) from public.academy_enrollments where enrolled_at >= v_since),
    'completions', (select count(*) from public.academy_enrollments where completed_at >= v_since),
    'completion_rate_pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where status = 'completed' or completed_at is not null) / count(*))::integer end
                              from public.academy_enrollments where status in ('active', 'completed', 'expired')),
    'review_backlog', (select count(*) from public.academy_submissions where status = 'submitted'),
    'certificates_issued', (select count(*) from public.academy_certificates where status = 'issued'),
    'certificates_revoked', (select count(*) from public.academy_certificates where status = 'revoked'),
    'certificates_failed', (select count(*) from public.academy_certificates where status in ('failed', 'pending') and created_at < now() - interval '10 minutes'),
    'upcoming_sessions', (select count(*) from public.academy_live_sessions where status = 'scheduled' and starts_at > now()),
    'coupon_redemptions', (select count(*) from public.academy_coupon_redemptions where status = 'redeemed' and created_at >= v_since),
    'enrollment_series', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'value', n) order by d), '[]'::jsonb)
                            from (select date_trunc('day', enrolled_at)::date as d, count(*) as n from public.academy_enrollments where enrolled_at >= v_since group by 1) t),
    'period_days', v_days);
  if v_fin then
    v_out := v_out || jsonb_build_object(
      'gross_minor', (select coalesce(sum(amount_minor), 0) from public.academy_payments where created_at >= v_since),
      'refunded_minor', (select coalesce(sum(amount_minor), 0) from public.academy_refunds where status = 'completed' and completed_at >= v_since),
      'gross_all_minor', (select coalesce(sum(amount_minor), 0) from public.academy_payments),
      'refunded_all_minor', (select coalesce(sum(amount_minor), 0) from public.academy_refunds where status = 'completed'),
      'pending_orders', (select count(*) from public.academy_orders where status = 'pending' and expires_at > now()),
      'failed_orders', (select count(*) from public.academy_orders where status = 'failed' and created_at >= v_since),
      'open_refunds', (select count(*) from public.academy_refunds where status in ('requested', 'approved')),
      'revenue_series', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'value', n) order by d), '[]'::jsonb)
                           from (select date_trunc('day', created_at)::date as d, sum(amount_minor) as n from public.academy_payments where created_at >= v_since group by 1) t));
  end if;
  return v_out;
end;
$$;
grant execute on function public.academy_admin_overview(integer) to authenticated;

-- Course performance and coupon effectiveness for the analytics page.
create or replace function public.academy_admin_course_report(p_from timestamptz default null, p_to timestamptz default null, p_category uuid default null)
returns table (
  course_id uuid, code text, title text, kind text, status text, enrollments bigint, completions bigint, completion_pct integer,
  avg_score_pct integer, gross_minor bigint, refunded_minor bigint, certificates bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_fin boolean := public.has_permission('academy.finance.view', null);
begin
  if not (public.has_permission('academy.analytics.view', null) or v_fin) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select c.id, c.code, c.title, c.kind, c.status,
         (select count(*) from public.academy_enrollments e where e.course_id = c.id and (p_from is null or e.enrolled_at >= p_from) and (p_to is null or e.enrolled_at < p_to)),
         (select count(*) from public.academy_enrollments e where e.course_id = c.id and e.completed_at is not null and (p_from is null or e.enrolled_at >= p_from) and (p_to is null or e.enrolled_at < p_to)),
         (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where e.completed_at is not null) / count(*))::integer end
            from public.academy_enrollments e where e.course_id = c.id and (p_from is null or e.enrolled_at >= p_from) and (p_to is null or e.enrolled_at < p_to)),
         (select round(avg(s.score_pct))::integer from public.academy_submissions s where s.course_id = c.id and s.status = 'graded'),
         case when v_fin then (select coalesce(sum(p.amount_minor), 0) from public.academy_payments p join public.academy_order_items i on i.order_id = p.order_id where i.course_id = c.id
                                and (p_from is null or p.created_at >= p_from) and (p_to is null or p.created_at < p_to)) end,
         case when v_fin then (select coalesce(sum(r.amount_minor), 0) from public.academy_refunds r join public.academy_order_items i on i.order_id = r.order_id where i.course_id = c.id and r.status = 'completed') end,
         (select count(*) from public.academy_certificates ce where ce.course_id = c.id and ce.status = 'issued')
  from public.academy_courses c
  where p_category is null or c.category_id = p_category
  order by 6 desc nulls last;
end;
$$;
grant execute on function public.academy_admin_course_report(timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.academy_admin_coupon_report()
returns table (coupon_id uuid, code text, active boolean, redeemed bigint, reserved bigint, discount_minor bigint, revenue_minor bigint, usage_limit integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('academy.coupons.manage', null) or public.has_permission('academy.finance.view', null)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select c.id, c.code, c.active,
         count(r.id) filter (where r.status = 'redeemed'), count(r.id) filter (where r.status = 'reserved'),
         coalesce(sum(r.discount_minor) filter (where r.status = 'redeemed'), 0),
         coalesce(sum(o.total_minor) filter (where r.status = 'redeemed' and o.status in ('paid', 'partially_refunded')), 0),
         c.usage_limit
  from public.academy_coupons c
  left join public.academy_coupon_redemptions r on r.coupon_id = c.id
  left join public.academy_orders o on o.id = r.order_id
  group by c.id order by 4 desc, c.code;
end;
$$;
grant execute on function public.academy_admin_coupon_report() to authenticated;

-- The Academy audit log: only actions that start with "academy." (permission academy.audit.view).
create or replace function public.academy_list_audit(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id bigint, created_at timestamptz, actor_id uuid, actor_name text, action text, target_type text, target_id text, metadata jsonb, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.has_permission('academy.audit.view', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select a.id, a.created_at, a.actor_id, p.full_name, a.action, a.target_type, a.target_id, a.metadata, count(*) over ()
  from public.audit_logs a left join public.profiles p on p.id = a.actor_id
  where a.action like 'academy.%' and (v_q is null or a.action ilike '%' || v_q || '%' or a.target_id ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%'
         or (a.metadata ->> 'ref') ilike '%' || v_q || '%')
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end;
$$;
grant execute on function public.academy_list_audit(text, integer, integer) to authenticated;

-- Staff note that a CSV export was downloaded (the file itself is built by the server).
create or replace function public.academy_log_export(p_kind text, p_rows integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('academy.export', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.write_audit_log((select auth.uid()), 'academy.export', 'academy_export', p_kind, null, jsonb_build_object('rows', p_rows));
end;
$$;
grant execute on function public.academy_log_export(text, integer) to authenticated;

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

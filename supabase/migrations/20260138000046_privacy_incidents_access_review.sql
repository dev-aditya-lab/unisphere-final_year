-- 0046: personal data breach response and access reviews (DPDP Act s. 8(6); Rule 7).
-- ---------------------------------------------------------------------------
-- A breach record is internal. Only people holding privacy.incidents can read any of it; nothing is exposed to the
-- public routes or to ordinary logs, and the audit log receives the incident reference only.
--
--   * The 72-hour clock for the detailed report to the Data Protection Board starts at `aware_at`, which is set when
--     staff CONFIRM the breach (never silently).
--   * Notices (to affected members, and drafts for the Board) are written by a person, approved by a person, and only
--     then sent. A notice cannot be approved while the facts it needs are missing, and its drafter cannot approve it
--     unless the privacy_incident_self_approval setting is on.
--   * Nothing is submitted to the Board automatically: the Board has its own channel. The app prepares the report and
--     records when a person submitted it and under which reference.
--   * The timeline is append-only.
-- ---------------------------------------------------------------------------

create sequence public.privacy_incident_seq;

create table public.privacy_incidents (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  title text not null check (char_length(title) between 3 and 160),
  status text not null default 'suspected'
    check (status in ('suspected', 'investigating', 'contained', 'confirmed', 'notified', 'resolved', 'closed', 'not_a_breach')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  detected_at timestamptz not null,
  aware_at timestamptz,
  occurred_at timestamptz,
  occurred_note text check (occurred_note is null or char_length(occurred_note) <= 500),
  description text check (description is null or char_length(description) <= 4000),
  systems text[] not null default '{}',
  data_categories text[] not null default '{}',
  affected_count_estimate integer check (affected_count_estimate is null or affected_count_estimate >= 0),
  containment text check (containment is null or char_length(containment) <= 4000),
  root_cause text check (root_cause is null or char_length(root_cause) <= 4000),
  remediation text check (remediation is null or char_length(remediation) <= 4000),
  findings_on_person text check (findings_on_person is null or char_length(findings_on_person) <= 2000),
  board_initial_at timestamptz,
  board_detailed_at timestamptz,
  board_reference text check (board_reference is null or char_length(board_reference) <= 120),
  principals_notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index privacy_incidents_status_idx on public.privacy_incidents(status, created_at desc);
create trigger trg_privacy_incidents_updated before update on public.privacy_incidents
  for each row execute function public.set_updated_at();

create table public.privacy_incident_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.privacy_incidents(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('created', 'status', 'note', 'evidence', 'containment', 'assessment', 'notice', 'approval', 'submission')),
  body text check (body is null or char_length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index privacy_incident_events_idx on public.privacy_incident_events(incident_id, id);
create trigger trg_privacy_incident_events_immutable before update or delete on public.privacy_incident_events
  for each row execute function public.privacy_immutable_except_actor('actor_id');

create table public.privacy_incident_affected (
  incident_id uuid not null references public.privacy_incidents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notified_at timestamptz,
  primary key (incident_id, user_id)
);

create table public.privacy_incident_notices (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.privacy_incidents(id) on delete cascade,
  audience text not null check (audience in ('principals', 'board_initial', 'board_detailed')),
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null check (char_length(body) between 40 and 8000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  drafted_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id, audience)
);
create trigger trg_privacy_incident_notices_updated before update on public.privacy_incident_notices
  for each row execute function public.set_updated_at();

alter table public.privacy_incidents enable row level security;
alter table public.privacy_incident_events enable row level security;
alter table public.privacy_incident_affected enable row level security;
alter table public.privacy_incident_notices enable row level security;
grant select on public.privacy_incidents, public.privacy_incident_events, public.privacy_incident_affected, public.privacy_incident_notices to authenticated;
create policy privacy_incidents_staff on public.privacy_incidents for select to authenticated using (public.has_permission('privacy.incidents', null));
create policy privacy_incident_events_staff on public.privacy_incident_events for select to authenticated using (public.has_permission('privacy.incidents', null));
create policy privacy_incident_affected_staff on public.privacy_incident_affected for select to authenticated using (public.has_permission('privacy.incidents', null));
create policy privacy_incident_notices_staff on public.privacy_incident_notices for select to authenticated using (public.has_permission('privacy.incidents', null));

-- ── Functions ───────────────────────────────────────────────────────────────
create or replace function public.create_privacy_incident(
  p_title text, p_severity text, p_detected_at timestamptz, p_description text, p_systems text[], p_categories text[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_incidents;
  v_ref text := 'INC-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('public.privacy_incident_seq')::text, 4, '0');
begin
  if not public.has_permission('privacy.incidents', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_detected_at > now() + interval '5 minutes' then raise exception 'invalid_value' using errcode = '22023'; end if;
  insert into public.privacy_incidents(reference, title, severity, detected_at, description, systems, data_categories, created_by)
  values (v_ref, trim(p_title), p_severity, p_detected_at, nullif(trim(coalesce(p_description, '')), ''), coalesce(p_systems, '{}'), coalesce(p_categories, '{}'), v_uid)
  returning * into v_row;
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body) values (v_row.id, v_uid, 'created', 'Incident opened as suspected.');
  perform public.write_audit_log(v_uid, 'privacy.incident.created', 'privacy_incident', v_row.reference, null, jsonb_build_object('severity', p_severity));
  return jsonb_build_object('id', v_row.id, 'reference', v_row.reference);
end;
$$;
revoke execute on function public.create_privacy_incident(text, text, timestamptz, text, text[], text[]) from public, anon;
grant execute on function public.create_privacy_incident(text, text, timestamptz, text, text[], text[]) to authenticated;

create or replace function public.update_privacy_incident(p_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_incidents;
  v_key text;
  v_allowed constant text[] := array['title', 'severity', 'description', 'occurred_at', 'occurred_note', 'systems', 'data_categories',
    'affected_count_estimate', 'containment', 'root_cause', 'remediation', 'findings_on_person', 'board_reference', 'aware_at'];
begin
  if not public.has_permission('privacy.incidents', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_row from public.privacy_incidents where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.status in ('closed', 'not_a_breach') then raise exception 'invalid_state' using errcode = '22023'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key <> all (v_allowed) then raise exception 'invalid_field' using errcode = '22023'; end if;
  end loop;
  -- aware_at can only be corrected once the breach is confirmed; it is what starts the 72-hour clock.
  if p_patch ? 'aware_at' and v_row.aware_at is null then raise exception 'invalid_state' using errcode = '22023'; end if;
  update public.privacy_incidents set
    title = coalesce(nullif(trim(p_patch ->> 'title'), ''), title),
    severity = coalesce(p_patch ->> 'severity', severity),
    description = case when p_patch ? 'description' then nullif(trim(p_patch ->> 'description'), '') else description end,
    occurred_at = case when p_patch ? 'occurred_at' then nullif(p_patch ->> 'occurred_at', '')::timestamptz else occurred_at end,
    occurred_note = case when p_patch ? 'occurred_note' then nullif(trim(p_patch ->> 'occurred_note'), '') else occurred_note end,
    systems = case when p_patch ? 'systems' then array(select jsonb_array_elements_text(p_patch -> 'systems')) else systems end,
    data_categories = case when p_patch ? 'data_categories' then array(select jsonb_array_elements_text(p_patch -> 'data_categories')) else data_categories end,
    affected_count_estimate = case when p_patch ? 'affected_count_estimate' then nullif(p_patch ->> 'affected_count_estimate', '')::integer else affected_count_estimate end,
    containment = case when p_patch ? 'containment' then nullif(trim(p_patch ->> 'containment'), '') else containment end,
    root_cause = case when p_patch ? 'root_cause' then nullif(trim(p_patch ->> 'root_cause'), '') else root_cause end,
    remediation = case when p_patch ? 'remediation' then nullif(trim(p_patch ->> 'remediation'), '') else remediation end,
    findings_on_person = case when p_patch ? 'findings_on_person' then nullif(trim(p_patch ->> 'findings_on_person'), '') else findings_on_person end,
    board_reference = case when p_patch ? 'board_reference' then nullif(trim(p_patch ->> 'board_reference'), '') else board_reference end,
    aware_at = case when p_patch ? 'aware_at' then (p_patch ->> 'aware_at')::timestamptz else aware_at end
  where id = p_id;
  -- Notices already approved were approved against the old facts.
  update public.privacy_incident_notices set status = 'draft', approved_by = null, approved_at = null
    where incident_id = p_id and status = 'approved';
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body)
  values (p_id, v_uid, 'assessment', 'Updated: ' || (select string_agg(k, ', ') from jsonb_object_keys(p_patch) k));
  perform public.write_audit_log(v_uid, 'privacy.incident.updated', 'privacy_incident', v_row.reference, null, '{}'::jsonb);
end;
$$;
revoke execute on function public.update_privacy_incident(uuid, jsonb) from public, anon;
grant execute on function public.update_privacy_incident(uuid, jsonb) to authenticated;

create or replace function public.set_privacy_incident_status(p_id uuid, p_to text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_incidents;
  v_ok boolean;
begin
  if not public.has_permission('privacy.incidents', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_row from public.privacy_incidents where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_ok := case v_row.status
    when 'suspected' then p_to in ('investigating', 'confirmed', 'not_a_breach')
    when 'investigating' then p_to in ('contained', 'confirmed', 'not_a_breach')
    when 'contained' then p_to in ('investigating', 'confirmed', 'not_a_breach')
    when 'confirmed' then p_to in ('notified', 'resolved')
    when 'notified' then p_to = 'resolved'
    when 'resolved' then p_to = 'closed'
    else false end;
  if not v_ok then raise exception 'invalid_state' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_to = 'notified' and v_row.board_initial_at is null and v_row.principals_notified_at is null then
    raise exception 'nothing_sent' using errcode = '22023';
  end if;
  update public.privacy_incidents set status = p_to,
    aware_at = case when p_to = 'confirmed' then coalesce(aware_at, now()) else aware_at end,
    closed_at = case when p_to in ('closed', 'not_a_breach') then now() else closed_at end
  where id = p_id;
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body) values (p_id, v_uid, 'status', p_to || ': ' || trim(p_note));
  perform public.write_audit_log(v_uid, 'privacy.incident.status', 'privacy_incident', v_row.reference, null, jsonb_build_object('to', p_to));
end;
$$;
revoke execute on function public.set_privacy_incident_status(uuid, text, text) from public, anon;
grant execute on function public.set_privacy_incident_status(uuid, text, text) to authenticated;

create or replace function public.add_privacy_incident_event(p_id uuid, p_kind text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_ref text;
begin
  if not public.has_permission('privacy.incidents', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('note', 'evidence', 'containment') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 3 or char_length(p_body) > 4000 then raise exception 'invalid_value' using errcode = '22023'; end if;
  select reference into v_ref from public.privacy_incidents where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body) values (p_id, v_uid, p_kind, trim(p_body));
end;
$$;
revoke execute on function public.add_privacy_incident_event(uuid, text, text) from public, anon;
grant execute on function public.add_privacy_incident_event(uuid, text, text) to authenticated;

create or replace function public.add_privacy_incident_affected(p_id uuid, p_user_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_n integer;
begin
  if not public.has_permission('privacy.incidents', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.privacy_incidents where id = p_id and status not in ('closed', 'not_a_breach')) then raise exception 'invalid_state' using errcode = '22023'; end if;
  if coalesce(array_length(p_user_ids, 1), 0) between 1 and 5000 is not true then raise exception 'invalid_rows' using errcode = '22023'; end if;
  insert into public.privacy_incident_affected(incident_id, user_id)
  select p_id, p.id from public.profiles p where p.id = any (p_user_ids)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body) values (p_id, v_uid, 'assessment', v_n || ' affected member(s) added.');
  return v_n;
end;
$$;
revoke execute on function public.add_privacy_incident_affected(uuid, uuid[]) from public, anon;
grant execute on function public.add_privacy_incident_affected(uuid, uuid[]) to authenticated;

create or replace function public.save_privacy_incident_notice(p_id uuid, p_audience text, p_subject text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_nid uuid; v_inc public.privacy_incidents;
begin
  if not public.has_permission('privacy.incidents', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_inc from public.privacy_incidents where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_inc.status in ('closed', 'not_a_breach') then raise exception 'invalid_state' using errcode = '22023'; end if;
  if exists (select 1 from public.privacy_incident_notices where incident_id = p_id and audience = p_audience and status = 'sent') then
    raise exception 'already_sent' using errcode = '22023';
  end if;
  insert into public.privacy_incident_notices(incident_id, audience, subject, body, drafted_by)
  values (p_id, p_audience, trim(p_subject), trim(p_body), v_uid)
  on conflict (incident_id, audience) do update set subject = excluded.subject, body = excluded.body, drafted_by = v_uid,
    status = 'draft', approved_by = null, approved_at = null
  returning id into v_nid;
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body) values (p_id, v_uid, 'notice', 'Draft saved: ' || p_audience);
  return v_nid;
end;
$$;
revoke execute on function public.save_privacy_incident_notice(uuid, text, text, text) from public, anon;
grant execute on function public.save_privacy_incident_notice(uuid, text, text, text) to authenticated;

-- A notice may not be approved while the facts it must state are missing.
create or replace function public._incident_missing_facts(p_incident public.privacy_incidents, p_audience text)
returns text[] language plpgsql stable set search_path = '' as $$
declare v_missing text[] := '{}';
begin
  if p_incident.aware_at is null then v_missing := array_append(v_missing, 'confirmation (the breach must be confirmed first)'::text); end if;
  if coalesce(p_incident.description, '') = '' then v_missing := array_append(v_missing, 'description'::text); end if;
  if coalesce(array_length(p_incident.data_categories, 1), 0) = 0 then v_missing := array_append(v_missing, 'data categories'::text); end if;
  if p_incident.occurred_at is null and coalesce(p_incident.occurred_note, '') = '' then v_missing := array_append(v_missing, 'when it happened'::text); end if;
  if coalesce(p_incident.containment, '') = '' and coalesce(p_incident.remediation, '') = '' then v_missing := array_append(v_missing, 'measures taken (containment or remediation)'::text); end if;
  if p_audience = 'principals' and not exists (select 1 from public.privacy_incident_affected a where a.incident_id = p_incident.id) then
    v_missing := array_append(v_missing, 'the list of affected members'::text);
  end if;
  if p_audience = 'board_detailed' and coalesce(p_incident.root_cause, '') = '' then v_missing := array_append(v_missing, 'reasons for the breach (root cause)'::text); end if;
  return v_missing;
end;
$$;

create or replace function public.approve_privacy_incident_notice(p_notice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_n public.privacy_incident_notices;
  v_inc public.privacy_incidents;
  v_missing text[];
  v_self boolean := coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'privacy_incident_self_approval'), false);
begin
  if not public.has_permission('privacy.incidents.approve', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_n from public.privacy_incident_notices where id = p_notice_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_n.status <> 'draft' then raise exception 'invalid_state' using errcode = '22023'; end if;
  if v_n.drafted_by = v_uid and not v_self then raise exception 'cannot_review_own_request' using errcode = '42501'; end if;
  select * into v_inc from public.privacy_incidents where id = v_n.incident_id;
  v_missing := public._incident_missing_facts(v_inc, v_n.audience);
  -- Drafts are generated with [to be completed: ...] markers wherever a fact is not in the record. None may remain.
  if v_n.body ~* '\[to be completed' or v_n.subject ~* '\[to be completed' then v_missing := array_append(v_missing, 'text still marked [to be completed]'::text); end if;
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'incident_facts_missing: %', array_to_string(v_missing, ', ') using errcode = '22023';
  end if;
  update public.privacy_incident_notices set status = 'approved', approved_by = v_uid, approved_at = now() where id = p_notice_id;
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body) values (v_n.incident_id, v_uid, 'approval', 'Approved: ' || v_n.audience);
  perform public.write_audit_log(v_uid, 'privacy.incident.notice_approved', 'privacy_incident', v_inc.reference, null, jsonb_build_object('audience', v_n.audience));
end;
$$;
revoke execute on function public.approve_privacy_incident_notice(uuid) from public, anon;
grant execute on function public.approve_privacy_incident_notice(uuid) to authenticated;

-- Recorded AFTER a person has submitted the Board report, or after the server has delivered the member notices.
create or replace function public.mark_privacy_incident_notice_sent(p_notice_id uuid, p_reference text, p_user_ids uuid[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_n public.privacy_incident_notices;
  v_inc public.privacy_incidents;
begin
  if not public.has_permission('privacy.incidents', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_n from public.privacy_incident_notices where id = p_notice_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_n.status <> 'approved' then raise exception 'invalid_state' using errcode = '22023'; end if;
  select * into v_inc from public.privacy_incidents where id = v_n.incident_id for update;
  update public.privacy_incident_notices set status = 'sent', sent_at = now() where id = p_notice_id;
  update public.privacy_incidents set
    board_initial_at = case when v_n.audience = 'board_initial' then now() else board_initial_at end,
    board_detailed_at = case when v_n.audience = 'board_detailed' then now() else board_detailed_at end,
    board_reference = case when v_n.audience like 'board%' and nullif(trim(coalesce(p_reference, '')), '') is not null then trim(p_reference) else board_reference end,
    principals_notified_at = case when v_n.audience = 'principals' then now() else principals_notified_at end
  where id = v_n.incident_id;
  if v_n.audience = 'principals' and p_user_ids is not null then
    update public.privacy_incident_affected set notified_at = now() where incident_id = v_n.incident_id and user_id = any (p_user_ids);
  end if;
  insert into public.privacy_incident_events(incident_id, actor_id, kind, body)
  values (v_n.incident_id, v_uid, 'submission', 'Sent: ' || v_n.audience);
  perform public.write_audit_log(v_uid, 'privacy.incident.notice_sent', 'privacy_incident', v_inc.reference, null, jsonb_build_object('audience', v_n.audience));
end;
$$;
revoke execute on function public.mark_privacy_incident_notice_sent(uuid, text, uuid[]) from public, anon;
grant execute on function public.mark_privacy_incident_notice_sent(uuid, text, uuid[]) to authenticated;

-- ── Access and permission reviews ───────────────────────────────────────────
create table public.privacy_access_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 2000),
  snapshot jsonb not null
);
alter table public.privacy_access_reviews enable row level security;
grant select on public.privacy_access_reviews to authenticated;
create policy privacy_access_reviews_staff on public.privacy_access_reviews for select to authenticated using (public.has_permission('privacy.manage', null));
create trigger trg_privacy_access_reviews_immutable before update or delete on public.privacy_access_reviews
  for each row execute function public.privacy_immutable_except_actor('reviewed_by');

create or replace function public.privacy_access_snapshot()
returns table (user_id uuid, username text, full_name text, role text, college_name text, granted_at timestamptz, granted_by_username text, last_sign_in_at timestamptz, permissions text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('privacy.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select ur.user_id, p.username, p.full_name, ur.role, c.name, ur.created_at, g.username, u.last_sign_in_at,
         coalesce((select array_agg(rp.permission order by rp.permission) from public.role_permissions rp where rp.role = ur.role and rp.permission like 'privacy.%'), '{}')
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  left join auth.users u on u.id = ur.user_id
  left join public.colleges c on c.id = ur.college_id
  left join public.profiles g on g.id = ur.granted_by
  order by (ur.role = 'privacy_officer') desc, ur.role, p.username;
end;
$$;
revoke execute on function public.privacy_access_snapshot() from public, anon;
grant execute on function public.privacy_access_snapshot() to authenticated;

create or replace function public.record_privacy_access_review(p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_snap jsonb;
begin
  if not public.has_permission('privacy.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('username', s.username, 'role', s.role, 'college', s.college_name, 'granted_at', s.granted_at)), '[]'::jsonb)
    into v_snap from public.privacy_access_snapshot() s;
  insert into public.privacy_access_reviews(reviewed_by, notes, snapshot) values (v_uid, nullif(trim(coalesce(p_notes, '')), ''), v_snap) returning id into v_id;
  perform public.write_audit_log(v_uid, 'privacy.access_review.recorded', 'access_review', v_id::text, null, '{}'::jsonb);
  return v_id;
end;
$$;
revoke execute on function public.record_privacy_access_review(text) from public, anon;
grant execute on function public.record_privacy_access_review(text) to authenticated;

-- 0044: privacy requests, grievances and nominations (DPDP Act ss. 11-14).
-- ---------------------------------------------------------------------------
-- One record per request, with a status history that members can read (staff notes stay staff-only).
--   * Members create requests through SECURITY DEFINER functions that take the identity from the session, so a
--     request can never be filed on someone else's behalf. There is no INSERT / UPDATE grant on any table here.
--   * Visitors (people without an account) can file a grievance; they track it with the reference plus a secret
--     code that is shown once and stored only as a hash. Those two functions are service-role only.
--   * Staff act through staff_update_privacy_request(): it checks the permission, locks the row, validates the
--     transition, requires a lawful reason when a request is not fully met, and writes the history and the audit log.
--   * Staff cannot work on their own request, and the audit log stores references, never request text.
--   * Closed requests are anonymised after the retention window (see 0045), keeping the reference, kind, status and dates.
-- ---------------------------------------------------------------------------

create sequence public.privacy_request_seq;

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  kind text not null check (kind in ('access', 'correction', 'erasure', 'nomination', 'grievance', 'other')),
  user_id uuid references public.profiles(id) on delete set null,
  channel text not null default 'member' check (channel in ('member', 'visitor')),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  subject text not null check (char_length(subject) between 3 and 140),
  details text check (details is null or char_length(details) <= 4000),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'verifying', 'in_progress', 'awaiting_requester', 'completed', 'partially_completed', 'rejected', 'cancelled')),
  outcome_reason text check (outcome_reason is null or char_length(outcome_reason) <= 1000),
  due_at timestamptz not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  tracking_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  anonymised_at timestamptz,
  check (channel = 'member' or (kind = 'grievance' and tracking_hash is not null)),
  check (channel = 'member' or contact_email is not null or anonymised_at is not null)
);
create index privacy_requests_user_idx on public.privacy_requests(user_id, created_at desc);
create index privacy_requests_queue_idx on public.privacy_requests(status, due_at);
create index privacy_requests_kind_idx on public.privacy_requests(kind, status);
-- One open request of these kinds per member: a double click or a second tab cannot create a duplicate.
create unique index privacy_requests_open_once_idx on public.privacy_requests(user_id, kind)
  where user_id is not null and kind in ('access', 'erasure', 'nomination')
    and status in ('received', 'verifying', 'in_progress', 'awaiting_requester');
create trigger trg_privacy_requests_updated before update on public.privacy_requests
  for each row execute function public.set_updated_at();

create table public.privacy_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.privacy_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_kind text not null check (actor_kind in ('requester', 'staff', 'system')),
  from_status text,
  to_status text not null,
  visibility text not null default 'requester' check (visibility in ('requester', 'staff')),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index privacy_request_events_req_idx on public.privacy_request_events(request_id, id);
create trigger trg_privacy_request_events_immutable before update or delete on public.privacy_request_events
  for each row execute function public.privacy_immutable_except_actor('actor_id');

alter table public.privacy_requests enable row level security;
alter table public.privacy_request_events enable row level security;
grant select on public.privacy_requests, public.privacy_request_events to authenticated;

create policy privacy_requests_select on public.privacy_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('privacy.requests', null));
create policy privacy_request_events_select on public.privacy_request_events for select to authenticated
  using (
    public.has_permission('privacy.requests', null)
    or (visibility = 'requester' and exists (select 1 from public.privacy_requests r where r.id = request_id and r.user_id = (select auth.uid())))
  );

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.privacy_response_days(p_kind text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (value ->> p_kind)::integer from public.system_settings where key = 'privacy_response_days'), 30);
$$;
revoke execute on function public.privacy_response_days(text) from public, anon, authenticated;

create or replace function public._new_privacy_request(
  p_kind text, p_user uuid, p_channel text, p_name text, p_email text, p_subject text, p_details text, p_payload jsonb,
  p_status text, p_tracking_hash text, p_note text
) returns public.privacy_requests language plpgsql security definer set search_path = '' as $$
declare
  v_row public.privacy_requests;
  v_prefix text := case p_kind when 'grievance' then 'GR' else 'PR' end;
  v_ref text := v_prefix || '-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('public.privacy_request_seq')::text, 6, '0');
begin
  insert into public.privacy_requests(reference, kind, user_id, channel, contact_name, contact_email, subject, details, payload, status,
                                      due_at, tracking_hash, closed_at)
  values (v_ref, p_kind, p_user, p_channel, p_name, p_email, p_subject, p_details, coalesce(p_payload, '{}'::jsonb), p_status,
          now() + make_interval(days => public.privacy_response_days(p_kind)), p_tracking_hash,
          case when p_status in ('completed', 'partially_completed', 'rejected', 'cancelled') then now() end)
  returning * into v_row;
  insert into public.privacy_request_events(request_id, actor_id, actor_kind, to_status, visibility, note)
  values (v_row.id, p_user, case when p_channel = 'member' and p_status = 'received' then 'requester' else 'system' end, 'received', 'requester', 'Request received.');
  if p_status <> 'received' then
    insert into public.privacy_request_events(request_id, actor_kind, from_status, to_status, visibility, note)
    values (v_row.id, 'system', 'received', p_status, 'requester', p_note);
  end if;
  perform public.write_audit_log(p_user, 'privacy.request.created', 'privacy_request', v_row.reference, null, jsonb_build_object('kind', p_kind));
  return v_row;
end;
$$;
revoke execute on function public._new_privacy_request(text, uuid, text, text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;

-- ── Member requests ─────────────────────────────────────────────────────────
create or replace function public.submit_privacy_request(p_kind text, p_subject text, p_details text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_requests;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and status in ('active', 'restricted')) then
    raise exception 'target_unavailable' using errcode = '22023';
  end if;
  if p_kind not in ('correction', 'grievance', 'other') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_subject, ''))) < 3 or char_length(p_subject) > 140 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_details, ''))) < 10 or char_length(p_details) > 4000 then raise exception 'invalid_details' using errcode = '22023'; end if;
  if (select count(*) from public.privacy_requests where user_id = v_uid and status in ('received', 'verifying', 'in_progress', 'awaiting_requester')) >= 5 then
    raise exception 'too_many_open' using errcode = '22023';
  end if;
  v_row := public._new_privacy_request(p_kind, v_uid, 'member', null, null, trim(p_subject), trim(p_details), p_payload, 'received', null, null);
  return jsonb_build_object('id', v_row.id, 'reference', v_row.reference, 'due_at', v_row.due_at);
end;
$$;
revoke execute on function public.submit_privacy_request(text, text, text, jsonb) from public, anon;
grant execute on function public.submit_privacy_request(text, text, text, jsonb) to authenticated;

-- Instant, self-service fulfilment (the data download). Service role: it is called only after the operation succeeded.
create or replace function public.record_completed_request(p_user uuid, p_kind text, p_subject text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.privacy_requests;
begin
  if p_kind not in ('access') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  v_row := public._new_privacy_request(p_kind, p_user, 'member', null, null, p_subject, null, '{}'::jsonb, 'completed', null, p_note);
  return jsonb_build_object('id', v_row.id, 'reference', v_row.reference);
end;
$$;
revoke execute on function public.record_completed_request(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_completed_request(uuid, text, text, text) to service_role;

create or replace function public.cancel_my_privacy_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_requests;
begin
  select * into v_row from public.privacy_requests where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.kind = 'erasure' then raise exception 'use_account_deletion' using errcode = '22023'; end if;
  if v_row.status not in ('received', 'verifying', 'in_progress', 'awaiting_requester') then raise exception 'invalid_state' using errcode = '22023'; end if;
  update public.privacy_requests set status = 'cancelled', closed_at = now() where id = p_id;
  insert into public.privacy_request_events(request_id, actor_id, actor_kind, from_status, to_status, note)
  values (p_id, v_uid, 'requester', v_row.status, 'cancelled', 'Withdrawn by the requester.');
  perform public.write_audit_log(v_uid, 'privacy.request.cancelled', 'privacy_request', v_row.reference, null, '{}'::jsonb);
end;
$$;
revoke execute on function public.cancel_my_privacy_request(uuid) from public, anon;
grant execute on function public.cancel_my_privacy_request(uuid) to authenticated;

-- The requester answers a question from staff, or adds information. Visible to staff, and to the requester.
create or replace function public.add_privacy_request_message(p_id uuid, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_requests;
begin
  if char_length(trim(coalesce(p_message, ''))) < 2 or char_length(p_message) > 2000 then raise exception 'invalid_details' using errcode = '22023'; end if;
  select * into v_row from public.privacy_requests where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.status not in ('received', 'verifying', 'in_progress', 'awaiting_requester') then raise exception 'invalid_state' using errcode = '22023'; end if;
  insert into public.privacy_request_events(request_id, actor_id, actor_kind, from_status, to_status, note)
  values (p_id, v_uid, 'requester', v_row.status, case when v_row.status = 'awaiting_requester' then 'in_progress' else v_row.status end, trim(p_message));
  if v_row.status = 'awaiting_requester' then update public.privacy_requests set status = 'in_progress' where id = p_id; end if;
end;
$$;
revoke execute on function public.add_privacy_request_message(uuid, text) from public, anon;
grant execute on function public.add_privacy_request_message(uuid, text) to authenticated;

-- ── Visitor grievances ──────────────────────────────────────────────────────
create or replace function public.submit_visitor_grievance(p_name text, p_email text, p_subject text, p_details text, p_tracking_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.privacy_requests;
begin
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_subject, ''))) < 3 or char_length(p_subject) > 140 then raise exception 'invalid_subject' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_details, ''))) < 10 or char_length(p_details) > 4000 then raise exception 'invalid_details' using errcode = '22023'; end if;
  if p_tracking_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_key' using errcode = '22023'; end if;
  -- A flood from one address is refused here as well as by the rate limiter.
  if (select count(*) from public.privacy_requests where channel = 'visitor' and lower(contact_email) = lower(p_email)
        and status in ('received', 'verifying', 'in_progress', 'awaiting_requester')) >= 3 then
    raise exception 'too_many_open' using errcode = '22023';
  end if;
  v_row := public._new_privacy_request('grievance', null, 'visitor', nullif(trim(p_name), ''), lower(trim(p_email)), trim(p_subject), trim(p_details), '{}'::jsonb, 'received', p_tracking_hash, null);
  return jsonb_build_object('reference', v_row.reference, 'due_at', v_row.due_at);
end;
$$;
revoke execute on function public.submit_visitor_grievance(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_visitor_grievance(text, text, text, text, text) to service_role;

-- Status for a visitor: only the status, the dates and what staff chose to tell them. Never the request text.
create or replace function public.track_visitor_grievance(p_reference text, p_tracking_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_row public.privacy_requests;
begin
  select * into v_row from public.privacy_requests
  where reference = upper(trim(p_reference)) and channel = 'visitor' and tracking_hash = p_tracking_hash;
  if not found then return null; end if;
  return jsonb_build_object(
    'reference', v_row.reference, 'status', v_row.status, 'created_at', v_row.created_at, 'due_at', v_row.due_at,
    'closed_at', v_row.closed_at, 'outcome_reason', v_row.outcome_reason,
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.created_at, 'status', e.to_status, 'note', e.note) order by e.id)
                        from public.privacy_request_events e where e.request_id = v_row.id and e.visibility = 'requester'), '[]'::jsonb));
end;
$$;
revoke execute on function public.track_visitor_grievance(text, text) from public, anon, authenticated;
grant execute on function public.track_visitor_grievance(text, text) to service_role;

-- ── Staff handling ──────────────────────────────────────────────────────────
create or replace function public.staff_update_privacy_request(
  p_id uuid, p_to_status text, p_note_requester text, p_note_internal text, p_outcome_reason text, p_assign boolean default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_requests;
  v_open constant text[] := array['received', 'verifying', 'in_progress', 'awaiting_requester'];
  v_closed constant text[] := array['completed', 'partially_completed', 'rejected'];
begin
  if not public.has_permission('privacy.requests', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_row from public.privacy_requests where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.user_id = v_uid then raise exception 'cannot_review_own_request' using errcode = '42501'; end if;
  if v_row.status <> all (v_open) then raise exception 'already_decided' using errcode = '22023'; end if;
  if p_to_status is not null and p_to_status <> all (v_open || v_closed) then raise exception 'invalid_decision' using errcode = '22023'; end if;
  -- An erasure is finished by the system when the data is really gone; staff can only reject it (for a stated reason).
  if v_row.kind = 'erasure' and p_to_status in ('completed', 'partially_completed') then raise exception 'invalid_state' using errcode = '22023'; end if;
  if p_to_status in ('partially_completed', 'rejected') and char_length(trim(coalesce(p_outcome_reason, ''))) < 10 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_to_status = 'completed' and char_length(trim(coalesce(p_note_requester, ''))) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;

  update public.privacy_requests set
    status = coalesce(p_to_status, status),
    outcome_reason = case when p_to_status in ('partially_completed', 'rejected') then trim(p_outcome_reason) else outcome_reason end,
    closed_at = case when p_to_status = any (v_closed) then now() else closed_at end,
    assigned_to = case when p_assign is true then v_uid when p_assign is false then null else assigned_to end
  where id = p_id;

  if p_to_status is not null or nullif(trim(coalesce(p_note_requester, '')), '') is not null then
    insert into public.privacy_request_events(request_id, actor_id, actor_kind, from_status, to_status, visibility, note)
    values (p_id, v_uid, 'staff', v_row.status, coalesce(p_to_status, v_row.status), 'requester',
            coalesce(nullif(trim(coalesce(p_note_requester, '')), ''), case when p_to_status is not null then 'Status changed.' end));
  end if;
  if nullif(trim(coalesce(p_note_internal, '')), '') is not null then
    insert into public.privacy_request_events(request_id, actor_id, actor_kind, from_status, to_status, visibility, note)
    values (p_id, v_uid, 'staff', v_row.status, coalesce(p_to_status, v_row.status), 'staff', trim(p_note_internal));
  end if;
  perform public.write_audit_log(v_uid, 'privacy.request.updated', 'privacy_request', v_row.reference, null,
    jsonb_build_object('kind', v_row.kind, 'to', coalesce(p_to_status, v_row.status)));
end;
$$;
revoke execute on function public.staff_update_privacy_request(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.staff_update_privacy_request(uuid, text, text, text, text, boolean) to authenticated;

-- The list a privacy officer works from. Requester identity is limited to what is needed to find the account.
create or replace function public.list_privacy_requests(p_status text default 'open', p_kind text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, reference text, kind text, channel text, status text, subject text, due_at timestamptz, created_at timestamptz,
  closed_at timestamptz, overdue boolean, requester_username text, assigned_to uuid, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('privacy.requests', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select r.id, r.reference, r.kind, r.channel, r.status, r.subject, r.due_at, r.created_at, r.closed_at,
         (r.closed_at is null and r.due_at < now()), p.username, r.assigned_to, count(*) over ()
  from public.privacy_requests r left join public.profiles p on p.id = r.user_id
  where (p_kind is null or r.kind = p_kind)
    and case p_status
          when 'open' then r.status in ('received', 'verifying', 'in_progress', 'awaiting_requester')
          when 'overdue' then r.closed_at is null and r.due_at < now()
          when 'closed' then r.status in ('completed', 'partially_completed', 'rejected', 'cancelled')
          else true end
  order by (r.closed_at is null) desc, r.due_at asc, r.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;
revoke execute on function public.list_privacy_requests(text, text, integer, integer) from public, anon;
grant execute on function public.list_privacy_requests(text, text, integer, integer) to authenticated;

create or replace function public.privacy_request_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.privacy_requests;
  v_who jsonb;
begin
  if not public.has_permission('privacy.requests', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_row from public.privacy_requests where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_row.user_id is not null then
    select jsonb_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'email', u.email, 'joined', p.created_at, 'status', p.status)
      into v_who from public.profiles p join auth.users u on u.id = p.id where p.id = v_row.user_id;
  end if;
  perform public.write_audit_log((select auth.uid()), 'privacy.request.viewed', 'privacy_request', v_row.reference, null, '{}'::jsonb);
  return jsonb_build_object(
    'request', to_jsonb(v_row) - 'tracking_hash',
    'requester', coalesce(v_who, jsonb_build_object('email', v_row.contact_email, 'full_name', v_row.contact_name)),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.privacy_request_events e where e.request_id = v_row.id), '[]'::jsonb));
end;
$$;
revoke execute on function public.privacy_request_detail(uuid) from public, anon;
grant execute on function public.privacy_request_detail(uuid) to authenticated;

create or replace function public.privacy_request_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('privacy.requests', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'open', (select count(*) from public.privacy_requests where closed_at is null),
    'overdue', (select count(*) from public.privacy_requests where closed_at is null and due_at < now()),
    'due_soon', (select count(*) from public.privacy_requests where closed_at is null and due_at >= now() and due_at < now() + interval '3 days'),
    'grievances_open', (select count(*) from public.privacy_requests where closed_at is null and kind = 'grievance'));
end;
$$;
revoke execute on function public.privacy_request_counts() from public, anon;
grant execute on function public.privacy_request_counts() to authenticated;

-- ── Nomination (s. 14): someone who may exercise the member's rights if they die or become incapable ──
create table public.privacy_nominations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nominee_name text not null check (char_length(nominee_name) between 2 and 120),
  nominee_email text not null check (char_length(nominee_email) <= 254 and nominee_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  relationship text check (relationship is null or char_length(relationship) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.privacy_nominations enable row level security;
grant select on public.privacy_nominations to authenticated;
create policy privacy_nominations_select on public.privacy_nominations for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('privacy.requests', null));

create or replace function public.set_my_nomination(p_name text, p_email text, p_relationship text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.privacy_requests;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 or char_length(p_name) > 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'invalid_email' using errcode = '22023'; end if;
  if v_email = lower((select email from auth.users where id = v_uid)) then raise exception 'invalid_email' using errcode = '22023'; end if;
  insert into public.privacy_nominations(user_id, nominee_name, nominee_email, relationship)
  values (v_uid, trim(p_name), v_email, nullif(trim(coalesce(p_relationship, '')), ''))
  on conflict (user_id) do update set nominee_name = excluded.nominee_name, nominee_email = excluded.nominee_email,
    relationship = excluded.relationship, updated_at = now();
  v_row := public._new_privacy_request('nomination', v_uid, 'member', null, null, 'Nomination recorded', null, '{}'::jsonb, 'completed', null,
                                       'Your nomination was recorded. UniSphere does not contact the person you named; please tell them yourself.');
  return jsonb_build_object('reference', v_row.reference);
end;
$$;
revoke execute on function public.set_my_nomination(text, text, text) from public, anon;
grant execute on function public.set_my_nomination(text, text, text) to authenticated;

create or replace function public.revoke_my_nomination()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_row public.privacy_requests;
begin
  delete from public.privacy_nominations where user_id = v_uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_row := public._new_privacy_request('nomination', v_uid, 'member', null, null, 'Nomination removed', null, '{}'::jsonb, 'completed', null, 'Your nomination was removed.');
end;
$$;
revoke execute on function public.revoke_my_nomination() from public, anon;
grant execute on function public.revoke_my_nomination() to authenticated;

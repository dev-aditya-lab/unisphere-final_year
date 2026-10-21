-- 0045: account erasure you can verify, and retention that runs on its own (DPDP Act s. 8(7), s. 12(3)).
-- ---------------------------------------------------------------------------
--   * Requests are created by the server AFTER the member re-confirmed their password, through service-role
--     functions. Members no longer insert or update account_deletion_requests directly.
--   * Every erasure has a privacy request (the member can follow it) and an erasure_ledger row.
--   * The ledger holds only an opaque id and timestamps. Its job is to stop a restored backup from silently bringing an
--     erased account back: scripts/privacy-export-erasure-ledger.mjs and privacy-replay-erasures.mjs (docs/DPDP_RETENTION.md).
--   * Nothing is marked complete until the data is gone. A step that fails is recorded and retried with a back-off.
--   * run_privacy_retention() applies the retention windows from the privacy_retention setting.
-- ---------------------------------------------------------------------------

alter table public.account_deletion_requests
  add column erase_messages boolean not null default false,
  add column privacy_request_id uuid references public.privacy_requests(id) on delete set null,
  add column attempts integer not null default 0,
  add column last_error text check (last_error is null or char_length(last_error) <= 300),
  add column last_attempt_at timestamptz;

revoke insert, update on public.account_deletion_requests from authenticated;
revoke insert (user_id, reason), update (status) on public.account_deletion_requests from authenticated;
drop policy if exists deletion_insert_own on public.account_deletion_requests;
drop policy if exists deletion_cancel_own on public.account_deletion_requests;

create table public.erasure_ledger (
  user_ref uuid primary key,
  request_reference text,
  status text not null check (status in ('started', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  steps jsonb not null default '{}'::jsonb
);
alter table public.erasure_ledger enable row level security;
grant select on public.erasure_ledger to authenticated;
create policy erasure_ledger_select on public.erasure_ledger for select to authenticated using (public.has_permission('privacy.requests', null));

-- ── Requesting and cancelling ───────────────────────────────────────────────
create or replace function public.request_account_deletion_for(p_user uuid, p_reason text, p_erase_messages boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_req uuid;
  v_sched timestamptz;
  v_pr public.privacy_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended('erasure:' || p_user::text, 0));
  if not exists (select 1 from public.profiles where id = p_user and status <> 'deleted') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role in ('global_admin', 'college_admin', 'privacy_officer')) then
    raise exception 'protected_account' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_deletion_requests where user_id = p_user and status in ('pending', 'processing')) then
    raise exception 'duplicate' using errcode = '23505';
  end if;
  insert into public.account_deletion_requests(user_id, reason, erase_messages)
  values (p_user, nullif(left(trim(coalesce(p_reason, '')), 500), ''), coalesce(p_erase_messages, false))
  returning id, scheduled_for into v_req, v_sched;
  begin
    v_pr := public._new_privacy_request('erasure', p_user, 'member', null, null, 'Delete my account and data', null,
      jsonb_build_object('erase_messages', coalesce(p_erase_messages, false)), 'in_progress', null,
      'Scheduled. Your account and data will be erased on ' || to_char(v_sched at time zone 'Asia/Kolkata', 'DD Mon YYYY') || ' unless you cancel before then.');
  exception when unique_violation then
    -- A stale open erasure request from an earlier cancelled attempt: close it and make a fresh one.
    update public.privacy_requests set status = 'cancelled', closed_at = now()
      where user_id = p_user and kind = 'erasure' and status in ('received', 'verifying', 'in_progress', 'awaiting_requester');
    v_pr := public._new_privacy_request('erasure', p_user, 'member', null, null, 'Delete my account and data', null,
      jsonb_build_object('erase_messages', coalesce(p_erase_messages, false)), 'in_progress', null,
      'Scheduled. Your account and data will be erased on ' || to_char(v_sched at time zone 'Asia/Kolkata', 'DD Mon YYYY') || ' unless you cancel before then.');
  end;
  update public.account_deletion_requests set privacy_request_id = v_pr.id where id = v_req;
  return jsonb_build_object('scheduled_for', v_sched, 'reference', v_pr.reference);
end;
$$;
revoke execute on function public.request_account_deletion_for(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.request_account_deletion_for(uuid, text, boolean) to service_role;

create or replace function public.cancel_my_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.account_deletion_requests;
  v_ref text;
begin
  select * into v_row from public.account_deletion_requests where user_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.account_deletion_requests set status = 'cancelled' where id = v_row.id;
  if v_row.privacy_request_id is not null then
    update public.privacy_requests set status = 'cancelled', closed_at = now() where id = v_row.privacy_request_id returning reference into v_ref;
    insert into public.privacy_request_events(request_id, actor_id, actor_kind, from_status, to_status, note)
    values (v_row.privacy_request_id, v_uid, 'requester', 'in_progress', 'cancelled', 'You cancelled the deletion. Your account stays.');
    perform public.write_audit_log(v_uid, 'privacy.request.cancelled', 'privacy_request', v_ref, null, '{}'::jsonb);
  end if;
end;
$$;
revoke execute on function public.cancel_my_account_deletion() from public, anon;
grant execute on function public.cancel_my_account_deletion() to authenticated;

-- ── The worker's queue: retry with a back-off, give up (visibly) after many attempts ──
drop function public.claim_due_deletions(integer);
create function public.claim_due_deletions(p_limit integer default 10)
returns table (id uuid, user_id uuid, erase_messages boolean, privacy_request_id uuid)
language sql security definer set search_path = '' as $$
  update public.account_deletion_requests d
  set status = 'processing', processed_at = coalesce(d.processed_at, now()), attempts = d.attempts + 1, last_attempt_at = now()
  where d.id in (
    select x.id from public.account_deletion_requests x
    where ((x.status = 'processing' and x.attempts < 20 and (x.last_attempt_at is null or x.last_attempt_at < now() - (least(x.attempts, 12) * interval '5 minutes')))
        or (x.status = 'pending' and x.scheduled_for <= now()))
      and not exists (select 1 from public.user_roles ur where ur.user_id = x.user_id and ur.role in ('global_admin', 'college_admin', 'privacy_officer'))
    order by x.scheduled_for limit least(greatest(p_limit, 1), 50) for update skip locked)
  returning d.id, d.user_id, d.erase_messages, d.privacy_request_id;
$$;
revoke execute on function public.claim_due_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_due_deletions(integer) to service_role;

create or replace function public.record_erasure_failure(p_user uuid, p_step text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req uuid;
begin
  update public.account_deletion_requests set last_error = left(p_step || ': ' || coalesce(p_error, ''), 300), last_attempt_at = now()
  where user_id = p_user and status = 'processing' returning privacy_request_id into v_req;
  if v_req is not null then
    insert into public.privacy_request_events(request_id, actor_kind, from_status, to_status, visibility, note)
    values (v_req, 'system', 'in_progress', 'in_progress', 'staff', 'Erasure step failed and will be retried: ' || left(p_step, 60));
  end if;
end;
$$;
revoke execute on function public.record_erasure_failure(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_erasure_failure(uuid, text, text) to service_role;

-- ── Erasure steps ───────────────────────────────────────────────────────────
-- What will be kept, and why, computed BEFORE anything is deleted. Also opens the ledger entry.
create or replace function public.begin_account_erasure(p_user uuid, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ref text;
  v_msgs boolean;
  v_retained text[] := '{}';
begin
  select reference into v_ref from public.privacy_requests where id = p_request;
  select coalesce(d.erase_messages, false) into v_msgs from public.account_deletion_requests d where d.user_id = p_user and d.status = 'processing';
  -- The member's choice about their sent messages is kept in the ledger, so a replay after a restore honours it.
  insert into public.erasure_ledger(user_ref, request_reference, status, steps) values (p_user, v_ref, 'started', jsonb_build_object('erase_messages', coalesce(v_msgs, false)))
  on conflict (user_ref) do nothing;
  if exists (select 1 from public.blue_tick_orders where user_id = p_user) then
    v_retained := array_append(v_retained, 'payment records (kept because accounting and tax law require them)'::text);
  end if;
  if exists (select 1 from public.reports where target_owner_id = p_user) then
    v_retained := array_append(v_retained, 'reports made about the account, with the content they quoted (kept for community safety)'::text);
  end if;
  if not coalesce(v_msgs, false) and exists (select 1 from public.messages where sender_id = p_user and status = 'sent') then
    v_retained := array_append(v_retained, 'messages already delivered to other people (you chose to keep them; they no longer show your name)'::text);
  end if;
  return jsonb_build_object('retained', to_jsonb(v_retained), 'erase_messages', coalesce(v_msgs, false));
end;
$$;
revoke execute on function public.begin_account_erasure(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_account_erasure(uuid, uuid) to service_role;

-- The data that is not removed by the account's own cascade. Stored objects are removed by the server before this runs.
create or replace function public.erase_user_data(p_user uuid, p_erase_messages boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_msgs integer := 0; v_emb integer := 0; v_files integer := 0;
begin
  if p_erase_messages then
    update public.messages set status = 'deleted' where sender_id = p_user and status = 'sent';
    get diagnostics v_msgs = row_count;
  end if;
  delete from public.embeddings e
  where (e.entity_type = 'profile' and e.entity_id = p_user)
     or (e.entity_type = 'post' and e.entity_id in (select id from public.posts where author_id = p_user))
     or (e.entity_type = 'project' and e.entity_id in (select id from public.projects where owner_id = p_user));
  get diagnostics v_emb = row_count;
  delete from public.ai_jobs j where j.type = 'embed' and j.status in ('pending', 'processing')
    and ((j.payload ->> 'entityType' = 'profile' and (j.payload ->> 'entityId')::uuid = p_user)
      or (j.payload ->> 'entityType' = 'post' and (j.payload ->> 'entityId')::uuid in (select id from public.posts where author_id = p_user))
      or (j.payload ->> 'entityType' = 'project' and (j.payload ->> 'entityId')::uuid in (select id from public.projects where owner_id = p_user)));
  delete from public.files where owner_id = p_user;
  get diagnostics v_files = row_count;
  return jsonb_build_object('messages_erased', v_msgs, 'embeddings', v_emb, 'file_records', v_files);
end;
$$;
revoke execute on function public.erase_user_data(uuid, boolean) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid, boolean) to service_role;

-- Final step, after the sign-in account is gone: closes the ledger entry and the member's request.
create or replace function public.complete_account_erasure(p_user uuid, p_request uuid, p_retained text[], p_steps jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_partial boolean := coalesce(array_length(p_retained, 1), 0) > 0;
  v_ref text;
begin
  update public.erasure_ledger set status = 'completed', completed_at = now(), steps = steps || coalesce(p_steps, '{}'::jsonb) where user_ref = p_user;
  if p_request is not null then
    update public.privacy_requests set
      status = case when v_partial then 'partially_completed' else 'completed' end,
      outcome_reason = case when v_partial then 'Erased, except: ' || array_to_string(p_retained, '; ') || '.' else null end,
      closed_at = now()
    where id = p_request and closed_at is null returning reference into v_ref;
    if found then
      insert into public.privacy_request_events(request_id, actor_kind, from_status, to_status, note)
      values (p_request, 'system', 'in_progress', case when v_partial then 'partially_completed' else 'completed' end,
              case when v_partial then 'Your account and data were erased. Some records were kept: ' || array_to_string(p_retained, '; ') || '.'
                   else 'Your account and data were erased.' end);
    end if;
  end if;
  perform public.write_audit_log(null, 'account.deleted', 'user', p_user::text, null, jsonb_build_object('request', v_ref));
end;
$$;
revoke execute on function public.complete_account_erasure(uuid, uuid, text[], jsonb) from public, anon, authenticated;
grant execute on function public.complete_account_erasure(uuid, uuid, text[], jsonb) to service_role;

-- If the process stopped between deleting the sign-in account and closing the request, finish the paperwork.
create or replace function public.reconcile_erasure_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; r record;
begin
  for r in
    select pr.id, pr.reference from public.privacy_requests pr
    where pr.kind = 'erasure' and pr.status = 'in_progress' and pr.user_id is null
      and exists (select 1 from public.erasure_ledger l where l.request_reference = pr.reference)
  loop
    update public.privacy_requests set status = 'completed', closed_at = now() where id = r.id;
    insert into public.privacy_request_events(request_id, actor_kind, from_status, to_status, note)
    values (r.id, 'system', 'in_progress', 'completed', 'Your account and data were erased.');
    update public.erasure_ledger set status = 'completed', completed_at = coalesce(completed_at, now()) where request_reference = r.reference;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.reconcile_erasure_requests() from public, anon, authenticated;
grant execute on function public.reconcile_erasure_requests() to service_role;

-- The admin list gains the retry state, so a stuck erasure is visible rather than silent.
drop function public.admin_list_deletions(text);
create function public.admin_list_deletions(p_status text default 'pending')
returns table (
  id uuid, user_id uuid, full_name text, username text, email text, reason text, status text,
  requested_at timestamptz, scheduled_for timestamptz, college_id uuid, attempts integer, last_error text
) language sql stable security definer set search_path = '' as $$
  select d.id, d.user_id, p.full_name, p.username, u.email::text, d.reason, d.status, d.requested_at, d.scheduled_for, p.college_id, d.attempts, d.last_error
  from public.account_deletion_requests d
  join public.profiles p on p.id = d.user_id
  join auth.users u on u.id = d.user_id
  where public.has_permission('users.delete', p.college_id) and (p_status = 'all' or d.status = p_status)
  order by d.scheduled_for asc limit 200;
$$;
grant execute on function public.admin_list_deletions(text) to authenticated, service_role;

-- ── Retention ───────────────────────────────────────────────────────────────
insert into public.system_settings(key, value, is_public, description) values
  ('privacy_retention_last_run', '"1970-01-01T00:00:00Z"', false, 'When run_privacy_retention() last did its work')
on conflict (key) do nothing;
update public.system_settings set value = value || '{"closed_report_days":365}'::jsonb where key = 'privacy_retention' and not (value ? 'closed_report_days');

create or replace function public.run_privacy_retention(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cfg jsonb := coalesce((select value from public.system_settings where key = 'privacy_retention'), '{}'::jsonb);
  v_last timestamptz := coalesce((select (value #>> '{}')::timestamptz from public.system_settings where key = 'privacy_retention_last_run'), 'epoch');
  v_requests integer; v_contact integer; v_ai integer; v_ledger integer; v_reports integer; v_events integer; v_recon integer;
  d_req integer := coalesce((v_cfg ->> 'closed_request_days')::integer, 365);
  d_contact integer := coalesce((v_cfg ->> 'contact_message_days')::integer, 365);
  d_ai integer := coalesce((v_cfg ->> 'ai_usage_log_days')::integer, 365);
  d_ledger integer := coalesce((v_cfg ->> 'erasure_ledger_days')::integer, 365);
  d_report integer := coalesce((v_cfg ->> 'closed_report_days')::integer, 365);
begin
  if not p_force and v_last > now() - interval '6 hours' then return jsonb_build_object('skipped', true); end if;
  perform set_config('unisphere.retention', 'on', true);
  v_recon := public.reconcile_erasure_requests();

  -- Closed requests keep their reference, kind, status and dates, and lose everything that identifies or describes the person.
  with gone as (
    update public.privacy_requests set details = null, contact_name = null, contact_email = null, payload = '{}'::jsonb,
      subject = case kind when 'grievance' then 'Grievance (details removed)' else 'Privacy request (details removed)' end, anonymised_at = now()
    where closed_at is not null and closed_at < now() - make_interval(days => d_req) and anonymised_at is null returning id)
  update public.privacy_request_events e set note = null
    where e.request_id in (select id from gone) and e.actor_kind <> 'system' and e.note is not null;
  get diagnostics v_events = row_count;
  select count(*) into v_requests from public.privacy_requests where anonymised_at >= now() - interval '1 minute';

  delete from public.contact_messages where status in ('resolved', 'spam') and created_at < now() - make_interval(days => d_contact);
  get diagnostics v_contact = row_count;
  delete from public.ai_usage_logs where created_at < now() - make_interval(days => d_ai);
  get diagnostics v_ai = row_count;
  delete from public.erasure_ledger where status = 'completed' and completed_at < now() - make_interval(days => d_ledger);
  get diagnostics v_ledger = row_count;
  -- Reports about an account that no longer exists: once closed and old enough, the quoted content goes too.
  update public.reports set snapshot = '{}'::jsonb, details = null
    where target_owner_id is null and status in ('resolved', 'dismissed') and coalesce(resolved_at, updated_at) < now() - make_interval(days => d_report)
      and (snapshot <> '{}'::jsonb or details is not null);
  get diagnostics v_reports = row_count;

  update public.system_settings set value = to_jsonb(now()), updated_at = now() where key = 'privacy_retention_last_run';
  return jsonb_build_object('requests_anonymised', v_requests, 'request_notes_cleared', v_events, 'contact_messages_deleted', v_contact,
    'ai_usage_logs_deleted', v_ai, 'ledger_entries_deleted', v_ledger, 'report_snapshots_cleared', v_reports, 'erasures_reconciled', v_recon);
end;
$$;
revoke execute on function public.run_privacy_retention(boolean) from public, anon, authenticated;
grant execute on function public.run_privacy_retention(boolean) to service_role;

create index if not exists files_owner_idx on public.files(owner_id) where owner_id is not null;

-- 0043: DPDP foundation: consent purposes, versioned notices, auditable consent records, the privacy staff role.
-- ---------------------------------------------------------------------------
-- What this adds
--   * consent_purposes          the purposes a member can consent to (essential vs optional), one row each.
--   * privacy_notice_versions   an immutable archive of every notice version that was ever shown (purposes + text).
--   * consent_current           the member's present choice per purpose (what the app enforces).
--   * consent_events            append-only history of every grant / withdrawal / decline, with the notice version
--                               and the surface it happened on. No IP address, device or location is recorded.
--   * record_consent_for()      the ONLY way to change consent. Service role only: the server decides who the member
--                               is and which notice version was shown, never the browser.
--   * role `privacy_officer`    privacy staff. Deliberately NOT granted to global administrators.
--   * settings                  review mode, minimum-age policy, response deadlines and retention windows.
--
-- Nothing here changes who can read other people's data. Members read only their own consent rows.
-- ---------------------------------------------------------------------------

-- ── Purposes ────────────────────────────────────────────────────────────────
create table public.consent_purposes (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,39}$'),
  label text not null,
  description text not null,
  kind text not null check (kind in ('essential', 'optional')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.consent_purposes enable row level security;
grant select on public.consent_purposes to authenticated;
create policy consent_purposes_select on public.consent_purposes for select to authenticated using (true);

insert into public.consent_purposes(key, label, description, kind) values
  ('core_service', 'Run my UniSphere account',
   'Use the account details, profile, content and messages I provide to run my account and the features I use.', 'essential'),
  ('age_confirmation', 'I am 18 or older',
   'A declaration of eligibility. UniSphere is currently for adults; no document or date of birth is collected.', 'essential'),
  ('ai_assist', 'Use AI features on the text I submit',
   'Send the text I submit to an AI feature (writing help, idea discovery, summaries) to the AI provider UniSphere uses, to get a result.', 'optional'),
  ('ai_discovery_index', 'Let AI index my public posts and profile for discovery',
   'Convert my public or college-visible posts, projects and profile summary into numeric embeddings with an AI provider so related work can be found.', 'optional'),
  ('identity_verification', 'Review my identity document for the blue tick',
   'Let UniSphere reviewers open the identity document I upload, only to confirm my name and photo for the blue tick.', 'optional');

-- ── Notice versions (immutable archive) ─────────────────────────────────────
create table public.privacy_notice_versions (
  version text primary key check (version ~ '^\d{4}-\d{2}-\d{2}\.\d{1,3}$'),
  effective_at timestamptz not null,
  content_hash text not null,
  purposes jsonb not null,
  document jsonb not null,
  reconsent_purposes text[] not null default '{}',
  summary text,
  created_at timestamptz not null default now()
);
alter table public.privacy_notice_versions enable row level security;
-- The notice is a public document: anyone may read every version, so past versions can be shown.
grant select on public.privacy_notice_versions to anon, authenticated;
create policy privacy_notice_versions_select on public.privacy_notice_versions for select to anon, authenticated using (true);

-- Tables that must never be edited after the fact. Retention jobs set `unisphere.retention` for their own transaction.
create or replace function public.privacy_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('unisphere.retention', true), '') = 'on' then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
-- Same, for history tables whose "who did it" column points at a member: erasing that member may clear the pointer
-- (the foreign key sets it to NULL), and nothing else about a row may ever change.
create or replace function public.privacy_immutable_except_actor()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('unisphere.retention', true), '') = 'on' then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) ->> tg_argv[0]) is null and (to_jsonb(old) ->> tg_argv[0]) is not null
     and (to_jsonb(new) - tg_argv[0]) = (to_jsonb(old) - tg_argv[0]) then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
create trigger trg_notice_versions_immutable before update or delete on public.privacy_notice_versions
  for each row execute function public.privacy_immutable();

-- Publishing a version is idempotent. A version number is never reused for different content.
create or replace function public.publish_privacy_notice(
  p_version text, p_effective_at timestamptz, p_hash text, p_purposes jsonb, p_document jsonb, p_reconsent text[], p_summary text
) returns text language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select content_hash into v_hash from public.privacy_notice_versions where version = p_version;
  if found then
    if v_hash <> p_hash then raise exception 'notice_version_content_changed' using errcode = '23505'; end if;
    return 'exists';
  end if;
  insert into public.privacy_notice_versions(version, effective_at, content_hash, purposes, document, reconsent_purposes, summary)
  values (p_version, p_effective_at, p_hash, p_purposes, p_document, coalesce(p_reconsent, '{}'), p_summary);
  perform public.write_audit_log(null, 'privacy.notice.published', 'notice', p_version, null, jsonb_build_object('hash', left(p_hash, 12)));
  return 'published';
end;
$$;
revoke execute on function public.publish_privacy_notice(text, timestamptz, text, jsonb, jsonb, text[], text) from public, anon, authenticated;
grant execute on function public.publish_privacy_notice(text, timestamptz, text, jsonb, jsonb, text[], text) to service_role;

-- ── Consent records ─────────────────────────────────────────────────────────
create table public.consent_current (
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null references public.consent_purposes(key),
  status text not null check (status in ('granted', 'withdrawn', 'declined')),
  notice_version text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, purpose)
);

create table public.consent_events (
  id bigint generated always as identity primary key,
  -- Set to NULL (never deleted) when the account is erased: what remains says nothing about who it was.
  user_id uuid references public.profiles(id) on delete set null,
  purpose text not null references public.consent_purposes(key),
  status text not null check (status in ('granted', 'withdrawn', 'declined')),
  notice_version text not null,
  source text not null check (source in ('signup', 'settings', 'review', 'feature_prompt', 'application', 'system')),
  created_at timestamptz not null default now()
);
create index consent_events_user_idx on public.consent_events(user_id, created_at desc);

-- Append-only, except that erasing the account may clear the link to the member (user_id -> NULL).
create or replace function public.consent_events_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('unisphere.retention', true), '') = 'on' then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.user_id is null and old.user_id is not null
     and new.id = old.id and new.purpose = old.purpose and new.status = old.status
     and new.notice_version = old.notice_version and new.source = old.source and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'consent_events is append-only' using errcode = '42501';
end;
$$;
create trigger trg_consent_events_guard before update or delete on public.consent_events
  for each row execute function public.consent_events_guard();

alter table public.consent_current enable row level security;
alter table public.consent_events enable row level security;
-- Members read their own state and history. There is no INSERT / UPDATE / DELETE grant: only record_consent_for() writes.
grant select on public.consent_current, public.consent_events to authenticated;
create policy consent_current_own on public.consent_current for select to authenticated using (user_id = (select auth.uid()));
create policy consent_events_own on public.consent_events for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.has_consent(p_user uuid, p_purpose text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consent_current c where c.user_id = p_user and c.purpose = p_purpose and c.status = 'granted');
$$;
revoke execute on function public.has_consent(uuid, text) from public, anon, authenticated;
grant execute on function public.has_consent(uuid, text) to service_role;

create or replace function public.record_consent_for(
  p_user uuid, p_purpose text, p_status text, p_notice_version text, p_source text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_prev public.consent_current%rowtype;
begin
  if not exists (select 1 from public.consent_purposes where key = p_purpose and active) then
    raise exception 'unknown_purpose' using errcode = '22023';
  end if;
  if p_status not in ('granted', 'withdrawn', 'declined') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if p_source not in ('signup', 'settings', 'review', 'feature_prompt', 'application', 'system') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  if not exists (select 1 from public.privacy_notice_versions where version = p_notice_version) then
    raise exception 'unknown_notice_version' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  -- Withdrawing the consent the account itself rests on means leaving: that goes through account deletion.
  if p_purpose = 'core_service' and p_status = 'withdrawn' then raise exception 'use_account_deletion' using errcode = '22023'; end if;
  if p_purpose = 'age_confirmation' and p_status = 'withdrawn' then raise exception 'invalid_status' using errcode = '22023'; end if;

  -- One writer per (member, purpose): two tabs cannot interleave a grant and a withdrawal.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_purpose, 0));
  select * into v_prev from public.consent_current where user_id = p_user and purpose = p_purpose;
  if found and v_prev.status = p_status and v_prev.notice_version = p_notice_version then
    return jsonb_build_object('changed', false, 'status', p_status);
  end if;

  insert into public.consent_current(user_id, purpose, status, notice_version, updated_at)
  values (p_user, p_purpose, p_status, p_notice_version, now())
  on conflict (user_id, purpose) do update set status = excluded.status, notice_version = excluded.notice_version, updated_at = now();
  insert into public.consent_events(user_id, purpose, status, notice_version, source)
  values (p_user, p_purpose, p_status, p_notice_version, p_source);

  -- What the choice switches on or off, in the same transaction.
  if p_purpose = 'ai_assist' then
    update public.profiles set ai_assist_enabled = (p_status = 'granted') where id = p_user;
  elsif p_purpose = 'ai_discovery_index' and p_status <> 'granted' then
    -- Withdrawal removes what was derived from the member's content, and stops anything still queued.
    delete from public.embeddings e
    where (e.entity_type = 'profile' and e.entity_id = p_user)
       or (e.entity_type = 'post' and e.entity_id in (select id from public.posts where author_id = p_user))
       or (e.entity_type = 'project' and e.entity_id in (select id from public.projects where owner_id = p_user));
    delete from public.ai_jobs j where j.type = 'embed' and j.status in ('pending', 'processing')
      and ((j.payload ->> 'entityType' = 'profile' and (j.payload ->> 'entityId')::uuid = p_user)
        or (j.payload ->> 'entityType' = 'post' and (j.payload ->> 'entityId')::uuid in (select id from public.posts where author_id = p_user))
        or (j.payload ->> 'entityType' = 'project' and (j.payload ->> 'entityId')::uuid in (select id from public.projects where owner_id = p_user)));
  end if;
  return jsonb_build_object('changed', true, 'status', p_status);
end;
$$;
revoke execute on function public.record_consent_for(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_consent_for(uuid, text, text, text, text) to service_role;

-- AI help used to be on for everyone by default. That was never an informed choice, so it is switched off until the
-- member grants it (an AI feature asks once, and Settings > Privacy shows the choice).
update public.profiles set ai_assist_enabled = false where ai_assist_enabled;
alter table public.profiles alter column ai_assist_enabled set default false;

-- ── Privacy staff role ──────────────────────────────────────────────────────
-- A privacy officer handles requests, grievances, notices and incidents. Global administrators do NOT receive these
-- permissions: privacy access is granted deliberately, to named people (see scripts/grant-privacy-officer.mjs).
alter table public.user_roles drop constraint user_roles_check;
alter table public.user_roles drop constraint user_roles_role_check;
alter table public.role_permissions drop constraint role_permissions_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('global_admin', 'college_admin', 'moderator', 'verification_staff', 'support_agent', 'privacy_officer'));
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('global_admin', 'college_admin', 'moderator', 'verification_staff', 'support_agent', 'privacy_officer'));
alter table public.user_roles add constraint user_roles_check check (
  (role = 'global_admin' and college_id is null) or
  (role = 'college_admin' and college_id is not null) or
  (role = 'privacy_officer' and college_id is null) or
  (role in ('moderator', 'verification_staff', 'support_agent'))
);

insert into public.role_permissions(role, permission) values
  ('privacy_officer', 'privacy.requests'),
  ('privacy_officer', 'privacy.manage'),
  ('privacy_officer', 'privacy.incidents'),
  ('privacy_officer', 'privacy.incidents.approve');

-- Granting the role stays with global administrators (roles.manage), platform-wide only, never to oneself.
create or replace function public.grant_role(p_user uuid, p_role text, p_college uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_target public.profiles%rowtype;
  v_id uuid;
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_user = v_actor then raise exception 'cannot_grant_to_self' using errcode = '42501'; end if;

  select * into v_target from public.profiles where id = p_user;
  if not found or v_target.status <> 'active' then raise exception 'target_unavailable' using errcode = '22023'; end if;

  if p_role in ('global_admin', 'privacy_officer') then
    if p_college is not null then raise exception 'invalid_scope' using errcode = '22023'; end if;
    if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif p_role = 'college_admin' then
    if p_college is null then raise exception 'invalid_scope' using errcode = '22023'; end if;
    if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif p_role in ('moderator', 'verification_staff', 'support_agent') then
    if p_college is null then
      if not public.has_permission('roles.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
    else
      if not (public.has_permission('roles.manage', p_college) or public.has_permission('roles.manage_limited', p_college)) then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    end if;
  else
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_college is not null and v_target.college_id is distinct from p_college then
    raise exception 'target_not_in_college' using errcode = '22023';
  end if;

  insert into public.user_roles(user_id, role, college_id, granted_by)
  values (p_user, p_role, p_college, v_actor)
  returning id into v_id;

  perform public.write_audit_log(v_actor, 'role.granted', 'user', p_user::text, p_college, jsonb_build_object('role', p_role));
  return v_id;
end;
$$;
grant execute on function public.grant_role(uuid, text, uuid) to authenticated, service_role;

-- ── Settings ────────────────────────────────────────────────────────────────
-- All privacy_* settings are private (server-read) and change only through set_privacy_setting (permission
-- privacy.manage). The generic setter, which global administrators hold, can no longer touch them.
insert into public.system_settings(key, value, is_public, description) values
  ('privacy_review_mode', '"soft"', false, 'How accounts that joined before the consent flow are asked to review their privacy choices: soft (a banner) or required (a page they must complete)'),
  ('privacy_cutover_at', to_jsonb(now()), false, 'Accounts created after this moment must have recorded consent; earlier accounts follow privacy_review_mode'),
  ('privacy_minors_policy', '"adults_only"', false, 'Age policy: adults_only. Accounts of people under 18 are not offered until verifiable parental consent is implemented'),
  ('privacy_response_days', '{"access":30,"correction":30,"erasure":30,"nomination":30,"grievance":14,"other":30}', false, 'Target days to respond, per kind of privacy request (a placeholder pending legal review)'),
  ('privacy_grievance_max_days', '90', false, 'Longest period UniSphere commits to for resolving a grievance (Rule 14(3) allows up to 90 days)'),
  ('privacy_retention', '{"closed_request_days":365,"contact_message_days":365,"ai_usage_log_days":365,"erasure_ledger_days":365}', false, 'Retention windows in days (placeholders pending legal review; see docs/DPDP_RETENTION.md)'),
  ('privacy_incident_self_approval', 'false', false, 'Whether the person who drafted a breach notice may also approve it (off by default)')
on conflict (key) do nothing;

create or replace function public.set_system_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old jsonb;
begin
  if not public.has_permission('settings.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key like 'blue\_tick\_%' or p_key like 'privacy\_%' then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_old from public.system_settings where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = 'P0002'; end if;
  update public.system_settings set value = p_value, updated_by = v_actor, updated_at = now() where key = p_key;
  perform public.write_audit_log(v_actor, 'settings.updated', 'setting', p_key, null,
    case when jsonb_typeof(p_value) in ('boolean', 'number') then jsonb_build_object('old', v_old, 'new', p_value)
         else jsonb_build_object('changed', true) end);
end;
$$;

create or replace function public.set_privacy_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old jsonb;
begin
  if not public.has_permission('privacy.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_key not like 'privacy\_%' or p_key = 'privacy_cutover_at' then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_old from public.system_settings where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = 'P0002'; end if;
  update public.system_settings set value = p_value, updated_by = v_actor, updated_at = now() where key = p_key;
  perform public.write_audit_log(v_actor, 'privacy.setting.updated', 'setting', p_key, null, jsonb_build_object('changed', true));
end;
$$;
revoke execute on function public.set_privacy_setting(text, jsonb) from public, anon;
grant execute on function public.set_privacy_setting(text, jsonb) to authenticated, service_role;

-- ── Reserved names: the new top-level pages can never be claimed as a username ──
insert into public.reserved_usernames(name) values
  ('privacy-centre'),('privacy-notice'),('privacy-requests'),('privacy-settings'),('privacy-contact'),('privacy-review'),
  ('delete-account'),('grievance'),('cookies'),('dpdp'),('legal'),('data-protection')
on conflict do nothing;
-- The audit log is append-only, with one allowed change: when a member is erased (or a college merged away), the
-- foreign keys clear the actor / college pointer. Without this, erasing any member who ever appeared as an actor fails.
create or replace function public.audit_logs_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (new.actor_id is null or new.actor_id = old.actor_id) and (new.college_id is null or new.college_id = old.college_id)
     and (to_jsonb(new) - 'actor_id' - 'college_id') = (to_jsonb(old) - 'actor_id' - 'college_id') then
    return new;
  end if;
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

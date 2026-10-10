-- 0005: file metadata, college verification, system settings, feature flags,
--       contact messages, account deletion requests

-- ── Files (metadata for objects stored in Cloudflare R2) ────────────────────
create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  bucket text not null check (bucket in ('public', 'private')),
  storage_key text not null unique,
  purpose text not null check (purpose in (
    'avatar', 'cover', 'post_attachment', 'project_asset', 'community_image',
    'event_banner', 'message_attachment', 'verification_document'
  )),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  original_name text check (original_name is null or char_length(original_name) <= 200),
  width integer,
  height integer,
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz
);
create index files_owner_idx on public.files(owner_id, created_at desc);
create index files_status_idx on public.files(status, created_at);

alter table public.files enable row level security;
grant select on public.files to anon, authenticated;
grant insert (owner_id, bucket, storage_key, purpose, mime_type, size_bytes, original_name, width, height)
  on public.files to authenticated;

create policy files_select on public.files for select to anon, authenticated
  using (
    -- Intentionally public image purposes are readable by anyone, whichever bucket stores them.
    (purpose in ('avatar', 'cover', 'project_asset', 'community_image', 'event_banner') and status = 'ready')
    or owner_id = (select auth.uid())
  );
create policy files_insert on public.files for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending' and public.is_active_user());

-- A profile may only reference public images the user actually owns.
create or replace function public.profiles_validate_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.jwt_role() <> 'authenticated' then return new; end if;
  if new.avatar_key is not null and (tg_op = 'INSERT' or new.avatar_key is distinct from old.avatar_key) then
    if not exists (
      select 1 from public.files f
      where f.storage_key = new.avatar_key and f.owner_id = new.id
        and f.purpose = 'avatar' and f.status = 'ready'
    ) then raise exception 'invalid_avatar' using errcode = '22023'; end if;
  end if;
  if new.cover_key is not null and (tg_op = 'INSERT' or new.cover_key is distinct from old.cover_key) then
    if not exists (
      select 1 from public.files f
      where f.storage_key = new.cover_key and f.owner_id = new.id
        and f.purpose = 'cover' and f.status = 'ready'
    ) then raise exception 'invalid_cover' using errcode = '22023'; end if;
  end if;
  return new;
end;
$$;
create trigger trg_profiles_validate_media
  before insert or update of avatar_key, cover_key on public.profiles
  for each row execute function public.profiles_validate_media();

-- ── Platform settings & feature flags ───────────────────────────────────────
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default true,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;
alter table public.feature_flags enable row level security;
grant select on public.system_settings, public.feature_flags to anon, authenticated;

create policy settings_select on public.system_settings for select to anon, authenticated
  using (is_public or public.has_permission('settings.view', null));
create policy flags_select on public.feature_flags for select to anon, authenticated using (true);

insert into public.system_settings(key, value, is_public, description) values
  ('platform_name', '"UniSphere"', true, 'Public product name'),
  ('platform_tagline', '"Your campus. Your people. Your next idea."', true, 'Tagline shown on the landing page'),
  ('maintenance_mode', 'false', true, 'When true, only administrators can use the app'),
  ('maintenance_message', '"UniSphere is undergoing scheduled maintenance. Please check back shortly."', true, 'Shown to visitors during maintenance'),
  ('registration_open', 'true', true, 'Allow new accounts to be created'),
  ('college_verification_required', 'false', true, 'If true, only college-verified members can publish content'),
  ('support_email', '""', true, 'Public support address shown on the contact page'),
  ('upload_max_image_mb', '5', true, 'Maximum size of an uploaded image (MB)'),
  ('upload_max_attachment_mb', '10', true, 'Maximum size of other attachments (MB)'),
  ('upload_allowed_image_types', '["image/jpeg","image/png","image/webp"]', true, 'Allowed image MIME types'),
  ('rate_limits', '{"auth":{"limit":10,"windowSec":300},"write":{"limit":60,"windowSec":60},"search":{"limit":60,"windowSec":60},"upload":{"limit":20,"windowSec":300},"ai":{"limit":20,"windowSec":300}}', false, 'Per-user / per-IP rate limit policy'),
  ('ai_daily_limit_per_user', '30', false, 'AI requests per user per day'),
  ('guidelines_md', '""', true, 'Community guidelines (Markdown). Empty = use built-in text'),
  ('privacy_md', '""', true, 'Privacy policy (Markdown). Empty = use built-in text'),
  ('terms_md', '""', true, 'Terms of service (Markdown). Empty = use built-in text')
on conflict (key) do nothing;

insert into public.feature_flags(key, enabled, description) values
  ('ai_features', true, 'Master switch for every AI-assisted feature'),
  ('ai_idea_discovery', true, 'Idea discovery & originality assistant'),
  ('ai_post_assistant', true, 'AI writing assistant in the composer'),
  ('ai_matching', true, 'Teammate recommendation explanations'),
  ('ai_moderation_assist', true, 'AI-suggested report categories / risk levels'),
  ('semantic_search', true, 'Use embeddings for search when a provider is configured'),
  ('messaging', true, 'Direct messaging'),
  ('communities', true, 'Clubs & communities'),
  ('events', true, 'Events & RSVP'),
  ('opportunities', true, 'Opportunity listings'),
  ('alumni_network', true, 'Alumni directory & mentoring'),
  ('email_notifications', true, 'Transactional notification emails')
on conflict (key) do nothing;

create or replace function public.set_system_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old jsonb;
begin
  if not public.has_permission('settings.manage', null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select value into v_old from public.system_settings where key = p_key;
  if not found then raise exception 'unknown_setting' using errcode = 'P0002'; end if;

  update public.system_settings set value = p_value, updated_by = v_actor, updated_at = now() where key = p_key;

  perform public.write_audit_log(v_actor, 'settings.updated', 'setting', p_key, null,
    case
      when jsonb_typeof(p_value) in ('boolean', 'number') then jsonb_build_object('old', v_old, 'new', p_value)
      else jsonb_build_object('changed', true)
    end);
end;
$$;

create or replace function public.set_feature_flag(p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old boolean;
begin
  if not public.has_permission('flags.manage', null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select enabled into v_old from public.feature_flags where key = p_key;
  if not found then raise exception 'unknown_flag' using errcode = 'P0002'; end if;
  update public.feature_flags set enabled = p_enabled, updated_by = v_actor, updated_at = now() where key = p_key;
  perform public.write_audit_log(v_actor, 'flag.updated', 'flag', p_key, null,
    jsonb_build_object('old', v_old, 'new', p_enabled));
end;
$$;

grant execute on function public.set_system_setting(text, jsonb), public.set_feature_flag(text, boolean)
  to authenticated, service_role;

-- Helpers used by policies to honour runtime settings.
create or replace function public.setting_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::boolean from public.system_settings where key = p_key), p_default);
$$;

create or replace function public.flag_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), false);
$$;

-- Members who may publish content: active, and verified when the platform requires it.
create or replace function public.can_contribute()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
      and (
        not public.setting_bool('college_verification_required', false)
        or p.verification_status = 'verified'
        or exists (select 1 from public.user_roles ur where ur.user_id = p.id)
      )
  );
$$;

grant execute on function public.setting_bool(text, boolean), public.flag_enabled(text), public.can_contribute()
  to anon, authenticated, service_role;

-- ── College verification ────────────────────────────────────────────────────
create table public.college_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  college_id uuid not null references public.colleges(id) on delete cascade,
  account_type text not null check (account_type in ('student', 'alumni', 'faculty', 'staff')),
  method text not null check (method in ('email_domain', 'manual', 'invite')),
  college_email text check (college_email is null or char_length(college_email) <= 254),
  email_verified_at timestamptz,
  supporting_info text check (supporting_info is null or char_length(supporting_info) <= 1000),
  document_file_id uuid references public.files(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'needs_info', 'cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  reviewer_notes text check (reviewer_notes is null or char_length(reviewer_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index college_verifications_one_open_idx
  on public.college_verifications(user_id) where status in ('pending', 'needs_info');
create index college_verifications_queue_idx
  on public.college_verifications(college_id, status, created_at);
create trigger trg_college_verifications_updated before update on public.college_verifications
  for each row execute function public.set_updated_at();

alter table public.college_verifications enable row level security;

-- reviewer_notes (internal) is excluded from the user-facing column grant.
grant select (id, user_id, college_id, account_type, method, college_email, email_verified_at,
              supporting_info, document_file_id, status, reviewed_at, rejection_reason, created_at, updated_at)
  on public.college_verifications to authenticated;
grant insert (user_id, college_id, account_type, method, college_email, supporting_info, document_file_id)
  on public.college_verifications to authenticated;
grant update (status) on public.college_verifications to authenticated;

create policy verifications_select_own on public.college_verifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy verifications_insert_own on public.college_verifications for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and public.is_member()
    and exists (
      select 1 from public.profiles p
      where p.id = college_verifications.user_id
        and p.college_id = college_verifications.college_id
        and p.account_type = college_verifications.account_type
    )
  );
create policy verifications_cancel_own on public.college_verifications for update to authenticated
  using (user_id = (select auth.uid()) and status in ('pending', 'needs_info'))
  with check (user_id = (select auth.uid()) and status = 'cancelled');

-- Keep profiles.verification_status consistent on every code path.
create or replace function public.college_verifications_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    update public.profiles
      set verification_status = 'verified', verified_at = now()
      where id = new.user_id and college_id = new.college_id;
  elsif new.status in ('pending', 'needs_info') then
    update public.profiles set verification_status = 'pending'
      where id = new.user_id and verification_status <> 'verified';
  elsif new.status = 'rejected' then
    update public.profiles set verification_status = 'rejected'
      where id = new.user_id and verification_status <> 'verified';
  elsif new.status = 'cancelled' then
    update public.profiles set verification_status = 'unverified'
      where id = new.user_id and verification_status = 'pending';
  end if;
  return new;
end;
$$;
create trigger trg_college_verifications_sync
  after insert or update of status on public.college_verifications
  for each row execute function public.college_verifications_sync_profile();

-- Single place where a verification decision is applied (service role & RPC wrappers only).
create or replace function public.finalize_college_verification(
  p_id uuid, p_decision text, p_reviewer uuid, p_reason text default null, p_notes text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.college_verifications%rowtype;
  p public.profiles%rowtype;
begin
  if p_decision not in ('approved', 'rejected', 'needs_info') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  select * into v from public.college_verifications where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.status not in ('pending', 'needs_info') then raise exception 'already_decided' using errcode = '23514'; end if;
  if p_reviewer is not null and p_reviewer = v.user_id then
    raise exception 'cannot_review_own_request' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    select * into p from public.profiles where id = v.user_id;
    if p.college_id is distinct from v.college_id or p.account_type <> v.account_type then
      raise exception 'profile_changed' using errcode = '23514';
    end if;
    if v.method = 'email_domain' and v.email_verified_at is null then
      raise exception 'email_not_verified' using errcode = '23514';
    end if;
  end if;

  update public.college_verifications
    set status = p_decision,
        reviewed_by = p_reviewer,
        reviewed_at = now(),
        rejection_reason = case when p_decision in ('rejected', 'needs_info') then left(p_reason, 500) else null end,
        reviewer_notes = left(p_notes, 1000)
    where id = p_id;

  perform public.write_audit_log(p_reviewer, 'verification.' || p_decision, 'user', v.user_id::text, v.college_id,
    jsonb_build_object('method', v.method, 'verification_id', v.id, 'automated', p_reviewer is null));
end;
$$;
grant execute on function public.finalize_college_verification(uuid, text, uuid, text, text) to service_role;

create or replace function public.review_college_verification(
  p_id uuid, p_decision text, p_reason text default null, p_notes text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_college uuid;
begin
  select college_id into v_college from public.college_verifications where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.has_permission('verification.review', v_college) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision in ('rejected', 'needs_info') and coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  perform public.finalize_college_verification(p_id, p_decision, (select auth.uid()), p_reason, p_notes);
end;
$$;

-- Review queue for staff, including internal notes and basic applicant info only.
create or replace function public.list_verification_requests(p_status text default 'pending', p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, user_id uuid, full_name text, username text, college_id uuid, college_name text,
  account_type text, method text, college_email text, email_verified_at timestamptz,
  supporting_info text, document_file_id uuid, status text, rejection_reason text,
  reviewer_notes text, reviewed_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.user_id, p.full_name, p.username, v.college_id, c.name,
         v.account_type, v.method, v.college_email, v.email_verified_at,
         v.supporting_info, v.document_file_id, v.status, v.rejection_reason,
         v.reviewer_notes, v.reviewed_at, v.created_at
  from public.college_verifications v
  join public.profiles p on p.id = v.user_id
  join public.colleges c on c.id = v.college_id
  where public.has_permission('verification.review', v.college_id)
    and (p_status = 'all' or v.status = p_status)
  order by v.created_at asc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

grant execute on function public.review_college_verification(uuid, text, text, text),
  public.list_verification_requests(text, integer, integer) to authenticated, service_role;

-- One-time email codes proving control of a college address (service role only).
create table public.college_email_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  college_id uuid not null references public.colleges(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index college_email_challenges_user_idx on public.college_email_challenges(user_id, created_at desc);
alter table public.college_email_challenges enable row level security; -- no policies, no API grants

-- Invitation codes for colleges without verifiable student email addresses.
create table public.college_invites (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  code_hash bytea not null unique,
  code_hint text not null,
  audience text not null default 'student' check (audience in ('student', 'alumni', 'faculty', 'staff')),
  max_uses integer not null default 1 check (max_uses between 1 and 1000),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index college_invites_college_idx on public.college_invites(college_id, created_at desc);
alter table public.college_invites enable row level security;
-- Hash/hints are only listable by college managers (no column grants on code_hash).
grant select (id, college_id, code_hint, audience, max_uses, uses, expires_at, created_by, revoked_at, created_at)
  on public.college_invites to authenticated;
create policy college_invites_select on public.college_invites for select to authenticated
  using (public.has_permission('college.manage', college_id));

create or replace function public.create_college_invite(
  p_college uuid, p_audience text default 'student', p_max_uses integer default 1, p_valid_days integer default 14
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_raw text;
  v_code text;
begin
  if not public.has_permission('college.manage', p_college) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_raw := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
  insert into public.college_invites(college_id, code_hash, code_hint, audience, max_uses, expires_at, created_by)
  values (p_college, extensions.digest(v_code, 'sha256'), right(v_code, 4), p_audience,
          least(greatest(p_max_uses, 1), 1000), now() + make_interval(days => least(greatest(p_valid_days, 1), 90)), v_actor);
  perform public.write_audit_log(v_actor, 'invite.created', 'college', p_college::text, p_college,
    jsonb_build_object('audience', p_audience, 'max_uses', p_max_uses));
  return v_code;
end;
$$;

create or replace function public.redeem_college_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_inv public.college_invites%rowtype;
  v_profile public.profiles%rowtype;
  v_vid uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_profile from public.profiles where id = v_user;
  if not found or v_profile.status <> 'active' or v_profile.college_id is null then
    raise exception 'profile_not_ready' using errcode = '22023';
  end if;

  select * into v_inv from public.college_invites
    where code_hash = extensions.digest(upper(trim(p_code)), 'sha256') for update;
  if not found or v_inv.revoked_at is not null or v_inv.expires_at < now() or v_inv.uses >= v_inv.max_uses
     or v_inv.college_id <> v_profile.college_id or v_inv.audience <> v_profile.account_type then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;

  update public.college_invites set uses = uses + 1 where id = v_inv.id;

  update public.college_verifications set status = 'cancelled'
    where user_id = v_user and status in ('pending', 'needs_info');

  insert into public.college_verifications(user_id, college_id, account_type, method, supporting_info)
  values (v_user, v_profile.college_id, v_profile.account_type, 'invite', 'Invitation code ending ' || v_inv.code_hint)
  returning id into v_vid;

  perform public.finalize_college_verification(v_vid, 'approved', null, null, 'auto: invitation code');
  return v_vid;
end;
$$;

grant execute on function public.create_college_invite(uuid, text, integer, integer),
  public.redeem_college_invite(text) to authenticated, service_role;

-- ── Contact messages (public contact form) ──────────────────────────────────
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  subject text not null check (char_length(subject) between 3 and 150),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'spam')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages(status, created_at desc);
alter table public.contact_messages enable row level security;
-- Inserted by the server (service role) after rate limiting + honeypot checks.
grant select, update (status, assigned_to) on public.contact_messages to authenticated;
create policy contact_select on public.contact_messages for select to authenticated
  using (public.has_permission('contact.manage', null));
create policy contact_update on public.contact_messages for update to authenticated
  using (public.has_permission('contact.manage', null))
  with check (public.has_permission('contact.manage', null));

-- ── Account deletion requests ───────────────────────────────────────────────
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'processing', 'completed', 'rejected')),
  reason text check (reason is null or char_length(reason) <= 500),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '14 days'),
  processed_by uuid references public.profiles(id) on delete set null,
  processed_at timestamptz
);
create unique index account_deletion_one_open_idx on public.account_deletion_requests(user_id) where status = 'pending';
alter table public.account_deletion_requests enable row level security;
grant select on public.account_deletion_requests to authenticated;
grant insert (user_id, reason) on public.account_deletion_requests to authenticated;
grant update (status) on public.account_deletion_requests to authenticated;

create policy deletion_select_own on public.account_deletion_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('users.delete', (select p.college_id from public.profiles p where p.id = user_id)));
create policy deletion_insert_own on public.account_deletion_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy deletion_cancel_own on public.account_deletion_requests for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'cancelled');

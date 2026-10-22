-- 0052: invite codes are `username-xxxx` (easy to remember, unguessable suffix)
--
-- Migration 0051 first shipped 10-character random codes. A database that already ran that version still has them, and the
-- code constraint and the three functions below reject the new format. This brings any such database up to date: old-format codes
-- are removed (a member's code is created again, from their username, the next time they open Refer & Earn) and the constraint
-- and functions are replaced. A database that ran the current 0051 is unchanged by it. Safe to re-run.

delete from public.referral_codes where code !~ '^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$';
alter table public.referral_codes drop constraint if exists referral_codes_code_check;
alter table public.referral_codes add constraint referral_codes_code_check check (code ~ '^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$');
drop function if exists public._referral_new_code();
create or replace function public._referral_new_code(p_username text) returns text language plpgsql volatile set search_path = '' as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_base text := left(regexp_replace(lower(coalesce(p_username, '')), '[^a-z0-9_-]', '', 'g'), 30);
  v_bytes bytea; v_out text := ''; i int;
begin
  if char_length(v_base) < 3 then v_base := 'member'; end if;
  -- bytes 10..15 of a version-4 uuid are fully random (the version and variant bits sit in bytes 6 and 8)
  v_bytes := substring(decode(replace(gen_random_uuid()::text, '-', ''), 'hex') from 11 for 6);
  for i in 0..3 loop v_out := v_out || substr(v_alpha, (get_byte(v_bytes, i) % 31) + 1, 1); end loop;
  return v_base || '-' || v_out;
end $$;
create or replace function public.referral_my_code() returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid()); v_code text; n int := 0;
begin
  if v_me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select code into v_code from public.referral_codes where user_id = v_me;
  if v_code is not null then return v_code; end if;
  if not exists (select 1 from public.profiles where id = v_me and status = 'active' and onboarded_at is not null) then raise exception 'account_restricted' using errcode = '42501'; end if;
  loop
    n := n + 1;
    begin
      insert into public.referral_codes(user_id, code) values (v_me, public._referral_new_code((select username from public.profiles where id = v_me))) on conflict (user_id) do nothing;
      select code into v_code from public.referral_codes where user_id = v_me;
      return v_code;
    exception when unique_violation then
      if n >= 8 then raise; end if;
    end;
  end loop;
end $$;
create or replace function public.referral_attribute(p_referred uuid, p_code text, p_net_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(btrim(coalesce(p_code, ''))); v_referrer uuid; v_created timestamptz; v_id uuid; v_recent int;
begin
  if not public._referral_flag('program_enabled') then return jsonb_build_object('attributed', false, 'reason', 'disabled'); end if;
  if v_code !~ '^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$' then
    perform public._referral_event(null, null, 'attribution_rejected', jsonb_build_object('reason', 'invalid_code'));
    return jsonb_build_object('attributed', false, 'reason', 'invalid_code');
  end if;
  select user_id into v_referrer from public.referral_codes where code = v_code;
  if v_referrer is null then
    perform public._referral_event(null, null, 'attribution_rejected', jsonb_build_object('reason', 'unknown_code'));
    return jsonb_build_object('attributed', false, 'reason', 'invalid_code');
  end if;
  if v_referrer = p_referred then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'self_referral'));
    return jsonb_build_object('attributed', false, 'reason', 'self_referral');
  end if;
  select created_at into v_created from public.profiles where id = p_referred;
  -- only a brand-new account can be attributed: an existing member cannot be "referred" after the fact
  if v_created is null or v_created < now() - interval '2 hours' then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'not_new'));
    return jsonb_build_object('attributed', false, 'reason', 'not_new');
  end if;
  if not exists (select 1 from public.profiles where id = v_referrer and status = 'active') then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'referrer_unavailable'));
    return jsonb_build_object('attributed', false, 'reason', 'referrer_unavailable');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('referral-attr:' || v_referrer::text, 0));
  select count(*) into v_recent from public.referrals where referrer_id = v_referrer and created_at > now() - interval '24 hours';
  if v_recent >= 50 then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'referrer_rate_limited'));
    return jsonb_build_object('attributed', false, 'reason', 'rate_limited');
  end if;
  insert into public.referrals(referrer_id, referred_id, qualify_by, idempotency_key, net_hash)
  values (v_referrer, p_referred, now() + make_interval(days => greatest(public._referral_num('qualify_days'), 1)), 'referral:' || p_referred::text, nullif(left(p_net_hash, 64), ''))
  on conflict (referred_id) do nothing returning id into v_id;
  if v_id is null then
    perform public._referral_event(null, v_referrer, 'attribution_rejected', jsonb_build_object('reason', 'already_attributed'));
    return jsonb_build_object('attributed', false, 'reason', 'already_attributed');
  end if;
  perform public._referral_event(v_id, v_referrer, 'registered');
  return jsonb_build_object('attributed', true, 'referral_id', v_id);
end $$;
create or replace function public.referral_preview(p_code text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_code text := lower(btrim(coalesce(p_code, ''))); v_name text;
begin
  if not public._referral_flag('program_enabled') or v_code !~ '^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$' then return jsonb_build_object('valid', false); end if;
  select p.full_name into v_name from public.referral_codes c join public.profiles p on p.id = c.user_id where c.code = v_code and p.status = 'active';
  if v_name is null then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'name', v_name);
end $$;
revoke execute on function public._referral_new_code(text) from public, anon, authenticated;
-- the grants of the replaced functions are unchanged (create or replace keeps them)

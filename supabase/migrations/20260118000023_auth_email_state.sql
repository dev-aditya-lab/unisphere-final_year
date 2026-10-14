-- 0023: account emails are sent by UniSphere, not by Supabase Auth.
--
-- The server asks Supabase only for one-time tokens (auth.admin.generateLink, which sends nothing) and emails them
-- itself with its own templates. To decide what to send for an address that already exists (a fresh confirmation
-- link, or "you already have an account"), it needs to know whether that address is confirmed. This returns exactly
-- that and nothing else, and only to the service role: the visitor never sees the answer.
create or replace function public.auth_email_state(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when u.email_confirmed_at is null then 'unconfirmed' else 'confirmed' end
       from auth.users u
      where lower(u.email) = lower(p_email)
      limit 1),
    'none');
$$;
revoke execute on function public.auth_email_state(text) from public, anon, authenticated;
grant execute on function public.auth_email_state(text) to service_role;

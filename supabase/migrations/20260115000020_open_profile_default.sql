-- 0020: new profiles are visible to signed-in members by default.
--
-- The old default ("my college") made sense when everyone belonged to one college. With open registration a member
-- may have no college at all, and a "college-only" profile with no college is visible to nobody, so they could not be
-- found, messaged or invited to projects. "All members" still means signed-in UniSphere members only: never
-- logged-out visitors, never search engines. Existing members keep whatever they chose.
alter table public.profiles alter column visibility set default 'public';

-- UniSphere Academy, phase 3: how a course is delivered, its written syllabus and weekly timetable, and a fuller "about the instructor".
--
-- Adds columns only. Nothing here changes a price, an order or a certificate. The existing course guard trigger, RLS policies and
-- audit trigger already cover these columns (they act on the row, not on named columns).

-- ── Courses ────────────────────────────────────────────────────────────────
alter table public.academy_courses
  add column delivery_mode text not null default 'recorded' check (delivery_mode in ('recorded', 'live', 'hybrid')),
  add column syllabus_md text check (syllabus_md is null or char_length(syllabus_md) <= 20000),
  -- The weekly timetable shown on the course page: [{"day":"Mon","start":"19:00","end":"20:30","topic":"…"}]. Times are India time.
  add column timetable jsonb not null default '[]'::jsonb
    check (jsonb_typeof(timetable) = 'array' and jsonb_array_length(timetable) <= 40 and octet_length(timetable::text) <= 12000),
  add column timetable_note text check (timetable_note is null or char_length(timetable_note) <= 300);

comment on column public.academy_courses.delivery_mode is 'recorded = self-paced videos; live = scheduled classes; hybrid = both.';

create index academy_courses_mode_idx on public.academy_courses(delivery_mode) where status = 'published';

-- The rows of a timetable are checked in the database too, so a hand-made request cannot store anything else.
create or replace function public._academy_timetable_valid(p_rows jsonb) returns boolean
language sql immutable set search_path = '' as $$
  -- A row with a missing field makes a comparison NULL; bool_and would skip it, so every row is forced to true/false first.
  select coalesce(bool_and(coalesce(
    jsonb_typeof(r) = 'object'
    and (r ->> 'day') in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
    and (r ->> 'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and (r ->> 'end') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    and (r ->> 'end') > (r ->> 'start')
    and char_length(coalesce(r ->> 'topic', '')) <= 120,
  false)), true)
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r;
$$;
alter table public.academy_courses add constraint academy_courses_timetable_rows check (public._academy_timetable_valid(timetable));

-- ── Mentors ("About the instructor") ───────────────────────────────────────
alter table public.academy_mentors
  -- A copy of the member's own profile picture key, taken when an administrator saves the mentor (so the public page reads no profile).
  add column photo_key text check (photo_key is null or char_length(photo_key) <= 200),
  add column expertise text[] not null default '{}' check (cardinality(expertise) <= 8),
  add column experience_years integer check (experience_years is null or experience_years between 0 and 60),
  add column linkedin_url text check (linkedin_url is null or (linkedin_url ~ '^https://[^\s]+$' and char_length(linkedin_url) <= 300)),
  add column website_url text check (website_url is null or (website_url ~ '^https://[^\s]+$' and char_length(website_url) <= 300));
-- A longer bio now that it has its own section.
alter table public.academy_mentors drop constraint if exists academy_mentors_bio_check;
alter table public.academy_mentors add constraint academy_mentors_bio_check check (bio is null or char_length(bio) <= 1500);

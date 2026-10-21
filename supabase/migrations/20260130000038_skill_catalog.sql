-- 0038: Skills and interests catalog, managed from the admin console.
-- Members still type anything they like; the catalog is what the pickers suggest. It is broad on purpose (design, writing,
-- business, health, arts, languages, sports, trades, not only coding), and administrators extend it from Admin -> Skills,
-- where the skills members have typed that are not listed yet are shown with a one-click "Add".

create table public.skill_catalog (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('skill', 'interest')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  category text not null check (char_length(btrim(category)) between 2 and 40),
  is_active boolean not null default true,
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index skill_catalog_kind_name_idx on public.skill_catalog (kind, lower(btrim(name)));
create index skill_catalog_list_idx on public.skill_catalog (kind, category, sort_order);

alter table public.skill_catalog enable row level security;
grant select on public.skill_catalog to authenticated;
create policy skill_catalog_read on public.skill_catalog for select to authenticated using (is_active);

insert into public.skill_catalog (kind, name, category, sort_order) values
  ('skill', 'Python', 'Technology', 10),
  ('skill', 'R', 'Technology', 20),
  ('skill', 'JavaScript', 'Technology', 30),
  ('skill', 'TypeScript', 'Technology', 40),
  ('skill', 'Java', 'Technology', 50),
  ('skill', 'C++', 'Technology', 60),
  ('skill', 'C', 'Technology', 70),
  ('skill', 'SQL', 'Technology', 80),
  ('skill', 'React', 'Technology', 90),
  ('skill', 'Node.js', 'Technology', 100),
  ('skill', 'Web Development', 'Technology', 110),
  ('skill', 'Mobile Apps', 'Technology', 120),
  ('skill', 'Machine Learning', 'Technology', 130),
  ('skill', 'Artificial Intelligence', 'Technology', 140),
  ('skill', 'Data Analysis', 'Technology', 150),
  ('skill', 'Data Structures & Algorithms', 'Technology', 160),
  ('skill', 'Cloud Computing', 'Technology', 170),
  ('skill', 'Cybersecurity', 'Technology', 180),
  ('skill', 'DevOps', 'Technology', 190),
  ('skill', 'Git', 'Technology', 200),
  ('skill', 'Embedded Systems', 'Technology', 210),
  ('skill', 'Robotics', 'Technology', 220),
  ('skill', 'IoT', 'Technology', 230),
  ('skill', 'Blockchain', 'Technology', 240),
  ('skill', 'Game Development', 'Technology', 250),
  ('skill', 'Excel', 'Technology', 260),
  ('skill', 'UI/UX Design', 'Design & Creative', 10),
  ('skill', 'Graphic Design', 'Design & Creative', 20),
  ('skill', 'Figma', 'Design & Creative', 30),
  ('skill', 'Canva', 'Design & Creative', 40),
  ('skill', 'Photography', 'Design & Creative', 50),
  ('skill', 'Photo Editing', 'Design & Creative', 60),
  ('skill', 'Video Editing', 'Design & Creative', 70),
  ('skill', 'Animation', 'Design & Creative', 80),
  ('skill', 'Motion Graphics', 'Design & Creative', 90),
  ('skill', 'Illustration', 'Design & Creative', 100),
  ('skill', 'Logo Design', 'Design & Creative', 110),
  ('skill', '3D Modelling', 'Design & Creative', 120),
  ('skill', 'Typography', 'Design & Creative', 130),
  ('skill', 'Sketching', 'Design & Creative', 140),
  ('skill', 'Fashion Design', 'Design & Creative', 150),
  ('skill', 'Interior Design', 'Design & Creative', 160),
  ('skill', 'Content Creation', 'Design & Creative', 170),
  ('skill', 'Content Writing', 'Writing & Communication', 10),
  ('skill', 'Copywriting', 'Writing & Communication', 20),
  ('skill', 'Creative Writing', 'Writing & Communication', 30),
  ('skill', 'Technical Writing', 'Writing & Communication', 40),
  ('skill', 'Editing & Proofreading', 'Writing & Communication', 50),
  ('skill', 'Journalism', 'Writing & Communication', 60),
  ('skill', 'Blogging', 'Writing & Communication', 70),
  ('skill', 'Poetry', 'Writing & Communication', 80),
  ('skill', 'Storytelling', 'Writing & Communication', 90),
  ('skill', 'Public Speaking', 'Writing & Communication', 100),
  ('skill', 'Debating', 'Writing & Communication', 110),
  ('skill', 'Presentation Skills', 'Writing & Communication', 120),
  ('skill', 'Anchoring & MC', 'Writing & Communication', 130),
  ('skill', 'Podcasting', 'Writing & Communication', 140),
  ('skill', 'Translation', 'Writing & Communication', 150),
  ('skill', 'Marketing', 'Business & Management', 10),
  ('skill', 'Digital Marketing', 'Business & Management', 20),
  ('skill', 'Social Media Management', 'Business & Management', 30),
  ('skill', 'SEO', 'Business & Management', 40),
  ('skill', 'Sales', 'Business & Management', 50),
  ('skill', 'Entrepreneurship', 'Business & Management', 60),
  ('skill', 'Project Management', 'Business & Management', 70),
  ('skill', 'Product Management', 'Business & Management', 80),
  ('skill', 'Business Strategy', 'Business & Management', 90),
  ('skill', 'Market Research', 'Business & Management', 100),
  ('skill', 'Finance', 'Business & Management', 110),
  ('skill', 'Accounting', 'Business & Management', 120),
  ('skill', 'Financial Modelling', 'Business & Management', 130),
  ('skill', 'Operations', 'Business & Management', 140),
  ('skill', 'Supply Chain', 'Business & Management', 150),
  ('skill', 'Human Resources', 'Business & Management', 160),
  ('skill', 'Negotiation', 'Business & Management', 170),
  ('skill', 'Event Management', 'Business & Management', 180),
  ('skill', 'Fundraising', 'Business & Management', 190),
  ('skill', 'Consulting', 'Business & Management', 200),
  ('skill', 'Mathematics', 'Science & Engineering', 10),
  ('skill', 'Statistics', 'Science & Engineering', 20),
  ('skill', 'Physics', 'Science & Engineering', 30),
  ('skill', 'Chemistry', 'Science & Engineering', 40),
  ('skill', 'Biology', 'Science & Engineering', 50),
  ('skill', 'Research', 'Science & Engineering', 60),
  ('skill', 'Lab Techniques', 'Science & Engineering', 70),
  ('skill', 'MATLAB', 'Science & Engineering', 80),
  ('skill', 'CAD', 'Science & Engineering', 90),
  ('skill', 'AutoCAD', 'Science & Engineering', 100),
  ('skill', 'SolidWorks', 'Science & Engineering', 110),
  ('skill', 'Circuit Design', 'Science & Engineering', 120),
  ('skill', 'Electrical Wiring', 'Science & Engineering', 130),
  ('skill', 'Structural Design', 'Science & Engineering', 140),
  ('skill', 'Surveying', 'Science & Engineering', 150),
  ('skill', '3D Printing', 'Science & Engineering', 160),
  ('skill', 'Environmental Science', 'Science & Engineering', 170),
  ('skill', 'Agriculture', 'Science & Engineering', 180),
  ('skill', 'First Aid', 'Health & Wellbeing', 10),
  ('skill', 'Nursing', 'Health & Wellbeing', 20),
  ('skill', 'Nutrition', 'Health & Wellbeing', 30),
  ('skill', 'Fitness Training', 'Health & Wellbeing', 40),
  ('skill', 'Yoga', 'Health & Wellbeing', 50),
  ('skill', 'Meditation', 'Health & Wellbeing', 60),
  ('skill', 'Counselling', 'Health & Wellbeing', 70),
  ('skill', 'Mental Health Support', 'Health & Wellbeing', 80),
  ('skill', 'Public Health', 'Health & Wellbeing', 90),
  ('skill', 'Pharmacy', 'Health & Wellbeing', 100),
  ('skill', 'Physiotherapy', 'Health & Wellbeing', 110),
  ('skill', 'Singing', 'Arts, Music & Culture', 10),
  ('skill', 'Guitar', 'Arts, Music & Culture', 20),
  ('skill', 'Piano', 'Arts, Music & Culture', 30),
  ('skill', 'Instrumental Music', 'Arts, Music & Culture', 40),
  ('skill', 'Classical Music', 'Arts, Music & Culture', 50),
  ('skill', 'Music Production', 'Arts, Music & Culture', 60),
  ('skill', 'Dance', 'Arts, Music & Culture', 70),
  ('skill', 'Theatre & Acting', 'Arts, Music & Culture', 80),
  ('skill', 'Painting', 'Arts, Music & Culture', 90),
  ('skill', 'Drawing', 'Arts, Music & Culture', 100),
  ('skill', 'Calligraphy', 'Arts, Music & Culture', 110),
  ('skill', 'Film Making', 'Arts, Music & Culture', 120),
  ('skill', 'Craft & DIY', 'Arts, Music & Culture', 130),
  ('skill', 'Cooking', 'Arts, Music & Culture', 140),
  ('skill', 'Baking', 'Arts, Music & Culture', 150),
  ('skill', 'Mehendi', 'Arts, Music & Culture', 160),
  ('skill', 'English', 'Languages', 10),
  ('skill', 'Hindi', 'Languages', 20),
  ('skill', 'Bengali', 'Languages', 30),
  ('skill', 'Tamil', 'Languages', 40),
  ('skill', 'Telugu', 'Languages', 50),
  ('skill', 'Marathi', 'Languages', 60),
  ('skill', 'Gujarati', 'Languages', 70),
  ('skill', 'Urdu', 'Languages', 80),
  ('skill', 'Punjabi', 'Languages', 90),
  ('skill', 'Kannada', 'Languages', 100),
  ('skill', 'Malayalam', 'Languages', 110),
  ('skill', 'Sanskrit', 'Languages', 120),
  ('skill', 'French', 'Languages', 130),
  ('skill', 'German', 'Languages', 140),
  ('skill', 'Spanish', 'Languages', 150),
  ('skill', 'Japanese', 'Languages', 160),
  ('skill', 'Mandarin', 'Languages', 170),
  ('skill', 'Sign Language', 'Languages', 180),
  ('skill', 'Leadership', 'Leadership & Community', 10),
  ('skill', 'Teamwork', 'Leadership & Community', 20),
  ('skill', 'Volunteering', 'Leadership & Community', 30),
  ('skill', 'Community Organising', 'Leadership & Community', 40),
  ('skill', 'Mentoring', 'Leadership & Community', 50),
  ('skill', 'Teaching & Tutoring', 'Leadership & Community', 60),
  ('skill', 'Time Management', 'Leadership & Community', 70),
  ('skill', 'Problem Solving', 'Leadership & Community', 80),
  ('skill', 'Critical Thinking', 'Leadership & Community', 90),
  ('skill', 'Conflict Resolution', 'Leadership & Community', 100),
  ('skill', 'Public Policy', 'Leadership & Community', 110),
  ('skill', 'Legal Research', 'Leadership & Community', 120),
  ('skill', 'Civil Services Preparation', 'Leadership & Community', 130),
  ('skill', 'NSS / NCC', 'Leadership & Community', 140),
  ('skill', 'Campus Ambassador', 'Leadership & Community', 150),
  ('skill', 'Cricket', 'Sports & Games', 10),
  ('skill', 'Football', 'Sports & Games', 20),
  ('skill', 'Basketball', 'Sports & Games', 30),
  ('skill', 'Volleyball', 'Sports & Games', 40),
  ('skill', 'Badminton', 'Sports & Games', 50),
  ('skill', 'Table Tennis', 'Sports & Games', 60),
  ('skill', 'Athletics', 'Sports & Games', 70),
  ('skill', 'Swimming', 'Sports & Games', 80),
  ('skill', 'Kabaddi', 'Sports & Games', 90),
  ('skill', 'Kho-Kho', 'Sports & Games', 100),
  ('skill', 'Chess', 'Sports & Games', 110),
  ('skill', 'Carrom', 'Sports & Games', 120),
  ('skill', 'Martial Arts', 'Sports & Games', 130),
  ('skill', 'Cycling', 'Sports & Games', 140),
  ('skill', 'Trekking', 'Sports & Games', 150),
  ('skill', 'Esports', 'Sports & Games', 160),
  ('skill', 'Tailoring', 'Hands-on & Trades', 10),
  ('skill', 'Carpentry', 'Hands-on & Trades', 20),
  ('skill', 'Welding', 'Hands-on & Trades', 30),
  ('skill', 'Repair & Maintenance', 'Hands-on & Trades', 40),
  ('skill', 'Gardening', 'Hands-on & Trades', 50),
  ('skill', 'Driving', 'Hands-on & Trades', 60),
  ('skill', 'Handicrafts', 'Hands-on & Trades', 70),
  ('interest', 'Artificial Intelligence', 'Technology & Science', 10),
  ('interest', 'Robotics', 'Technology & Science', 20),
  ('interest', 'Space & Astronomy', 'Technology & Science', 30),
  ('interest', 'Open Source', 'Technology & Science', 40),
  ('interest', 'Startups', 'Technology & Science', 50),
  ('interest', 'Gadgets', 'Technology & Science', 60),
  ('interest', 'Cybersecurity', 'Technology & Science', 70),
  ('interest', 'Gaming', 'Technology & Science', 80),
  ('interest', 'Climate & Sustainability', 'Technology & Science', 90),
  ('interest', 'Renewable Energy', 'Technology & Science', 100),
  ('interest', 'Music', 'Arts & Culture', 10),
  ('interest', 'Movies', 'Arts & Culture', 20),
  ('interest', 'Anime', 'Arts & Culture', 30),
  ('interest', 'Books & Reading', 'Arts & Culture', 40),
  ('interest', 'Poetry', 'Arts & Culture', 50),
  ('interest', 'Theatre', 'Arts & Culture', 60),
  ('interest', 'Photography', 'Arts & Culture', 70),
  ('interest', 'Art & Design', 'Arts & Culture', 80),
  ('interest', 'Fashion', 'Arts & Culture', 90),
  ('interest', 'Travel', 'Arts & Culture', 100),
  ('interest', 'Food & Cooking', 'Arts & Culture', 110),
  ('interest', 'History', 'Arts & Culture', 120),
  ('interest', 'Philosophy', 'Arts & Culture', 130),
  ('interest', 'Mythology', 'Arts & Culture', 140),
  ('interest', 'Languages', 'Arts & Culture', 150),
  ('interest', 'Education', 'Society & Career', 10),
  ('interest', 'Healthcare', 'Society & Career', 20),
  ('interest', 'Finance & Investing', 'Society & Career', 30),
  ('interest', 'Entrepreneurship', 'Society & Career', 40),
  ('interest', 'Social Work', 'Society & Career', 50),
  ('interest', 'Politics & Policy', 'Society & Career', 60),
  ('interest', 'Law', 'Society & Career', 70),
  ('interest', 'Journalism', 'Society & Career', 80),
  ('interest', 'Environment', 'Society & Career', 90),
  ('interest', 'Agriculture', 'Society & Career', 100),
  ('interest', 'Mental Wellbeing', 'Society & Career', 110),
  ('interest', 'Women in STEM', 'Society & Career', 120),
  ('interest', 'Civil Services', 'Society & Career', 130),
  ('interest', 'Research', 'Society & Career', 140),
  ('interest', 'Fitness', 'Lifestyle & Sports', 10),
  ('interest', 'Yoga', 'Lifestyle & Sports', 20),
  ('interest', 'Meditation', 'Lifestyle & Sports', 30),
  ('interest', 'Cricket', 'Lifestyle & Sports', 40),
  ('interest', 'Football', 'Lifestyle & Sports', 50),
  ('interest', 'Chess', 'Lifestyle & Sports', 60),
  ('interest', 'Cycling', 'Lifestyle & Sports', 70),
  ('interest', 'Trekking', 'Lifestyle & Sports', 80),
  ('interest', 'Pets & Animals', 'Lifestyle & Sports', 90),
  ('interest', 'Gardening', 'Lifestyle & Sports', 100),
  ('interest', 'DIY', 'Lifestyle & Sports', 110),
  ('interest', 'Board Games', 'Lifestyle & Sports', 120),
  ('interest', 'Volunteering', 'Lifestyle & Sports', 130);

insert into public.role_permissions(role, permission) values ('global_admin', 'skills.manage') on conflict do nothing;

create or replace function public._skills_admin() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_permission('skills.manage', null) then raise exception 'forbidden' using errcode = '42501'; end if;
  return v;
end $$;

-- How many members use each skill or interest (case-insensitive), from what they typed in their profile.
create or replace function public._skill_usage() returns table (kind text, k text, members bigint) language sql stable security definer set search_path = '' as $$
  select 'skill', lower(btrim(s)), count(*) from public.profiles p, unnest(p.skills) s where btrim(s) <> '' group by 2
  union all
  select 'interest', lower(btrim(i)), count(*) from public.profiles p, unnest(p.interests) i where btrim(i) <> '' group by 2
$$;

create or replace function public.admin_list_skills(
  p_kind text default null, p_category text default null, p_q text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0
) returns table (id uuid, kind text, name text, category text, is_active boolean, sort_order integer, members bigint, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._skills_admin();
  return query
    select c.id, c.kind, c.name, c.category, c.is_active, c.sort_order, coalesce(u.members, 0), count(*) over ()
    from public.skill_catalog c
    left join public._skill_usage() u on u.kind = c.kind and u.k = lower(btrim(c.name))
    where (p_kind is null or c.kind = p_kind)
      and (p_category is null or c.category = p_category)
      and (p_q is null or c.name ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%')
      and (p_status is null or (p_status = 'active' and c.is_active) or (p_status = 'hidden' and not c.is_active))
    order by c.kind, c.category, c.sort_order, c.name
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_skill_categories() returns table (kind text, category text, items bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._skills_admin();
  return query select c.kind, c.category, count(*) from public.skill_catalog c group by 1, 2 order by 1, 2;
end $$;

create or replace function public.admin_save_skill(
  p_id uuid, p_kind text, p_name text, p_category text, p_active boolean, p_sort integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._skills_admin(); v_id uuid; v_name text := regexp_replace(btrim(p_name), '\s+', ' ', 'g'); v_cat text := regexp_replace(btrim(p_category), '\s+', ' ', 'g');
begin
  if p_kind not in ('skill', 'interest') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if char_length(v_name) not between 1 and 40 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if char_length(v_cat) not between 2 and 40 then raise exception 'invalid_category' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.skill_catalog(kind, name, category, is_active, sort_order, created_by)
      values (p_kind, v_name, v_cat, coalesce(p_active, true), coalesce(p_sort, 100), v_actor) returning id into v_id;
  else
    update public.skill_catalog set kind = p_kind, name = v_name, category = v_cat, is_active = coalesce(p_active, is_active), sort_order = coalesce(p_sort, sort_order), updated_at = now()
      where skill_catalog.id = p_id returning skill_catalog.id into v_id;
    if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  perform public.write_audit_log(v_actor, 'skills.saved', 'skill_catalog', v_id::text, null, jsonb_build_object('kind', p_kind, 'name', v_name, 'category', v_cat, 'active', coalesce(p_active, true)));
  return v_id;
exception when unique_violation then
  raise exception 'duplicate_skill' using errcode = '23505';
end $$;

create or replace function public.admin_delete_skill(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public._skills_admin(); v_row public.skill_catalog%rowtype;
begin
  delete from public.skill_catalog where skill_catalog.id = p_id returning * into v_row;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.write_audit_log(v_actor, 'skills.deleted', 'skill_catalog', p_id::text, null, jsonb_build_object('kind', v_row.kind, 'name', v_row.name));
end $$;

-- Skills and interests members typed that are not in the catalog yet, most used first (spelling and case folded).
create or replace function public.admin_unlisted_skills(p_kind text default 'skill', p_limit integer default 30)
returns table (name text, members bigint) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._skills_admin();
  return query
    with typed as (
      select lower(btrim(s)) k, min(btrim(s)) shown, count(*) n
      from public.profiles p, unnest(case when p_kind = 'interest' then p.interests else p.skills end) s
      where btrim(s) <> '' and char_length(btrim(s)) between 2 and 40 group by 1)
    select t.shown, t.n from typed t
    where not exists (select 1 from public.skill_catalog c where c.kind = p_kind and lower(btrim(c.name)) = t.k)
    order by t.n desc, t.shown limit least(greatest(p_limit, 1), 100);
end $$;

revoke execute on function public._skills_admin(), public._skill_usage() from public, anon, authenticated;
revoke execute on function public.admin_list_skills(text, text, text, text, integer, integer), public.admin_skill_categories(),
  public.admin_save_skill(uuid, text, text, text, boolean, integer), public.admin_delete_skill(uuid), public.admin_unlisted_skills(text, integer) from public, anon;
grant execute on function public.admin_list_skills(text, text, text, text, integer, integer), public.admin_skill_categories(),
  public.admin_save_skill(uuid, text, text, text, boolean, integer), public.admin_delete_skill(uuid), public.admin_unlisted_skills(text, integer) to authenticated;

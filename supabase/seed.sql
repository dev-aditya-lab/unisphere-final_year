-- DEVELOPMENT SEED DATA — applied by `supabase db reset` only.
-- Never run against production. Real colleges are created by platform
-- administrators; demo users are created by `npm run seed:dev` (needs Auth API).

insert into public.colleges (id, slug, name, short_name, city, state, verification_mode)
values
  ('00000000-0000-4000-8000-000000000001', 'greenfield-institute', 'Greenfield Institute of Technology (demo)', 'GIT', 'Pune', 'Maharashtra', 'manual'),
  ('00000000-0000-4000-8000-000000000002', 'riverside-university', 'Riverside University (demo)', 'RU', 'Bengaluru', 'Karnataka', 'manual')
on conflict (id) do nothing;

insert into public.campuses (college_id, name, city) values
  ('00000000-0000-4000-8000-000000000001', 'Main Campus', 'Pune'),
  ('00000000-0000-4000-8000-000000000002', 'Central Campus', 'Bengaluru')
on conflict do nothing;

insert into public.departments (college_id, slug, name, code) values
  ('00000000-0000-4000-8000-000000000001', 'computer-science', 'Computer Science & Engineering', 'CSE'),
  ('00000000-0000-4000-8000-000000000001', 'electronics', 'Electronics & Communication', 'ECE'),
  ('00000000-0000-4000-8000-000000000001', 'mechanical', 'Mechanical Engineering', 'ME'),
  ('00000000-0000-4000-8000-000000000001', 'civil', 'Civil Engineering', 'CE'),
  ('00000000-0000-4000-8000-000000000002', 'computer-science', 'Computer Science', 'CS'),
  ('00000000-0000-4000-8000-000000000002', 'business', 'Business Administration', 'MBA')
on conflict do nothing;

insert into public.academic_programs (college_id, department_id, name, degree_level, duration_years)
select d.college_id, d.id, p.name, p.level, p.years
from public.departments d
join (values
  ('computer-science', 'B.Tech Computer Science & Engineering', 'undergraduate', 4),
  ('electronics', 'B.Tech Electronics & Communication', 'undergraduate', 4),
  ('mechanical', 'B.Tech Mechanical Engineering', 'undergraduate', 4),
  ('civil', 'B.Tech Civil Engineering', 'undergraduate', 4),
  ('business', 'MBA', 'postgraduate', 2)
) as p(dept_slug, name, level, years) on p.dept_slug = d.slug
on conflict do nothing;

-- Development and the automated tests behave like an open platform; production keeps the migration default
-- (publishing requires a verified student ID). Turn it on locally in /admin/settings to try the full flow.
update public.system_settings set value = 'false' where key = 'college_verification_required';

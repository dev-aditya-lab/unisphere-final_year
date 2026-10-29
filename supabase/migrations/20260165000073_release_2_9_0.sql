-- Release note for 2.9.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.9.0', 'Sign in with Google, live classes on Google Meet, and automatic offers',
  'Join with one tap, get class invitations in your inbox, and see offers that apply by themselves.',
  '[{"kind":"new","text":"Continue with Google on the sign-in and sign-up pages. You still choose your privacy settings, and your email and password keep working."},
    {"kind":"new","text":"Live classes on Google Meet. Enrolled students get a Google Calendar invitation by email and join directly; people who were not enrolled have to ask to be let in."},
    {"kind":"new","text":"Courses can be live, recorded or both, with a written syllabus, a weekly timetable and a fuller About the instructor section."},
    {"kind":"new","text":"Offers that apply by themselves, like a welcome offer or an early-bird price, with a real countdown and the real number of places left. A small celebration plays when you qualify."},
    {"kind":"improved","text":"Academy payment receipts and Academy notification emails now come from UniSphere Academy."}]'::jsonb,
  null)
on conflict (version) do nothing;

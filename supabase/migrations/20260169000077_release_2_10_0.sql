-- Release note for 2.10.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.10.0', 'A schedule, live classes that run themselves, and a Teaching page',
  'Classes start and finish by themselves, everyone is told, and certificates arrive on their own.',
  '[{"kind":"new","text":"A live class now shows as Live now on your Academy overview, with a Join button, from an hour before it starts."},
    {"kind":"new","text":"My schedule: this week''s classes, your courses'' weekly timetable and your deadlines in one place, with a calendar file you can add to Google or Apple Calendar."},
    {"kind":"new","text":"See what is left for each certificate. When you meet every requirement it is issued automatically and you are told."},
    {"kind":"new","text":"A Teaching page for instructors and mentors: next class, work waiting to be reviewed, students and who joined. They are now notified about new classes, enrolments and submitted work."},
    {"kind":"improved","text":"Students are told when a class is scheduled, moved, cancelled or starting. Classes go live and finish by themselves."},
    {"kind":"improved","text":"The Academy admin forms are grouped under plain headings, and each course has a checklist of what is left before it can be published."}]'::jsonb,
  null)
on conflict (version) do nothing;

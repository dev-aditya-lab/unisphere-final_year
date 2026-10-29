-- Release note for 2.8.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.8.0', 'UniSphere Academy',
  'Courses, guided projects and mentor feedback, with certificates anyone can verify.',
  '[{"kind":"new","text":"UniSphere Academy at /academy: courses, programs and project internships with video lessons, quizzes, assignments and mentor feedback. Free courses open straight away; paid ones are bought with the same secure checkout used for the blue tick."},
    {"kind":"new","text":"Certificates you can prove. Finish a course and a mentor-approved certificate is issued with its own ID and a QR code. Anyone can check it at /academy/verify without signing in, and sees only what you agreed to share."},
    {"kind":"new","text":"Academy notifications with their own switch in Settings > Notifications: enrolment and payment receipts, refund updates, live class and deadline reminders, mentor feedback, course completion and certificates."},
    {"kind":"improved","text":"Coupon codes and limited-time prices are checked on the server, and the total is shown before you pay."}]'::jsonb,
  null)
on conflict (version) do nothing;

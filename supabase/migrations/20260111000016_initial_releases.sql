-- 0016: the product's real release history, so the public changelog is not empty on day one.
insert into public.releases (version, title, summary, items, published_at) values
  ('0.1.0', 'Foundation', 'Accounts, profiles and the trust model.', '[
    {"kind":"new","text":"Sign up, log in, reset your password and manage your sessions"},
    {"kind":"new","text":"Profiles with skills, interests, achievements, experience and a completion checklist"},
    {"kind":"new","text":"Privacy controls: choose who sees your profile, your class details and who may message you"},
    {"kind":"new","text":"College verification with a verified badge"},
    {"kind":"security","text":"Row-level security on every table, scoped staff roles and an append-only audit log"}
  ]'::jsonb, now()),
  ('0.2.0', 'Share and discover', 'Posts, comments, the feed and finding people.', '[
    {"kind":"new","text":"Posts in categories (projects, ideas, questions, achievements and more) with images, hashtags and mentions"},
    {"kind":"new","text":"Comments, replies, reactions, bookmarks and reposts"},
    {"kind":"new","text":"A filterable feed, search and an Explore page with trending tags"},
    {"kind":"new","text":"Connections, follows, blocking and reporting"}
  ]'::jsonb, now()),
  ('0.3.0', 'Ideas, projects and AI', 'Find related work before you build, and find the people to build it with.', '[
    {"kind":"new","text":"Idea discovery: see related ideas and projects on campus, with an explanation of why"},
    {"kind":"new","text":"Originality check and writing assistant, always optional and never posted without your approval"},
    {"kind":"new","text":"Projects with open roles, join requests, invitations and teammate suggestions"},
    {"kind":"new","text":"Alumni directory and mentoring requests"},
    {"kind":"improved","text":"AI features can be switched off per member, and private posts are never sent to an AI provider"}
  ]'::jsonb, now()),
  ('0.4.0', 'Stay in touch', 'Notifications, messages, events and communities.', '[
    {"kind":"new","text":"Real-time notifications with per-category in-app and email preferences"},
    {"kind":"new","text":"Direct messages with read receipts, typing indicators and attachments"},
    {"kind":"new","text":"Events with RSVP, waitlists, reminders and calendar files"},
    {"kind":"new","text":"Clubs and communities, official college announcements and an opportunities board"}
  ]'::jsonb, now()),
  ('0.5.0', 'Safety and administration', 'Everything the team needs to keep the community healthy.', '[
    {"kind":"new","text":"Admin console: reports, appeals, verification, members, roles, announcements and support inbox"},
    {"kind":"new","text":"Appeals: any moderation decision can be challenged once, and a different moderator decides"},
    {"kind":"new","text":"Analytics, an audit log viewer, AI status, feature flags and platform settings"},
    {"kind":"new","text":"Download a copy of your own data from Settings, Security"}
  ]'::jsonb, now()),
  ('0.6.0', 'Made for Ramgarh Engineering College', 'UniSphere is now the campus network of RGEC.', '[
    {"kind":"new","text":"Verify with your student ID. It is checked privately against the college list and never stored or shown"},
    {"kind":"new","text":"Each student ID links to exactly one account"},
    {"kind":"improved","text":"Publishing requires a verified RGEC student ID"}
  ]'::jsonb, now()),
  ('0.7.0', 'UniSphere as an app', 'Install it, and hear from it even when it is closed.', '[
    {"kind":"new","text":"Install UniSphere on your phone or computer from your browser"},
    {"kind":"new","text":"Push notifications for messages, replies and updates, with no message text on your lock screen"},
    {"kind":"new","text":"A friendly offline screen, faster repeat visits and one-tap updates"}
  ]'::jsonb, now()),
  ('0.8.0', 'Your voice', 'Tell us what is broken and what to build next.', '[
    {"kind":"new","text":"Report bugs and send feedback straight from the app"},
    {"kind":"new","text":"Suggest features and vote on other people''s ideas"},
    {"kind":"new","text":"A public roadmap and this changelog"}
  ]'::jsonb, now())
on conflict (version) do nothing;

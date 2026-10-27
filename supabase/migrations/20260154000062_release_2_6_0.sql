-- 0062: release note for 2.6.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.6.0', 'UniSphere for Android',
  'UniSphere is now an Android app, with notifications on your phone, a back button that behaves, and links that open in the app.',
  '[{"kind":"new","text":"UniSphere is an app for Android. It opens straight to your feed, keeps you signed in, and follows your phone''s back button: it closes an open sheet first, then goes back a page, then leaves the app."},
    {"kind":"new","text":"Notifications on your phone. Turn them on in Settings > Notifications and UniSphere tells you about new messages, replies, mentions and event reminders, even when the app is closed. Messages, replies and events are separate switches in your phone''s own notification settings. Message text is never shown on your lock screen."},
    {"kind":"new","text":"Links to UniSphere open in the app: a post someone sends you, an invite, or the link in a sign-in email."},
    {"kind":"improved","text":"If you cannot connect, the app shows a friendly screen and reconnects by itself. If UniSphere is slow to wake up, it says so instead of showing a blank page."},
    {"kind":"improved","text":"Downloads work inside the app, including your data export and files attached to posts and messages."},
    {"kind":"improved","text":"Your signed-in session is saved as soon as you leave the app, so the phone closing it in the background no longer signs you out."}]'::jsonb,
  null)
on conflict (version) do nothing;

-- 0056: release note for 2.3.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.3.0', 'Community spaces',
  'Categories and channels for every community, roles and invitations, safer attachments, reports with appeals, and a platform view of community safety.',
  '[{"kind":"new","text":"Communities have categories and channels: announcements, discussion, questions and answers, resources, project rooms and private staff channels, with read and post permissions, slow mode and pinned messages."},
    {"kind":"new","text":"Roles: owner, administrator, moderator and member. The owner can hand the community over. Every change to roles, channels and settings is in an audit log."},
    {"kind":"new","text":"Invitation links that expire, have a use limit and can be revoked, requests to join, and an optional rules acceptance."},
    {"kind":"new","text":"Community icon and banner with crop and preview, checked on the server."},
    {"kind":"new","text":"Report a message or a member; moderators warn, time out, remove or ban with a reason, and the member can appeal for 30 days."},
    {"kind":"new","text":"Notifications for mentions, replies and announcements, with mute for a channel or a community. Optional AI summary of a public channel."},
    {"kind":"improved","text":"Messages and channel messages support Markdown with a preview. Attachments have View, Download and Copy link, and a bottom sheet on phones."},
    {"kind":"fixed","text":"Deleting a direct message now also stops its attachment from being readable and removes the stored file."},
    {"kind":"security","text":"Community administrators could set a community picture to any stored file; pictures are now attached only after the server checks them. Members could list who was banned or waiting in a community; now only moderators can."}]'::jsonb,
  null)
on conflict (version) do nothing;

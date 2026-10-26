-- 0058: release note for 2.4.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.4.0', 'A calmer home feed',
  'A cleaner home page with sticky tabs, a one-line announcement and one "today" row, a redesigned post card, and reactions with their own icons and animations.',
  '[{"kind":"new","text":"Reactions have their own icon and colour: like, insightful, celebrate and curious. Touch and hold (or rest the mouse on) Like to open the tray; the small face button opens it too, and it works with the keyboard."},
    {"kind":"new","text":"Counts roll like an odometer, a reaction springs in with a ring of dots, saving a post has its own animation, and phones that support it give a small vibration. Back to top appears when you scroll up a long feed."},
    {"kind":"new","text":"On a phone, Share opens the system share sheet; elsewhere it still copies the link."},
    {"kind":"improved","text":"The home page is quieter: the tab bar for For you, College, Following and Everyone stays under the top bar (and steps aside while you scroll down on a phone), the type filter is a lighter row of chips, announcements are one line that opens, and the Orbits panel is one compact row."},
    {"kind":"improved","text":"The composer has one-tap starters for a photo, project, idea, question or achievement. Post cards are cleaner, tinted by type, and long posts end with a Read more link."},
    {"kind":"improved","text":"Tabs and filters answer the tap at once, before the server replies. Cards off screen are skipped while rendering, so long feeds stay smooth. All motion respects reduced-motion settings."}]'::jsonb,
  null)
on conflict (version) do nothing;

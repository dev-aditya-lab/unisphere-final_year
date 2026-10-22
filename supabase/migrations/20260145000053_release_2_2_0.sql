-- 0053: release note for 2.2.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.2.0', 'Better writing',
  'Markdown in posts, a formatting toolbar with preview, and captions that sound like you.',
  '[{"kind":"new","text":"Posts and comments support Markdown: bold, italic, lists, quotes, code and links, with a Preview that matches the published post."},
    {"kind":"new","text":"A formatting toolbar in the composer and when editing a post, with keyboard shortcuts, that keeps your selection."},
    {"kind":"new","text":"Write caption: turns your notes into one natural caption in a tone you choose. Only your own facts are used, and nothing is posted until you press Post."},
    {"kind":"improved","text":"Improve writing keeps your voice, avoids stock phrases, and never adds numbers or links you did not write."},
    {"kind":"security","text":"Post text is rendered without raw HTML, images or unsafe link types."}]'::jsonb,
  null)
on conflict (version) do nothing;

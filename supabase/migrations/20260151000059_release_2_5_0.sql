-- 0059: release note for 2.5.0 (a DRAFT: publish it from Admin > Releases when this version is live)
insert into public.releases(version, title, summary, items, published_at) values (
  '2.5.0', 'A bolder, smoother public site',
  'The home page and the rest of the public site have a new black, white and blue look, an opening animation, a 3D planet, and scroll smoothly as you read.',
  '[{"kind":"improved","text":"The public site has a new look: black and white with the royal blue of the app as the one accent, big rounded type, and bold sections that alternate between light and dark. It covers the home page and the features, about, FAQ, pricing and policy pages, in light and dark."},
    {"kind":"new","text":"The home page opens with a short loading animation and a hero with a real 3D planet that follows your pointer and flies toward you as you scroll. The animation plays once per visit and can be skipped with a click or a key."},
    {"kind":"new","text":"The home page scrolls smoothly and moves as you read: a strip of words that reacts to how fast you scroll, a sentence that fills in as you read it, a How it works section that holds in place while three panels slide sideways along a drawing path, headlines that rise line by line, and pictures that open as they scroll in."},
    {"kind":"new","text":"Refer and Earn has a spotlight of its own: a glowing stage with the Orbits planet and its moons, your invite link, and a friend''s progress filling in step by step."},
    {"kind":"new","text":"With a mouse on a computer, the home page has a few extra touches: a small cursor, buttons that lean toward the pointer, and pictures that ripple, zoom, or follow the pointer along the list of communities."},
    {"kind":"improved","text":"The home page works the same without any of the animation. It is switched off when your device asks for reduced motion, and the 3D planet and the extras are skipped on phones, in data-saver mode and on slow connections or devices that cannot draw them smoothly."}]'::jsonb,
  null)
on conflict (version) do nothing;

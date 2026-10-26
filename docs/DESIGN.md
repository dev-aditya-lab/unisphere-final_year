# Design system

UniSphere's look is a "campus zine": a warm paper page, warm ink text, one loud coral, and small, confident,
tactile details. It is meant to feel like a student magazine or a club poster, not an enterprise dashboard.

Everything below lives in code, not in a design file. The sources of truth are
[`app/globals.css`](../app/globals.css) (tokens, utilities), [`lib/motion.js`](../lib/motion.js) (motion language)
and [`components/ui`](../components/ui) (primitives).

## Principles

1. **One hot accent, used once per screen.** Coral is the call to action (`Button variant="hot"`), the active
   indicator and notification counts. Everything else is ink on paper.
2. **Colour carries meaning.** Each content type owns a hue (project blue, idea sun, question plum, opportunity
   leaf, achievement coral, event teal, experience rose, general stone). The feed is readable at a glance.
3. **AI is teal and labelled.** Anything an AI produced uses the teal "AI suggestion" treatment and the words
   "AI suggestion" or "Found for you". Facts (real posts, real people) never use it.
4. **Motion explains.** Feedback is 120 to 250 ms; transitions 200 to 400 ms; only `transform` and `opacity`.
   Every animation has a still equivalent and `prefers-reduced-motion` turns them off (CSS and `MotionConfig`).
5. **Real states only.** Nothing is faked: no invented presence, receipts or counts; skeletons are shown only
   while data actually streams in.

## Type

| Role | Font | Notes |
| --- | --- | --- |
| Display and headings | Bricolage Grotesque (variable) | `font-heading`; `.display` / `.display-sm` for marketing |
| Body and UI | Plus Jakarta Sans (variable) | `font-sans`; 15 px base, 1.6 line height |
| Code | system monospace stack | no web font; used sparingly |

Both are loaded with `next/font/google` (self-hosted at build time, `display: swap`). `.eyebrow` is the small
uppercase kicker with a coral diamond; `.lede`, `.meta`, `.caption` are the secondary text roles.

## Colour

Semantic tokens only; never hard-code a hex in a component. Text on a tint uses the `*-text` variant, which is
AA on paper and on a 14 % tint of its own hue.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#FBF6EC` paper | `#14120F` charcoal | page |
| `card` | `#FFFEFB` | `#1D1A16` | panels (brighter than the page) |
| `sunken` | `#F3ECDD` | `#100E0B` | wells, filters, code |
| `popover` / `raised` | `#FFFEFB` / `#FFF` | `#25211C` / `#2A2621` | floating layers |
| `foreground` / `primary` | `#1B1812` ink | `#F5EFE3` cream | text, main buttons |
| `accent-hot` | `#FF5A36` | `#FF7A59` | the call to action |
| `teal`, `sun`, `blue`, `leaf`, `coral`, `rose`, `plum`, `stone` | fills and strokes | softened | content hues |
| `*-text` | AA text colour for each hue | lightened | text and icons |

Dark mode is designed, not inverted: warm charcoal with four clearly separated elevation steps, softer hues,
no pure white, and hard "sticker" shadows tinted with coral instead of black. The theme switcher offers
Light, Dark and Match device; the choice is stored in `localStorage` (a per-device preference, never account
data) and applied before first paint by an inline script (CSP nonce) so there is no flash. The browser's
`theme-color` is kept in step.

## Shape, depth, spacing

- Radius `0.75rem` base (`rounded-lg`); panels `rounded-xl`/`2xl`. No pill buttons; pills are kept for avatars.
- Depth is a hairline border plus, for floating things, `shadow-pop`. The signature is the offset "sticker"
  shadow (`--hard`) on hot buttons, the active nav item and callouts.
- Utilities: `surface`, `surface-raised`, `surface-sunken`, `lift`, `press`, `tone-<hue>` with `tone-chip`,
  `tone-stripe`, `tone-panel`, `tone-dot`; `pt-safe`/`pb-safe`/`pl-safe`/`pr-safe` for notches.

## Components

`components/ui/*` are shadcn/Radix primitives restyled to the tokens: Button (variants `default`, `hot`,
`outline`, `secondary`, `ghost`, `link`, `destructive`, `soft`, `success`), Badge (incl. `tone`, `hot`,
`info`), Input/Textarea/Select (40 px high, `bg-card`), Tabs (sunken segmented list), Switch (coral when on),
Checkbox, Dialog (centred card on `sm+`, bottom sheet on phones), Sheet, DropdownMenu, Popover, Tooltip,
Skeleton (`.skeleton`), Sonner toasts (bottom-centre, above the tab bar), Alert (info/success/warning/error).

Shared pieces: `PageHeader`, `EmptyState`, `SystemPage` (404, errors, maintenance), `components/skeletons.jsx`
(`FeedSkeleton`, `PageSkeleton`, used by `loading.js` in each route group), `CoverArt` (deterministic profile
cover), `CategoryBadge`.

Icons are the UniSphere icon family (`components/icons`, see [ICONS.md](ICONS.md)): plain single-colour glyphs that follow the text colour, each with one purposeful motion; Lucide strokes for control chrome (close, check, chevrons, arrows); the 3D reward art only for Orbits rewards. There are no emoji icons.

## Motion

`lib/motion.js` defines durations (`fast .14`, `base .22`, `slow .38`), easings and spring presets. Components use
the light `m` element (not `motion`); the animation engine is loaded after hydration by `<LazyMotion strict>` in
`components/providers.jsx` (see `docs/PERFORMANCE.md`). Primitives:

- `app/(group)/template.js`: each page eases in (CSS only). It sits **inside** the group layout so the shell does
  not remount, and uses `backwards` fill so no transform lingers (a lingering transform would trap `position:
  fixed` descendants such as the tab bar).
- `NavLinks` and `BottomNav`: the active indicator slides between destinations (`layoutId`).
- `CountBadge`: pops in, and the number slides when it changes.
- `PopIcon`: like and bookmark pop; copy-link swaps to a tick.
- `AnimatedCheck`: a self-drawing circle and tick.
- `fireConfetti` / `queueCelebration`: milestones only (finishing onboarding, publishing a project, getting
  verified). A celebration is queued by the page that completes the milestone and played by the page the member
  lands on, so nothing is delayed to make room for it.
- Marketing: see "The public site" below (GSAP for scroll choreography, `motion` for interface state, sheryjs as a desktop extra).

## The home feed (2.4.0)

The home page is one calm column. Order, top to bottom: a one-line official announcement (the rest one tap away), a single
"today" row for Orbits (screens without the sidebar), the composer, the sticky tab bar, the type chips, the posts.

| Piece | Behaviour | Why |
| --- | --- | --- |
| Tab bar (`FeedFilters`) | Sticky under the app bar; the selected tab has an ink bar that slides (`layoutId`); on a phone it slides away while scrolling down and returns on the first upward scroll or on focus; the tap shows at once and is ignored as soon as the server answers | Always one tap from "whose posts", and the posts get the screen while reading |
| Type chips | Lighter chips, selected = ink pill; each type icon carries its own hue | A scan by colour and shape, never colour alone |
| Composer | Prompt plus one-tap starters (Photo, Project, Idea, Question, Achievement) that open the editor already set to that type | Start the kind of post you have in mind in one tap |
| Post card (`PostCard`) | Social layout: 44 px avatar, bold name, `@user · time · audience`, the type as a small tinted pill beside the menu (icon only on a phone), 16 px text, rounded media. Every post is its own rounded card with a 12 px gap on a phone (16 px from `sm`), so a feed reads as separate posts and not one long article; the card lifts under the pointer; `feed-card` skips rendering when off screen; the first screenful eases in with a capped stagger (`feed-item`) | Familiar, warm, thumb-friendly and cheap to render for long feeds |
| Action row (`PostActions`) | Soft 40 px pills (icon plus count) with 8 px between them: a Like pill joined to the reaction-tray button, comment, repost, then save and share on the right; a reaction tints its pill in its own hue; counts roll (`RollingNumber`) | Scannable and thumb-friendly; the state is visible without colour alone (icon shape and fill) |
| Reactions | Tap Like for a quick like. Touch and hold (380 ms) or rest the mouse (450 ms) opens a tray of four, each with its own icon and hue (`reaction-ui.jsx`); a visible face button opens the same tray, so nothing depends on discovering a gesture; the choice springs in with a ring of dots (`react-pop`, `react-burst`) and a short vibration where supported (`lib/client/haptics.js`) | Research on long-press pickers: hold-only is rarely discovered, so there is always a visible control and a keyboard path |
| Share | The system share sheet on touch devices that have one; otherwise copy the link | Native on phones |
| Back to top | Offered only far down a feed while scrolling up | Helps a long feed, never covers a post |

Motion rules held: feedback 120 to 260 ms, only `transform` and `opacity` (the announcement opens with a grid-row
transition, no layout script), nothing loops, and the global reduced-motion rule reduces everything to a single still
frame. Touch targets are at least 44 px where a thumb is the pointer (Apple HIG 44 pt, Material 48 dp, WCAG 2.5.8 minimum 24 px).

## The public site (2.5.0): black, white and one blue

The landing page and every other marketing page (features, about, FAQ, pricing, legal) have their own, bolder look. The signed-in app is
unchanged. Everything hangs on one wrapper, `.corp-root`, rendered by `app/(marketing)/layout.js`.

**Palette.** Black, white and graphite, with **one** vivid blue, the same blue family as the signed-in app (`--primary: #2f63f0`; `--signal`
and `--band-accent` follow it). Changing the accent is a one-place edit: those tokens at the top of `app/(marketing)/landing.css`. The
rainbow of content hues is mapped to neutrals (blue, teal, leaf, plum, stone become greys; sun, coral, rose become the accent) so a row of
tags reads as one family. Blue text on white uses `--primary-text: #2450c8` (AA on white); on black it is `#8fb0ff`. The tokens are redefined
on `:root:has(.corp-root)`, not on the wrapper, so things React portals out of it (the mobile menu, dialogs, toasts) wear the same colours;
leaving the marketing layout restores the app palette with no code. Dark mode has its own set.

*Black sections.* `.band` re-points every text token, including the tag colours the mock-ups use (`--blue-text`, `--rose-text`, and the
rest), so anything inside a black section is checked against black, not against the light theme. Forgetting one fails contrast (it did,
twice). Tokens added: `--signal`, `--signal-text`, `--band`, `--band-foreground`, `--band-muted`, `--band-line`, `--band-accent`.

*Gradients.* Flat everywhere, except two places that are the point of the page: the Refer & Earn stage (a blue glow bleeding into black,
a rotating conic edge, drifting blobs) and the 3D planet's glow. Nothing else is a gradient.

**Type.** Outfit (friendly geometric sans, variable, from `next/font/google`, loaded only by the marketing layout and exposed as
`--font-outfit`; `--font-display` falls back to it). `.corp-title`, `.corp-hero-title` and `.corp-lede` are the roles. The small section
label is `.kicker`: a dot, the section number in `--signal-text`, then the name.

**The opening.** A loading screen (`components/landing/intro.jsx`, styles `.intro*` in `landing.css`): black, the logo inside a ring that draws
itself, the Orbits planet circling it, "UniSphere" rising letter by letter, a counter climbing to 100, then the whole screen lifts away on a
curved edge. About 2.3 seconds. It is plain CSS, so it runs from the first paint and dismisses itself even if scripts never load. It plays
once per tab session (sessionStorage `unisphere:intro-seen`, listed on the cookies page), any click or key skips it, and it never plays with
reduced motion. The hero's own entrance and the 3D planet's wait for it through `--intro` and a delay.

**The hero.** Black. Three line headline, a blue underline that draws itself, the pill with a live dot, magnetic buttons, a spinning "open to
everyone" badge, and the Orbits planet (`public/icons/reward/orbit.png`) behind the right half.
- On a wide, capable screen the planet is a real three.js scene (`lib/landing/hero-scene.js`): the planet, a violet halo and a blue glow,
  two tilted rings with a moon and a four-point star riding them, drifting specks and a star field, leaning toward the pointer and flying toward the
  camera as the page scrolls away. It needs motion allowed, a width of 900 px or more, WebGL, no data-saver, nothing slower than 4G and at least
  4 GB where the browser says. Everyone else keeps `HeroPlanet`, the same artwork as a still picture that floats; it is server-rendered and
  is also what shows while the scene loads, so the planet is always there.
- The scene draws only while it is on screen and the tab is visible (an IntersectionObserver and `visibilitychange`), and its teardown removes the
  canvas and releases the GL context (checked: after a client-side navigation there is no canvas and no frame loop; coming back restarts it).
- **Frame-time governor.** The scene is decoration, so a device that cannot draw it smoothly gets a softer picture and, failing that, the still
  planet. After a warm-up it averages runs of 45 frames; above 26 ms (about 38 fps) it steps the resolution down (a device-pixel-ratio cap of 1.75,
  1.25, 1, 0.75, 0.6, whichever is below the current one), and if it is still above 45 ms at the lowest it calls `onGiveUp`, which removes
  the canvas and brings the still planet back for good. Checked with software rendering (no GPU): it stepped from 1440 x 900 to 864 x 540 and
  kept going; with frames forced to 15 fps it walked the whole ladder and gave up cleanly with no errors.
- The header over the hero is black and one piece with it (`data-top`), turns light after 60 px of scrolling, hides on the way down (after 320 px)
  and returns on the way up. With reduced motion the script does not run, so the header is simply the light one.

**Smooth scroll.** Lenis (`lib/landing/smooth-scroll.js`, `lerp: 0.09`), driven by GSAP's ticker so ScrollTrigger reads the same eased position;
anchors on the same page glide to their target. It is not started for reduced motion, and it stays out of dialogs and menus.

**Who animates what.** Sections are Server Components, complete and visible with no script; animation is added afterwards from data attributes.

| Library | Owns | Where |
| --- | --- | --- |
| GSAP (ScrollTrigger, SplitText, DrawSVG, MotionPath) | Page choreography: the sideways *How it works* hold and the *story* hold, the scrubbed statement, scrubbed and one-shot SVG path drawing, a dot riding a path, split headlines, picture wipes and parallax, lagged tiles, staggered reveals, the giant footer wordmark, the Refer stage, the header's behaviour | `lib/landing/scroll-fx.js` (a lazily imported chunk), driven by `data-hero-line`, `data-statement`, `data-reveal`, `data-stagger`, `data-split`, `data-img-reveal`, `data-parallax`, `data-lag`, `data-draw`, `data-travel`, `data-hscroll`, `data-pin-story`, `data-giant`, `data-refer-stage` |
| Motion (`motion/react`) | Interface that has state or velocity: the marquee that speeds up with your scroll, the product tabs (sliding `layoutId` bar, `AnimatePresence` panels), hero pointer depth, count-up numbers, card tilt, the Refer planet's float | `components/landing/{marquee,hero-pointer,count-up,tilt,spin-badge,refer-visual}.jsx`, `components/marketing/product-showcase.jsx`; engine from `<MotionFeatures>` |
| three.js | The hero's 3D planet | `lib/landing/hero-scene.js` |
| sheryjs | A desktop-only extra: cursor follower, magnetic buttons, letter-by-letter section labels, picture zoom with a "View" circle, a picture that follows the pointer along the communities list, a WebGL ripple on the hero photograph | `lib/landing/shery-runtime.js`, started late by `landing-fx.jsx` |
| CSS | The loading screen, the hero entrance (from first paint, before any script), the marquee's static state, the header's reading-progress line, the Refer stage's glow, rings and embers | `app/(marketing)/landing.css` |

**The two holds** (large screens only, `(min-width: 1024px) and (min-height: 620px)` with motion allowed): *How it works* pins and the three steps
slide sideways while a blue path draws and a dot rides it; *Inside UniSphere* pins while a framed picture opens to the full screen and the
headline rises out of it. Below that size, or with reduced motion, they are ordinary stacked content (the section gets `.is-pinned` only while a
hold is active, and the layout CSS keys off that class).

**Rules that keep it accessible and fast**
- Nothing is hidden until script runs; reduced motion gets none of the GSAP, Lenis, three.js, Motion or sheryjs behaviour and no loading screen,
  and the page is complete.
- Markup must not depend on `useReducedMotion()` (the server cannot know it; a different first render is a hydration mismatch). Apply the
  preference inside values and handlers.
- Text that fades by opacity fails contrast. Switch colour by class or by a CSS variable instead (the scrubbed statement words use `--p`).
- Decoration is not text: it is drawn with CSS `content: attr(...)` or is `alt=""`/`aria-hidden`, so there is nothing for a screen reader to
  read twice or a contrast checker to fail. The loading screen and the planet are `aria-hidden`.
- Animation setup is wrapped so that any failure reverts every element to its static, visible state instead of reaching the route error boundary.
- Anything that loops is paused while off screen (`data-pause-offscreen` + `data-live`, `useInView`, IntersectionObserver). `@property` animations
  and `var()` inside keyframes run on the main thread, so the always-on ones are kept few and cheap.
- GSAP gotcha: `ScrollTrigger.config()` called without `syncInterval` wipes the library's internal one and its loop keeps ticking. It is
  never called; teardown is `mm.revert()`, Lenis `destroy()` and `ScrollTrigger.disable(false, true)`, and the next visit calls `enable()`.
- Weight (production build, encoded bytes): a plain marketing page ships about 225 KB of JavaScript; the landing page about 421 KB on a phone
  (of which about 44 KB is the Markdown renderer the community explorer already used, about 60 KB GSAP and about 25 KB Motion's engine), 355 KB
  with reduced motion (GSAP is a deferred chunk and three.js is not fetched at all), and about 554 KB on a capable desktop once the hero scene and
  sheryjs have loaded. three.js (about 125 KB gzipped, named imports so it is tree-shaken) is one shared chunk for the hero scene and sheryjs.
- Scroll smoothness (headless Chromium with *software* WebGL, which is the worst case; a GPU costs far less): with the hero scene and sheryjs
  running there were about twice as many frames over 33 ms at the top of the page as with WebGL off, which is why the governor exists.

**sheryjs in a React app.** The library has no teardown, so `shery-runtime.js` adds one: it records the `window`/`document` listeners the library
adds and removes them, removes the elements it appends to `<body>`, puts wrapped images back and restores replaced text, ends its per-image render
loop, and *pauses* (cannot dispose: the library keeps one module-level renderer) the shared canvas. The image effect renders only while it is
being touched. Verified: after a client-side navigation away its render loop falls to zero and nothing it added remains; returning restarts it with
no duplicates. Its stylesheet is not imported (it sets a global `body { background: #fff }`); the few rules its effects need are in `landing.css`.
`next.config.mjs` points the library's `.glsl` shaders at `lib/landing/glsl-loader.cjs` and its debug-panel dependency at an empty stub, and
the runtime wraps the library's one string timer (`setTimeout("…")`) because the production CSP has no `unsafe-eval`.

**Pictures.** `lib/landing/image-specs.mjs` lists the eleven pictures; `npm run landing:images` writes placeholders or turns the real photographs
in `assets/landing-source/` into the right size. Prompts and the workflow are in [`LANDING_IMAGES.md`](LANDING_IMAGES.md). The planet is not one
of them: it is the existing reward artwork, `public/icons/reward/orbit.png`.

## Mobile and the installed app

- Bottom tab bar with a raised "write a post" button; the top bar keeps search, notifications and the account
  menu (which also holds the theme choice). Safe-area insets are respected everywhere (`viewport-fit=cover`).
- Dialogs become bottom sheets; toasts sit above the tab bar; tap targets are at least 40 px.
- Standalone display mode disables text selection chrome except in content, and the app never rubber-bands the
  whole page.

## Authentication and persistence

See `docs/ARCHITECTURE.md` ("Sessions"). Short version: the session is a persistent, shared Supabase cookie;
the proxy refreshes it and writes the refreshed cookies onto **every** response (redirects included); logout
is per device.

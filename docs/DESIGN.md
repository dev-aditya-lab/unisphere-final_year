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
- Marketing: scroll reveals, the marquee strip, the orbit; all CSS or `motion` with transforms only.

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

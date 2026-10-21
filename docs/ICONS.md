# UniSphere icon system

One family of plain, single-colour icons with a distinctive motion each. Code lives in `components/icons/`. The 3D reward illustrations in `public/icons/reward/` (Orbits balance, badges, ranks) are a separate family drawn by `RewardIcon` and are not part of this one.

## Pieces

| File | Role |
| --- | --- |
| `app-icon.jsx` | `AppIcon`: the one renderer, by concept name (`home`, `chat`, `bell` ...). Server-safe, no hooks. |
| `animated-icon.jsx` | `AnimatedIcon`: `AppIcon` plus event motion: `active` (a toggle fills in and pops) and `pulse` (play the icon's motion once when a value changes). |
| `glyphs.jsx` | The artwork (55 glyphs on a 24 x 24 canvas) and the name -> motion registry. |
| `icons.css` | States, hover/press, the per-glyph motions, the pending beads, reduced motion. |
| `lucide-compat.jsx` | The old line-icon names (`Users`, `Bell` ...) mapped to these icons, so a screen migrates by changing its import. |
| `beads.jsx` | The pending indicator (three rising dots) used instead of a spinning glyph in submit buttons. |
| `../shell/nav-icons.jsx` | `NavIcon`: nav data names -> glyphs, with the selected/idle state. |

```jsx
<AppIcon name="chat" size="lg" label="Messages" />          // meaningful: role="img"
<AppIcon name="bell" size={24} />                            // decorative: aria-hidden
<AnimatedIcon name="heart" size={20} active={liked} />       // outline when off, filled + spring pop when on
<AnimatedIcon name="bell" size={24} pulse={arrivals} />      // rings once per arrival, never on first render
```

Sizes: `xs` 16, `sm` 20, `md` 24, `lg` 32, `xl` 48, `2xl` 72, or any number. An explicit size is applied inline, so it holds inside buttons and menus whose CSS sizes bare icons (`[&_svg]:size-4`).

## Visual rules

- **One colour.** Every icon is drawn in `currentColor`: it takes the colour of the text around it, so it follows the light and dark themes, a selected tab's colour and a button's own colours with no icon-specific colour logic. There are no gradients, shadows or filters.
- **One stroke.** 1.75 weight on a 24 x 24 canvas (2 when selected), round caps and joins, corner radii of 1.5 to 3 units, a clear silhouette per concept, and no detail finer than the stroke. Checked at 16 px and 24 px.
- **Fill as state.** A closed shape has a hidden `soft` twin of its outline. Selected (`state="active"`) fades in an 18 % tint of the current colour; a toggle that is on (`fill="solid"`: liked, saved) fills completely. That is the whole difference between on and off, so it never depends on hue alone.
- **Chrome stays Lucide.** Close, check, chevrons, arrows, plus, ellipsis and spinners remain `lucide-react`: the same weight and corner style, so the two sets read as one.

## States

`state` on `AppIcon`: `rest` (full strength), `idle` (72 % opacity: an unselected tab or an unset toggle), `active` (heavier stroke, soft fill, 1 px lift: the selected tab), `disabled` (40 %), `loading` (slow breathing). Hover or focus of the enclosing control lifts the icon and restores full opacity; press compresses it.

## Motion

- Hover, focus and press belong to the enclosing `a`, `button`, `[role=tab]`, `[role=menuitem]` or any `.ui-host`; an icon needs no handlers.
- Each glyph has one named motion (`fx` in the registry) on one or two marked parts (`p-a`, `p-b`), played once for 480 to 900 ms on hover or focus, or while `data-play="true"` (set by `AnimatedIcon pulse`). The bell swings and its clapper answers, the compass needle searches, the heart beats, the chat dots bounce in turn, the bulb flares rays, the gear turns one tooth, the paper plane flies off, the key turns, the scales balance, the pencil writes, the lid of the bin lifts, the trend line draws itself.
- Easing is `--ease-out` for arrivals and `ease-in-out` for swings; 90 ms for the press, 240 ms for the lift.
- Only `transform`, `opacity` and the stroke of one line animate. There are no continuous loops except the short-lived `loading` state and the beads, and no per-icon JavaScript: `AnimatedIcon` uses one timeout per event.
- Motion marks a change: a notification arrives (the bell rings), a message is sent (the plane flies), a toggle turns on (spring pop). It is never decoration on a still screen.
- `prefers-reduced-motion` removes every icon animation and transition (`icons.css`), and `MotionConfig reducedMotion="user"` removes the spring pops.

## Performance and resilience

- Server-rendered markup with no hooks: no hydration mismatch, no client JavaScript for static icons, no assets to load, so navigation never depends on a successful fetch.
- A glyph is a few paths; there is no shared sprite and no external file.
- Hover motion is CSS, so there is no JavaScript loop per icon and no layout work.

## Naming and organisation

- Glyph names are product concepts in lowercase (`chat`, `bulb`, `cap`), not pictures; several screens can share one drawing.
- A new glyph is a function in `glyphs.jsx` (wrap closed shapes in `S`, mark moving parts `p-a`/`p-b`), added to `GLYPHS` with an optional `fx` whose keyframes live in `icons.css`. `tests/unit/icons.test.js` checks that it renders in one colour and that a named motion has a moving part.
- To use an old line-icon name for a new concept, add it to `lucide-compat.jsx`.

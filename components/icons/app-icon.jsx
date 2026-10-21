import { GLYPHS } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";

/** Size steps, in CSS pixels. Anything else can be passed as a number. */
export const ICON_SIZES = Object.freeze({ xs: 16, sm: 20, md: 24, lg: 32, xl: 48, "2xl": 72 });

/**
 * States:
 *  - rest (default)  full strength, for icons that stand on their own (a card, an empty state, a button label)
 *  - idle            quieter: an unselected tab or an unset toggle
 *  - active          the selected tab: slightly heavier stroke, a soft fill and a small lift
 *  - disabled        faded
 *  - loading         a slow breathing pulse
 * `fill` controls the tint inside closed shapes: "none" (default), "soft" (a light tint, the default for `active`) or "solid"
 * (a toggle that is on: liked, saved).
 */
export const ICON_STATES = Object.freeze(["rest", "idle", "active", "disabled", "loading"]);
export const ICON_FILLS = Object.freeze(["none", "soft", "solid"]);

export const hasIcon = (name) => Object.hasOwn(GLYPHS, name);

/**
 * The one place UniSphere icons are drawn. `name` is a product concept (components/icons/glyphs.jsx: home, chat, bell, ...). The
 * icon is single-colour: it takes the colour of the surrounding text (`currentColor`), so it follows the theme, the selected
 * state of a tab and a button's own colours without any icon-specific colour logic.
 *
 * Pure markup, no hooks: it renders on the server, hydrates without a mismatch and costs no JavaScript. Pass `label` when the icon
 * is the only thing saying what a control does; without it the icon is decorative and hidden from assistive technology.
 * Motion is CSS only and plays on hover or focus of the enclosing link, button or `.ui-host`, or when `play` is set (see
 * <AnimatedIcon> for event-driven motion), and it is switched off for `prefers-reduced-motion`.
 * The 3D reward illustrations (Orbits, badges, ranks) are a separate family: <RewardIcon> in components/orbits.
 */
export function AppIcon({ name, size, label, state = "rest", fill, strokeWidth, animate = true, play = false, className, style }) {
  // An explicit size is applied inline, so it holds inside a button or menu whose CSS sizes bare icons (`[&_svg]:size-4`). With no
  // size the icon is 24px (md) unless the surrounding CSS or a size class says otherwise, like any inline SVG.
  const px = typeof size === "number" ? size : (ICON_SIZES[size] ?? ICON_SIZES.md);
  const sized = size !== undefined ? { width: px, height: px } : undefined;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  const glyph = GLYPHS[name] ?? GLYPHS.sparkle;
  const Glyph = glyph.g;
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
      data-state={state}
      data-fill={fill ?? (state === "active" ? "soft" : undefined)}
      data-anim={animate ? "" : undefined}
      data-play={play ? "true" : undefined}
      data-fx={glyph.fx}
      data-icon={name}
      className={cn("ui-icon", className)}
      style={sized || style ? { ...sized, ...style } : undefined}
    >
      <Glyph />
    </svg>
  );
}

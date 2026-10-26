import { AppIcon } from "@/components/icons/app-icon";
import { REACTIONS } from "@/lib/content/post-meta";
import { cn } from "@/lib/utils";

/**
 * How each reaction looks: its own icon and its own hue (the content-type tones in globals.css), so a reaction is
 * recognisable by shape and colour, never by colour alone. Labels come from lib/content/post-meta.js.
 */
export const REACTION_UI = {
  like: { icon: "heart", tone: "tone-rose" },
  insightful: { icon: "bulb", tone: "tone-sun" },
  celebrate: { icon: "sparkle", tone: "tone-coral" },
  curious: { icon: "help", tone: "tone-plum" },
};

export const REACTION_LABEL = Object.fromEntries(REACTIONS.map((r) => [r.value, r.label]));

export function reactionUi(value) {
  return REACTION_UI[value] ?? REACTION_UI.like;
}

/** One reaction's icon in its own colour. `solid` fills it (a reaction that is on). */
export function ReactionIcon({ value, size = 20, solid = false, className }) {
  const ui = reactionUi(value);
  return (
    <span className={cn(ui.tone, "inline-grid place-items-center text-(--tone-text)", className)}>
      <AppIcon name={ui.icon} size={size} fill={solid ? "solid" : undefined} />
    </span>
  );
}

/**
 * The small overlapping icons that say which reactions a post received ("heart, bulb, sparkle"). Only drawn when more
 * than one kind was used: with a single kind the Like button already shows it.
 */
export function ReactionStack({ counts, className }) {
  const kinds = Object.entries(counts)
    .filter(([key, n]) => n > 0 && REACTION_UI[key])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (kinds.length < 2) return null;
  return (
    <span className={cn("flex items-center", className)} aria-hidden="true">
      {kinds.map(([key], i) => (
        <span key={key} className={cn(REACTION_UI[key].tone, "bg-card ring-card -ml-1.5 grid size-[18px] place-items-center rounded-full text-(--tone-text) ring-2 first:ml-0")} style={{ zIndex: kinds.length - i }}>
          <AppIcon name={REACTION_UI[key].icon} size={11} fill="solid" animate={false} />
        </span>
      ))}
    </span>
  );
}

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hasIcon } from "@/components/icons/app-icon";
import { REACTION_UI, ReactionIcon, ReactionStack, reactionUi } from "@/components/posts/reaction-ui";
import { REACTIONS } from "@/lib/content/post-meta";

describe("reaction presentation", () => {
  it.each(REACTIONS.map((r) => r.value))("%s has its own icon and tone", (value) => {
    const ui = REACTION_UI[value];
    expect(ui, `${value} has no entry in REACTION_UI`).toBeTruthy();
    expect(hasIcon(ui.icon)).toBe(true);
    expect(ui.tone).toMatch(/^tone-/);
  });

  it("gives every reaction a different icon, so a reaction is never told apart by colour alone", () => {
    const icons = REACTIONS.map((r) => REACTION_UI[r.value].icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("falls back to the like look for an unknown reaction", () => {
    expect(reactionUi("something-new")).toBe(REACTION_UI.like);
  });

  it("draws a reaction's icon filled only when asked", () => {
    expect(renderToStaticMarkup(h(ReactionIcon, { value: "like", solid: true }))).toContain('data-fill="solid"');
    expect(renderToStaticMarkup(h(ReactionIcon, { value: "like" }))).not.toContain('data-fill="solid"');
  });
});

describe("reaction stack", () => {
  const render = (counts) => renderToStaticMarkup(h(ReactionStack, { counts }));

  it("is not drawn for a single kind (the Like button already shows it)", () => {
    expect(render({ like: 9 })).toBe("");
    expect(render({})).toBe("");
    expect(render({ like: 0, insightful: 3 })).toBe("");
  });

  it("shows the most used kinds first, at most three, and ignores unknown kinds", () => {
    const html = render({ like: 2, insightful: 7, celebrate: 4, curious: 1, mystery: 99 });
    expect(html.match(/data-icon="/g)).toHaveLength(3);
    expect(html.indexOf('data-icon="bulb"')).toBeLessThan(html.indexOf('data-icon="sparkle"'));
    expect(html.indexOf('data-icon="sparkle"')).toBeLessThan(html.indexOf('data-icon="heart"'));
    expect(html).not.toContain('data-icon="help"');
  });
});

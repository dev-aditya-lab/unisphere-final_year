import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppIcon, ICON_SIZES, hasIcon } from "@/components/icons/app-icon";
import { GLYPHS, GLYPH_NAMES } from "@/components/icons/glyphs";
import * as compat from "@/components/icons/lucide-compat";
import { sizeFromClass } from "@/components/icons/lucide-compat";

const render = (el) => renderToStaticMarkup(el);

describe("glyphs", () => {
  it.each(GLYPH_NAMES)("%s renders as a single-colour 24 x 24 icon", (name) => {
    const svg = render(h(AppIcon, { name }));
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    // Plain icons: no hard-coded colours, gradients, filters, masks or blurs.
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}\b|url\(#|<linearGradient|<radialGradient|<filter|<mask|feGaussianBlur|<clipPath/);
  });

  it("names a motion only for glyphs that mark a moving part", () => {
    for (const name of GLYPH_NAMES) {
      const { fx } = GLYPHS[name];
      const svg = render(h(AppIcon, { name }));
      if (fx) expect(svg, `${name} has fx "${fx}" but no moving part`).toMatch(/class="p-[ab]"/);
    }
  });

  it("gives every closed shape a soft twin for the selected and solid states", () => {
    for (const name of ["home", "bell", "heart", "bookmark", "chat", "calendar"]) {
      expect(render(h(AppIcon, { name })), name).toContain('class="soft"');
    }
  });

  it("only uses finite numbers in its geometry", () => {
    for (const name of GLYPH_NAMES) expect(render(h(AppIcon, { name })), name).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("<AppIcon>", () => {
  it("is decorative (aria-hidden) without a label and an image with one", () => {
    expect(render(h(AppIcon, { name: "home" }))).toContain('aria-hidden="true"');
    const labelled = render(h(AppIcon, { name: "home", label: "Home" }));
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Home"');
    expect(labelled).not.toContain("aria-hidden");
  });

  it("applies an explicit size inline, and none when no size is given", () => {
    expect(render(h(AppIcon, { name: "home", size: "lg" }))).toContain(`width:${ICON_SIZES.lg}px`);
    expect(render(h(AppIcon, { name: "home", size: 22 }))).toContain("width:22px");
    expect(render(h(AppIcon, { name: "home" }))).not.toContain("style=");
  });

  it("records state, fill and play for the CSS; an active icon is softly filled by default", () => {
    const html = render(h(AppIcon, { name: "heart", state: "idle", fill: "solid", play: true }));
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('data-fill="solid"');
    expect(html).toContain('data-play="true"');
    expect(render(h(AppIcon, { name: "home", state: "active" }))).toContain('data-fill="soft"');
    expect(render(h(AppIcon, { name: "home" }))).not.toContain("data-fill");
  });

  it("does not animate when asked not to", () => {
    expect(render(h(AppIcon, { name: "home", animate: false }))).not.toContain("data-anim");
  });

  it("falls back to a drawn icon for an unknown name rather than rendering nothing", () => {
    expect(render(h(AppIcon, { name: "no-such-icon" }))).toContain("<svg");
    expect(hasIcon("no-such-icon")).toBe(false);
  });
});

describe("line-icon compatibility layer", () => {
  const entries = Object.entries(compat).filter(([name]) => name !== "sizeFromClass");

  it.each(entries)("%s resolves to a real icon", (name, Icon) => {
    expect(render(h(Icon, { className: "size-4" }))).toContain("<svg");
  });

  it("reads a pixel size from Tailwind classes", () => {
    expect(sizeFromClass("size-4 shrink-0")).toBe(16);
    expect(sizeFromClass("mt-0.5 size-3.5")).toBe(14);
    expect(sizeFromClass("size-[18px]")).toBe(18);
    expect(sizeFromClass("h-5 w-5")).toBe(20);
    expect(sizeFromClass("text-primary")).toBeUndefined();
    expect(sizeFromClass(undefined)).toBeUndefined();
  });
});

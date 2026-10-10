import { customAlphabet } from "nanoid";

const suffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

/** Lowercase, ASCII, hyphen-separated. Never returns an empty string. */
export function slugify(input, { max = 60, fallback = "item" } = {}) {
  const base = String(input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return base || fallback;
}

/** Stable, collision-resistant slug: readable prefix + short random suffix. */
export function uniqueSlug(input, opts) {
  const base = slugify(input, { max: 48, ...opts });
  return `${base}-${suffix()}`;
}

export function isValidSlug(slug) {
  return typeof slug === "string" && slug.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

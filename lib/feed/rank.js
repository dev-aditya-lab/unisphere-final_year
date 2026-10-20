// Deterministic, explainable ranking for the "For you" feed. Pure functions: no I/O, no model calls, no randomness,
// so the same inputs always give the same order and every placement can be explained.
//
// Inputs are bounded by the caller (a window of recent candidates the member may already see), so ranking is
// O(n²) over at most ~150 posts. Authorisation never happens here: a post that is not in `candidates` cannot appear.
//
//   score = interest match + followed author + what the member engaged with (category / author / tags)
//         + freshness + substance and discussion (never likes alone) + a small exploration bonus
//         - penalties (dismissed topics and authors, the member's own posts)
// Then a greedy pass spreads authors, categories and colleges so one voice or topic cannot fill a page.

import { extractHashtags } from "@/lib/text";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

export const WEIGHTS = Object.freeze({
  interest: 1.1, // per matched interest, up to MAX_INTEREST_MATCHES
  follow: 1.6,
  category: 1.2,
  author: 0.9,
  tag: 1.0,
  recency: 1.2,
  engagement: 0.5, // log-scaled and capped: a popular post is not automatically a good one
  substance: 0.4,
  explore: 0.35,
  collaboration: 0.2, // projects and opportunities are what UniSphere is for
  dismissCategory: 0.35, // per earlier "not relevant" in that category (capped)
  dismissAuthor: 1.0,
  own: 1.2,
  short: 0.3,
});
const MAX_INTEREST_MATCHES = 3;
const HALF_LIFE_HOURS = 36;
const COLLAB_CATEGORIES = new Set(["projects", "opportunities"]);
const GENERIC_REASONS = new Set(["recency", "collaboration"]);

// Diversity: how much each earlier pick by the same author / category / college lowers the next one.
const DIVERSITY = Object.freeze({ author: 0.9, category: 0.45, college: 0.2 });
const FREE_CATEGORY_REPEATS = 1;

const squash = (w, scale = 10) => Math.min(1, Math.log1p(Math.max(0, Number(w) || 0)) / Math.log1p(scale));

/** Lower-cased, de-duplicated interest terms of two or more characters. */
export function normalizeInterests(list) {
  const out = [];
  for (const raw of list ?? []) {
    const term = String(raw ?? "").trim().toLowerCase().replace(/^#/, "");
    if (term.length >= 2 && !out.includes(term)) out.push(term);
  }
  return out.slice(0, 30);
}

function mentions(text, tags, term) {
  if (tags.includes(term.replace(/\s+/g, ""))) return true;
  // whole-word match, so "ai" does not match "email" or "maintain"
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

/**
 * Score one post. Returns { score, why } where `why` is the strongest reason worth telling the member, or null.
 * @param ctx { interests: string[], following: Set<string>, affinity: object, now: number, viewerId: string }
 */
export function scorePost(post, ctx) {
  const affinity = ctx.affinity ?? {};
  const text = `${post.title ?? ""} ${post.body ?? ""}`.toLowerCase();
  const tags = extractHashtags(text, 20);
  const parts = [];
  const add = (kind, value, label) => {
    if (value !== 0) parts.push({ kind, value, label });
  };

  // What the member said they care about.
  const matched = ctx.interests.filter((t) => mentions(text, tags, t)).slice(0, MAX_INTEREST_MATCHES);
  if (matched.length) add("interest", matched.length * WEIGHTS.interest, `Matches your interest in ${matched[0]}`);

  if (ctx.following.has(post.author_id)) add("follow", WEIGHTS.follow, "From someone you follow");

  // What the member actually engaged with (their own reactions, bookmarks and comments).
  const categoryMeta = CATEGORY_BY_VALUE[post.category];
  const categoryAffinity = squash(affinity.categories?.[post.category]);
  if (categoryAffinity > 0) add("category", categoryAffinity * WEIGHTS.category, `You often engage with ${categoryMeta?.label ?? "these"} posts`);
  const authorAffinity = squash(affinity.authors?.[post.author_id], 6);
  if (authorAffinity > 0) add("author", authorAffinity * WEIGHTS.author, `You have engaged with ${post.author_name ?? "this author"}'s posts`);
  let tagWeight = 0;
  let topTag = null;
  for (const t of tags) {
    const w = affinity.tags?.[t] ?? 0;
    tagWeight += w;
    if (w > (affinity.tags?.[topTag] ?? 0)) topTag = t;
  }
  if (tagWeight > 0) add("tag", squash(tagWeight, 8) * WEIGHTS.tag, `Related to #${topTag}, which you have engaged with`);

  // Freshness: exponential decay with a 36 hour half-life.
  const ageHours = Math.max(0, (ctx.now - new Date(post.created_at).getTime()) / 3_600_000);
  add("recency", Math.pow(0.5, ageHours / HALF_LIFE_HOURS) * WEIGHTS.recency, null);

  // Quality we can compute honestly: some substance, real discussion, a deliberate image. Likes are only one input,
  // log-scaled and capped, and comments count double.
  const engagement = squash((post.reaction_count ?? 0) + 2 * (post.comment_count ?? 0), 30);
  add("engagement", engagement * WEIGHTS.engagement, null);
  const length = (post.body ?? "").trim().length;
  add("substance", Math.min(1, length / 400) * WEIGHTS.substance + ((post.attachments?.length ?? 0) > 0 ? 0.1 : 0), null);
  if (length < 20 && !(post.attachments?.length > 0)) add("short", -WEIGHTS.short, null);
  if (COLLAB_CATEGORIES.has(post.category)) add("collaboration", WEIGHTS.collaboration, "A project or opportunity to join");

  // Something outside the member's established pattern: only once there is a pattern to be outside of.
  const hasPattern = Object.keys(affinity.categories ?? {}).length > 0 || ctx.interests.length > 0;
  if (hasPattern && categoryAffinity === 0 && !matched.length && !ctx.following.has(post.author_id) && !affinity.dismissedCategories?.[post.category]) {
    add("explore", WEIGHTS.explore, `Something different: ${categoryMeta?.label ?? "a new topic"}`);
  }

  // Signals the member sent the other way.
  const dismissedCategory = Math.min(3, Number(affinity.dismissedCategories?.[post.category]) || 0);
  if (dismissedCategory) add("dismissCategory", -dismissedCategory * WEIGHTS.dismissCategory, null);
  if (affinity.dismissedAuthors?.[post.author_id]) add("dismissAuthor", -WEIGHTS.dismissAuthor, null);
  if (post.author_id === ctx.viewerId) add("own", -WEIGHTS.own, null);

  const score = parts.reduce((sum, p) => sum + p.value, 0);
  // The reason shown is the strongest *personal* one; "posted recently" or "a project to join" is only said when nothing
  // about the member explains the placement.
  const labelled = parts.filter((p) => p.label && p.value > 0.25).sort((a, b) => b.value - a.value);
  const best = labelled.find((p) => !GENERIC_REASONS.has(p.kind)) ?? labelled[0];
  return { score, why: best?.label ?? null, kind: best?.kind ?? null };
}

/**
 * Orders candidates: score, then a greedy re-pick that penalises repeats of the same author, category and college among
 * the posts already chosen. Ties fall back to newest first, so the result is stable.
 */
export function rankCandidates(candidates, ctx) {
  const scored = candidates.map((post) => ({ post, ...scorePost(post, ctx) }));
  const remaining = scored.sort((a, b) => b.score - a.score || (a.post.created_at < b.post.created_at ? 1 : -1));
  const picked = [];
  const byAuthor = new Map();
  const byCategory = new Map();
  const byCollege = new Map();
  while (remaining.length) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const { post, score } = remaining[i];
      const value =
        score -
        DIVERSITY.author * (byAuthor.get(post.author_id) ?? 0) -
        DIVERSITY.category * Math.max(0, (byCategory.get(post.category) ?? 0) - FREE_CATEGORY_REPEATS) -
        (post.college_id ? DIVERSITY.college * (byCollege.get(post.college_id) ?? 0) : 0);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    const { post } = chosen;
    byAuthor.set(post.author_id, (byAuthor.get(post.author_id) ?? 0) + 1);
    byCategory.set(post.category, (byCategory.get(post.category) ?? 0) + 1);
    if (post.college_id) byCollege.set(post.college_id, (byCollege.get(post.college_id) ?? 0) + 1);
    picked.push({ ...post, why: chosen.why });
  }
  return picked;
}

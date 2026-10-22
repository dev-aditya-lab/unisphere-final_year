// Guardrails for AI-written post text (isomorphic, pure: no model, easy to test).
//
// The prompt asks for natural writing; this is what the SERVER does about it, because a model can ignore a prompt. Nothing here
// rewrites the author's meaning: it removes wrapper noise, caps emoji and hashtags, and finds the two things that must not reach a
// writer: facts that were not in the draft (numbers, links) and stock marketing phrases. Those trigger one repair request.

const EMOJI = /\p{Extended_Pictographic}/gu;
const HASHTAG = /(^|[^\w&])#([a-z0-9_]{2,40})\b/gi;
const NUMBER = /\d[\d,.]*\d|\d/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/** Phrases that mark text as machine-made marketing copy. Only flagged when the author's own draft did not use them. */
export const STOCK_PHRASES = [
  /in today'?s (fast[- ]paced|digital|ever[- ]changing|modern) (world|age|landscape)/i,
  /\b(excited|thrilled|delighted|proud|pleased) to (announce|share|introduce)\b/i,
  /\bunlock(ing)? (the )?(power|potential|secrets?)\b/i,
  /\bgame[- ]?chang(er|ing)\b/i,
  /\blet'?s dive (in|into|deep)\b/i,
  /\b(take|elevate) (it|your \w+) to the next level\b/i,
  /\b(embark|embarking) on (a|this|an) (journey|adventure)\b/i,
  /\b(stay tuned|don'?t miss out|watch this space|buckle up)\b/i,
  /\bhope (this|that) helps\b/i,
  /\b(leverage|synergy|synergies|cutting[- ]edge|revolutioni[sz]e|seamless(ly)?|holistic|paradigm)\b/i,
  /\bwhether you'?re (a|an) .{1,40}, or\b/i,
  /\bin (conclusion|summary)\b/i,
  /\bhere'?s (the|a) (thing|deal|truth)\b/i,
];

const count = (re, text) => (String(text).match(re) ?? []).length;

/** Strip the things models wrap around an answer: quotes, fences, "Caption:" labels and an "Here's your post:" lead-in. */
export function cleanWrapper(text) {
  let s = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  s = s.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  s = s.replace(/^(here(?:'s| is| are)[^\n]{0,60}:|(?:caption|post|rewrite|rewritten|improved(?: version)?|version \d)\s*:)\s*/i, "").trim();
  const quoted = s.match(/^["“”'‘’]([\s\S]+)["“”'‘’]$/);
  if (quoted && !/["“”]/.test(quoted[1])) s = quoted[1].trim();
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

/** Keep at most as many emoji as the author's own draft used. Extras are removed from the end first. */
export function limitEmoji(text, source) {
  const allowed = count(EMOJI, source);
  let extra = count(EMOJI, text) - allowed;
  if (extra <= 0) return text;
  const chars = [...text];
  for (let i = chars.length - 1; i >= 0 && extra > 0; i--) {
    if (/\p{Extended_Pictographic}/u.test(chars[i])) {
      chars.splice(i, 1);
      extra -= 1;
    }
  }
  return chars.join("").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,!?])/g, "$1").trim();
}

/** Remove hashtags the author did not write. (A requested set of tags is returned separately, never mixed into the text.) */
export function dropInventedHashtags(text, source) {
  const own = new Set([...String(source).matchAll(HASHTAG)].map((m) => m[2].toLowerCase()));
  return text
    .replace(HASHTAG, (all, lead, tag) => (own.has(tag.toLowerCase()) ? all : lead))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** Normalise a model's text before it is checked: wrapper noise, emoji and invented hashtags. */
export function normalizeAiText(text, source) {
  // wrappers come off again after the removals: a quoted caption only ends in its quote once its extra hashtags are gone
  return cleanWrapper(dropInventedHashtags(limitEmoji(cleanWrapper(text), source), source));
}

const normNumber = (n) => n.replace(/[,]/g, "");

/**
 * Problems with AI text relative to the author's draft.
 * `hard` problems are fabrications and are never shown; `soft` ones are style (stock phrases, shouting) and are repaired once, then accepted.
 */
export function findProblems(text, source) {
  const hard = [];
  const soft = [];
  const src = String(source ?? "");
  const known = new Set((src.match(NUMBER) ?? []).map(normNumber));
  const invented = [...new Set((String(text).replace(URL_RE, " ").match(NUMBER) ?? []).map(normNumber))].filter((n) => !known.has(n));
  if (invented.length) hard.push(`it contains numbers that are not in the draft (${invented.slice(0, 3).join(", ")}); use only facts from the draft`);
  const knownUrls = new Set((src.match(URL_RE) ?? []).map((u) => u.toLowerCase().replace(/\/$/, "")));
  const newUrls = (String(text).match(URL_RE) ?? []).filter((u) => !knownUrls.has(u.toLowerCase().replace(/\/$/, "")));
  if (newUrls.length) hard.push("it contains a link that is not in the draft");
  for (const re of STOCK_PHRASES) {
    const hit = String(text).match(re);
    if (hit && !re.test(src)) soft.push(`it uses the stock phrase "${hit[0]}"`);
  }
  if (/!{2,}|(!.*){3,}/s.test(text) && !/!{2,}|(!.*){3,}/s.test(src)) soft.push("it shouts with too many exclamation marks");
  if (/^(are you|do you|have you|ever wondered|what if)\b[^.!?\n]*\?/i.test(String(text).trim()) && !/^(are you|do you|have you|ever wondered|what if)\b/i.test(src.trim())) soft.push("it opens with a rhetorical question");
  return { hard, soft };
}

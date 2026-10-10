// Parsing helpers for user-written text (isomorphic, no dependencies).

const HASHTAG = /(^|[^\w&])#([a-z0-9_]{2,40})(?![\w])/gi;
const MENTION = /(^|[^\w@/])@([a-z0-9][a-z0-9_-]{1,28}[a-z0-9])(?![\w-])/gi;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

export function extractHashtags(text, max = 10) {
  const found = new Set();
  for (const m of String(text ?? "").matchAll(HASHTAG)) {
    found.add(m[2].toLowerCase());
    if (found.size >= max) break;
  }
  return [...found];
}

export function extractMentions(text, max = 10) {
  const found = new Set();
  for (const m of String(text ?? "").matchAll(MENTION)) {
    found.add(m[2].toLowerCase());
    if (found.size >= max) break;
  }
  return [...found];
}

/**
 * Splits text into renderable tokens: { type: 'text'|'hashtag'|'mention'|'url', value }.
 * Rendering happens in React (never via dangerouslySetInnerHTML), so content cannot inject markup.
 */
export function tokenizeRichText(text) {
  const source = String(text ?? "");
  const matches = [];
  for (const m of source.matchAll(URL_RE)) matches.push({ start: m.index, end: m.index + m[0].length, type: "url", value: m[0] });
  for (const m of source.matchAll(HASHTAG)) {
    const start = m.index + m[1].length;
    matches.push({ start, end: start + m[2].length + 1, type: "hashtag", value: m[2].toLowerCase() });
  }
  for (const m of source.matchAll(MENTION)) {
    const start = m.index + m[1].length;
    matches.push({ start, end: start + m[2].length + 1, type: "mention", value: m[2].toLowerCase() });
  }
  matches.sort((a, b) => a.start - b.start);

  const tokens = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // overlapping (e.g. #anchor inside a URL)
    if (m.start > cursor) tokens.push({ type: "text", value: source.slice(cursor, m.start) });
    tokens.push({ type: m.type, value: m.type === "url" ? m.value : m.value, raw: source.slice(m.start, m.end) });
    cursor = m.end;
  }
  if (cursor < source.length) tokens.push({ type: "text", value: source.slice(cursor) });
  return tokens;
}

/** First N words, for slugs and previews. */
export function excerpt(text, maxChars = 140) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return clean.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
}

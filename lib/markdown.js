// Markdown for posts, comments and captions (isomorphic, pure). The renderer is components/posts/markdown-text.jsx; this file holds the
// rules it follows, so they can be tested without React.
//
// Safety model: text is parsed to a tree and rendered as React elements (never innerHTML). Raw HTML is not interpreted (it is shown as
// text), images are not allowed (no tracking pixels, no remote content), and a link survives only if its address is http(s) or
// mailto. Everything else (javascript:, data:, vbscript:, file:, relative paths) is dropped to plain text.

/** The elements a post may contain. Anything else is unwrapped to its text, so nothing a member typed disappears. */
export const ALLOWED_ELEMENTS = ["p", "br", "strong", "em", "del", "a", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "hr"];

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
// Characters browsers ignore or strip inside a URL scheme ("java\tscript:"), which is how filters get bypassed.
const INVISIBLE = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]/g;

/**
 * The address to link to, or "" when it must not become a link. Only absolute http(s) and mailto addresses pass; the check is made on
 * the parsed URL, after stripping the invisible characters used to smuggle other schemes past a text filter.
 */
export function safeHref(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2000) return "";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) return "";
  const probe = trimmed.replace(INVISIBLE, "");
  let parsed;
  try {
    parsed = new URL(probe);
  } catch {
    return "";
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return "";
  if (parsed.protocol !== "mailto:" && !parsed.hostname) return "";
  // credentials in a link (https://google.com@evil.example) are a phishing trick, not a feature
  if (parsed.username || parsed.password) return "";
  // whitespace or control characters inside the address: the parser would quietly fix them, a reader would not see them
  if (/[\s\u0000-\u001f]/.test(trimmed)) return "";
  return trimmed;
}

/** Whether a URL leaves UniSphere (so it opens in a new tab with the safe rel values). Only absolute http(s) links reach here. */
export const isExternal = (href) => /^https?:/i.test(href);

/**
 * A short piece of a post for a feed card, cut on a paragraph (or line, or sentence) boundary so Markdown is never cut in the middle
 * of a list, a quote or a code block. An unclosed code fence is closed. `excerpt()` in lib/text.js flattens whitespace and is for plain
 * summaries; this keeps the structure.
 */
export function markdownExcerpt(text, max = 500) {
  const src = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (src.length <= max) return src;
  let cut = src.slice(0, max);
  const para = cut.lastIndexOf("\n\n");
  const line = cut.lastIndexOf("\n");
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (para > max * 0.5) cut = cut.slice(0, para);
  else if (line > max * 0.6) cut = cut.slice(0, line);
  else if (sentence > max * 0.6) cut = cut.slice(0, sentence + 1);
  else cut = cut.replace(/\s+\S*$/, "");
  cut = cut.trimEnd();
  if ((cut.match(/^```/gm) ?? []).length % 2 === 1) cut += "\n```";
  return `${cut}…`;
}

/** Markdown reduced to the words a person would read: for snippets, titles and notifications. */
export function markdownToPlain(text, max = 0) {
  let s = String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s)/gm, "")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (max && s.length > max) s = `${s.slice(0, max).replace(/\s+\S*$/, "")}…`;
  return s;
}

/**
 * Whether a chat message is cheap and sane enough to parse as Markdown. Messages are short, but the text comes from other
 * members, so a pathological one (hundreds of lines, quotes nested forty deep, lists indented to the margin) must not make every
 * reader's browser do expensive work. Such a message is shown as plain text instead, exactly as typed: nothing is lost and
 * nothing is executed. Ordinary messages are always rendered.
 */
export const CHAT_LIMITS = { chars: 4000, lines: 200, quoteDepth: 5, listDepth: 6, links: 40 };

export function isCheapToRender(text) {
  const source = String(text ?? "");
  if (source.length > CHAT_LIMITS.chars) return false;
  const lines = source.split("\n");
  if (lines.length > CHAT_LIMITS.lines) return false;
  let links = 0;
  for (const line of lines) {
    const quote = /^\s{0,3}((?:>\s?)+)/.exec(line);
    if (quote && (quote[1].match(/>/g) ?? []).length > CHAT_LIMITS.quoteDepth) return false;
    const list = /^( *)(?:[-*+]|\d+[.)])\s/.exec(line);
    if (list && Math.floor(list[1].length / 2) >= CHAT_LIMITS.listDepth) return false;
    links += (line.match(/\]\(/g) ?? []).length;
    if (links > CHAT_LIMITS.links) return false;
  }
  return true;
}

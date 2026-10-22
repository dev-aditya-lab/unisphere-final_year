// Formatting commands for the composer's Markdown toolbar (isomorphic, pure: easy to test).
//
// Every command takes the text and the selection and returns the new text and the selection to restore, so the caret and any
// selected words stay where the writer expects them. Commands toggle: bold on bold text removes the markers.

const FENCE = "```";

function wrap(value, start, end, mark, placeholder) {
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);
  const len = mark.length;
  // "*" is shared by italic (1) and bold (2): the words are italic only when the run of stars beside them is odd (1, or 3 for bold italic)
  const run = (str, fromEnd) => (str.match(fromEnd ? /\*+$/ : /^\*+/) ?? [""])[0].length;
  const sameKind = mark !== "*" || (run(before, true) % 2 === 1 && run(after, false) % 2 === 1);
  // already wrapped, with the markers just outside the selection: take them off
  if (sel && sameKind && before.endsWith(mark) && after.startsWith(mark)) {
    return { value: before.slice(0, -len) + sel + after.slice(len), start: start - len, end: end - len };
  }
  // the selection itself includes the markers
  if (sel.length >= len * 2 + 1 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(len, -len);
    return { value: before + inner + after, start, end: start + inner.length };
  }
  if (!sel) {
    return { value: before + mark + placeholder + mark + after, start: start + len, end: start + len + placeholder.length };
  }
  // keep the markers hugging the words: "** bold **" is not bold
  const lead = sel.match(/^\s*/)[0].length;
  const trail = sel.match(/\s*$/)[0].length;
  const core = sel.trim();
  if (!core) return { value, start, end };
  const s = start + lead;
  const e = end - trail;
  return { value: value.slice(0, s) + mark + core + mark + value.slice(e), start: s + len, end: s + len + core.length };
}

function lineRange(value, start, end) {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  let to = value.indexOf("\n", end);
  if (to === -1) to = value.length;
  // a selection that ends right after a line break should not drag the next line in
  if (end > start && value[end - 1] === "\n") to = end - 1;
  return [from, Math.max(from, to)];
}

const BULLET = /^(\s*)[-*+]\s+/;
const NUMBER = /^(\s*)\d+[.)]\s+/;
const QUOTE = /^(\s*)>\s?/;
const PATTERN = { ul: BULLET, ol: NUMBER, quote: QUOTE };

function prefixLines(value, start, end, kind) {
  const [from, to] = lineRange(value, start, end);
  const lines = value.slice(from, to).split("\n");
  const pattern = PATTERN[kind];
  const filled = lines.filter((l) => l.trim());
  const allHave = filled.length > 0 && filled.every((l) => pattern.test(l));
  let n = 0;
  const out = lines.map((line) => {
    if (!line.trim() && filled.length > 0) return line;
    if (allHave) return line.replace(pattern, "$1");
    // switching list type replaces the old marker instead of stacking markers
    const bare = line.replace(BULLET, "$1").replace(NUMBER, "$1").replace(QUOTE, "$1");
    n += 1;
    const marker = kind === "ul" ? "- " : kind === "ol" ? `${n}. ` : "> ";
    return `${bare.match(/^\s*/)[0]}${marker}${bare.trimStart()}`;
  });
  const replaced = out.join("\n");
  const next = value.slice(0, from) + replaced + value.slice(to);
  if (start === end) {
    const caret = Math.min(next.length, Math.max(from, start + (replaced.length - (to - from))));
    return { value: next, start: caret, end: caret };
  }
  return { value: next, start: from, end: from + replaced.length };
}

function link(value, start, end) {
  const sel = value.slice(start, end);
  if (/^(https?:\/\/|mailto:)\S+$/i.test(sel.trim())) {
    // a selected address becomes a link with a label to fill in
    const label = "link text";
    return { value: `${value.slice(0, start)}[${label}](${sel.trim()})${value.slice(end)}`, start: start + 1, end: start + 1 + label.length };
  }
  const label = sel || "link text";
  const url = "https://";
  const urlStart = start + label.length + 3;
  return { value: `${value.slice(0, start)}[${label}](${url})${value.slice(end)}`, start: urlStart, end: urlStart + url.length };
}

function code(value, start, end) {
  const sel = value.slice(start, end);
  if (!sel.includes("\n")) return wrap(value, start, end, "`", "code");
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !before.endsWith("\n") ? "\n" : "";
  const trail = after && !after.startsWith("\n") ? "\n" : "";
  const body = sel.replace(/\n$/, "");
  const from = start + lead.length + FENCE.length + 1;
  return { value: `${before}${lead}${FENCE}\n${body}\n${FENCE}${trail}${after}`, start: from, end: from + body.length };
}

export const FORMATS = ["bold", "italic", "strike", "code", "ul", "ol", "quote", "link"];

/** @returns {{ value: string, start: number, end: number }} the edited text and the selection to restore */
export function applyFormat(kind, value, start, end) {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  switch (kind) {
    case "bold": return wrap(value, s, e, "**", "bold text");
    case "italic": return wrap(value, s, e, "*", "italic text");
    case "strike": return wrap(value, s, e, "~~", "text");
    case "code": return code(value, s, e);
    case "ul": case "ol": case "quote": return prefixLines(value, s, e, kind);
    case "link": return link(value, s, e);
    default: return { value, start: s, end: e };
  }
}

/** The format for a key press (Ctrl or Cmd plus B, I or K), or null. */
export function shortcutFor(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return null;
  return { b: "bold", i: "italic", k: "link" }[String(e.key).toLowerCase()] ?? null;
}

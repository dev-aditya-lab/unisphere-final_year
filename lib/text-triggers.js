// Finds the "@mention" or "#hashtag" word being typed at the caret (isomorphic, pure, no dependencies).
//
// The boundaries deliberately match the parser in lib/text.js, so what the composer offers a suggestion for is exactly
// what the server will later read as a mention or tag: "@" needs a non-word character (or the start) before it, so
// "email@example.com" and "a/@b" are not mentions; "#" likewise, so "C#" and "&#39;" are not tags.

const MENTION_AT_CARET = /(^|[^\w@/])@([a-z0-9_-]{0,30})$/i;
const HASHTAG_AT_CARET = /(^|[^\w&])#([a-z0-9_]{0,40})$/i;

/**
 * @param {string} text   the full text
 * @param {number} caret  index of the caret (selectionStart)
 * @returns {{type:'mention'|'hashtag', query:string, start:number, caret:number, end:number}|null}
 *   `start` is the index of the "@" / "#" and `end` the end of the word (the caret may sit in its middle); replace
 *   text.slice(start, end) to insert a suggestion.
 */
export function findTrigger(text, caret) {
  const source = String(text ?? "");
  const before = source.slice(0, Math.max(0, caret));
  const mention = MENTION_AT_CARET.exec(before);
  if (mention) return { type: "mention", query: mention[2], start: caret - mention[2].length - 1, caret, end: caret + /^[a-z0-9_-]*/i.exec(source.slice(caret))[0].length };
  const tag = HASHTAG_AT_CARET.exec(before);
  if (tag) return { type: "hashtag", query: tag[2], start: caret - tag[2].length - 1, caret, end: caret + /^[a-z0-9_]*/i.exec(source.slice(caret))[0].length };
  return null;
}

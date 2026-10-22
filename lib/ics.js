/**
 * iCalendar text helpers. Event titles and descriptions are written by members and end up in a file other members
 * download, so every kind of line break must be escaped: a raw CR, LF, NEL or Unicode separator inside a value would
 * start a new property line (an injected ATTACH, URL or VALARM).
 */
const LINE_BREAKS = new RegExp("\\r\\n|[\\r\\n\\u0085\\u2028\\u2029]", "g");

export const escapeIcs = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(LINE_BREAKS, "\\n");

/** Folds a content line at 73 characters, as RFC 5545 asks for lines longer than 75 octets. */
export const foldIcsLine = (line) => line.match(/.{1,73}/gu)?.join("\r\n ") ?? line;

export const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

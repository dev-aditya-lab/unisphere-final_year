import { describe, expect, it } from "vitest";
import { escapeIcs, foldIcsLine } from "@/lib/ics";

const BREAKS = ["\r", "\n", "\r\n", String.fromCharCode(0x85), String.fromCharCode(0x2028), String.fromCharCode(0x2029)];
const ANY_BREAK = new RegExp("[" + BREAKS.join("") + "]");

describe("iCalendar escaping", () => {
  it("escapes the characters that have meaning in a value", () => {
    expect(escapeIcs("a, b; c\\d")).toBe("a\\, b\\; c\\\\d");
  });

  it.each(BREAKS.map((b) => [JSON.stringify(b), b]))("never lets a line break %s through", (_name, br) => {
    const out = escapeIcs(`Party${br}END:VEVENT${br}BEGIN:VEVENT${br}ATTACH:https://evil.example/x`);
    expect(out).not.toMatch(ANY_BREAK);
    expect(out.split("\\n")).toHaveLength(4);
  });

  it("folding keeps every line short and loses nothing", () => {
    const line = `DESCRIPTION:${"word ".repeat(60)}`;
    const folded = foldIcsLine(line);
    expect(folded.split("\r\n").every((l) => l.length <= 74)).toBe(true);
    expect(folded.replaceAll("\r\n ", "")).toBe(line);
  });
});

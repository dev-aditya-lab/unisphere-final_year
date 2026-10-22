import { describe, expect, it } from "vitest";
import { applyFormat, shortcutFor } from "@/lib/markdown-edit";

const at = (value, sel) => {
  const start = value.indexOf(sel);
  return [start, start + sel.length];
};
const run = (kind, value, sel) => {
  const [s, e] = sel === "" ? [value.length, value.length] : typeof sel === "string" ? at(value, sel) : sel;
  const out = applyFormat(kind, value, s, e);
  return { ...out, selected: out.value.slice(out.start, out.end) };
};

describe("inline formats keep the selection on the same words", () => {
  it("bold wraps the selected words and keeps them selected", () => {
    const r = run("bold", "make this loud please", "this loud");
    expect(r.value).toBe("make **this loud** please");
    expect(r.selected).toBe("this loud");
  });

  it("bold again takes the markers off (toggle), whether or not the markers are selected", () => {
    expect(run("bold", "make **this** loud", "this").value).toBe("make this loud");
    expect(run("bold", "make **this** loud", "**this**").value).toBe("make this loud");
  });

  it("italic and strike use their own markers; italic does not confuse bold for italic", () => {
    expect(run("italic", "a b c", "b").value).toBe("a *b* c");
    expect(run("strike", "a b c", "b").value).toBe("a ~~b~~ c");
    expect(run("italic", "a **b** c", "b").value).toBe("a ***b*** c");
  });

  it("with nothing selected it inserts a placeholder that is selected, ready to overtype", () => {
    const r = run("bold", "hello ", "");
    expect(r.value).toBe("hello **bold text**");
    expect(r.selected).toBe("bold text");
  });

  it("keeps the markers hugging the words when the selection includes spaces", () => {
    const r = run("bold", "one two three", " two ");
    expect(r.value).toBe("one **two** three");
    expect(r.selected).toBe("two");
  });

  it("inline code, and a fenced block for a multi-line selection", () => {
    expect(run("code", "run npm test now", "npm test").value).toBe("run `npm test` now");
    const block = run("code", "intro\na = 1\nb = 2", [6, 17]);
    expect(block.value).toBe("intro\n```\na = 1\nb = 2\n```");
    expect(block.selected).toBe("a = 1\nb = 2");
  });
});

describe("line formats", () => {
  it("makes a bulleted list of the selected lines, and toggles it back", () => {
    const text = "apples\npears\nplums";
    const on = applyFormat("ul", text, 0, text.length);
    expect(on.value).toBe("- apples\n- pears\n- plums");
    const off = applyFormat("ul", on.value, on.start, on.end);
    expect(off.value).toBe(text);
  });

  it("numbers lines in order and swaps a bullet list to a numbered one without stacking markers", () => {
    const num = applyFormat("ol", "a\nb\nc", 0, 5);
    expect(num.value).toBe("1. a\n2. b\n3. c");
    expect(applyFormat("ul", num.value, 0, num.value.length).value).toBe("- a\n- b\n- c");
  });

  it("works on just the line the caret is on, and keeps the caret in the same place in the text", () => {
    const text = "intro\nsecond line\noutro";
    const caret = text.indexOf("second") + 3; // inside "second"
    const r = applyFormat("quote", text, caret, caret);
    expect(r.value).toBe("intro\n> second line\noutro");
    expect(r.value.slice(r.start - 3, r.start)).toBe("sec");
  });

  it("skips blank lines inside a selection and does not drag in the next line", () => {
    const text = "one\n\ntwo\nthree";
    const r = applyFormat("ul", text, 0, text.indexOf("two") + 3 + 1); // selection ends after the newline following "two"
    expect(r.value).toBe("- one\n\n- two\nthree");
  });
});

describe("links", () => {
  it("wraps the selected words and selects the address to type", () => {
    const r = run("link", "see the docs here", "the docs");
    expect(r.value).toBe("see [the docs](https://) here");
    expect(r.selected).toBe("https://");
  });

  it("turns a selected address into a link and selects the label to write", () => {
    const r = run("link", "go to https://example.com now", "https://example.com");
    expect(r.value).toBe("go to [link text](https://example.com) now");
    expect(r.selected).toBe("link text");
  });

  it("with no selection inserts a template", () => {
    const r = run("link", "", "");
    expect(r.value).toBe("[link text](https://)");
  });
});

describe("robustness", () => {
  it("ignores unknown commands and clamps a bad selection", () => {
    expect(applyFormat("nope", "abc", 1, 2)).toEqual({ value: "abc", start: 1, end: 2 });
    expect(applyFormat("bold", "abc", -5, 99).value).toBe("**abc**");
    expect(applyFormat("bold", "", 0, 0).value).toBe("**bold text**");
  });

  it("maps Ctrl or Cmd plus B, I, K to commands and nothing else", () => {
    expect(shortcutFor({ key: "b", ctrlKey: true })).toBe("bold");
    expect(shortcutFor({ key: "I", metaKey: true })).toBe("italic");
    expect(shortcutFor({ key: "k", ctrlKey: true })).toBe("link");
    expect(shortcutFor({ key: "b" })).toBeNull();
    expect(shortcutFor({ key: "b", ctrlKey: true, shiftKey: true })).toBeNull();
    expect(shortcutFor({ key: "z", ctrlKey: true })).toBeNull();
  });
});

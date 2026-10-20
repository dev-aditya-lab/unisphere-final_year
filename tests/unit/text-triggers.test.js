import { describe, expect, it } from "vitest";
import { findTrigger } from "@/lib/text-triggers";
import { extractHashtags, extractMentions, tokenizeRichText } from "@/lib/text";

const at = (text, caret = text.length) => findTrigger(text, caret);

describe("findTrigger: mentions", () => {
  it("opens on a bare @ and filters as the name is typed", () => {
    expect(at("@")).toMatchObject({ type: "mention", query: "", start: 0 });
    expect(at("hi @ad")).toMatchObject({ type: "mention", query: "ad", start: 3, end: 6 });
  });

  it("works in the middle of a sentence, with the caret inside the word", () => {
    const text = "thanks @adit for the help";
    const caret = "thanks @ad".length;
    expect(at(text, caret)).toMatchObject({ type: "mention", query: "ad", start: 7, end: "thanks @adit".length });
  });

  it("works after a line break, an emoji and opening punctuation", () => {
    expect(at("line one\n@sa")).toMatchObject({ type: "mention", query: "sa" });
    expect(at("🎉 @sa")).toMatchObject({ type: "mention", query: "sa" });
    expect(at("(@sa")).toMatchObject({ type: "mention", query: "sa" });
  });

  it("ends at a space or punctuation, and reopens when the caret goes back into the word", () => {
    expect(at("@sam ")).toBeNull();
    expect(at("@sam,")).toBeNull();
    expect(at("@sam", 3)).toMatchObject({ type: "mention", query: "sa" });
  });

  it("does not treat an email address, a path or a doubled @ as a mention", () => {
    expect(at("write to bob@example.com")).toBeNull();
    expect(at("see /@handle")).toBeNull();
    expect(at("@@sam")).toBeNull();
  });
});

describe("findTrigger: hashtags", () => {
  it("opens on # and on a partial tag", () => {
    expect(at("#")).toMatchObject({ type: "hashtag", query: "", start: 0 });
    expect(at("learning #ai")).toMatchObject({ type: "hashtag", query: "ai", start: 9 });
  });

  it("covers the rest of the word when the caret is inside it", () => {
    expect(at("#robotics club", 4)).toMatchObject({ query: "rob", start: 0, end: "#robotics".length });
  });

  it("ignores C#, HTML entities and tags glued to a word", () => {
    expect(at("I like C#")).toBeNull();
    expect(at("it&#39")).toBeNull();
    expect(at("word#tag")).toBeNull();
  });

  it("stops at punctuation", () => {
    expect(at("#ai!")).toBeNull();
    expect(at("#ai ")).toBeNull();
  });
});

describe("the composer and the server agree on what a mention or tag is", () => {
  const samples = ["thanks @bob and @alice-w!", "email me at bob@example.com", "#AI and #ai are one tag", "C# is not a tag", "(@sam) said #Robotics"];
  it.each(samples)("%s", (text) => {
    const tokens = tokenizeRichText(text);
    const mentions = tokens.filter((t) => t.type === "mention").map((t) => t.value);
    const tags = tokens.filter((t) => t.type === "hashtag").map((t) => t.value);
    expect(extractMentions(text)).toEqual([...new Set(mentions)]);
    expect(extractHashtags(text)).toEqual([...new Set(tags)]);
  });

  it("normalises tag case so one tag is stored once", () => {
    expect(extractHashtags("#AI #Ai #ai")).toEqual(["ai"]);
  });

  it("caps how many mentions one text can create", () => {
    const many = Array.from({ length: 30 }, (_, i) => `@user${i}x`).join(" ");
    expect(extractMentions(many)).toHaveLength(10);
  });
});

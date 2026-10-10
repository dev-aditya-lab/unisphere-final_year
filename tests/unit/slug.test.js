import { describe, expect, it } from "vitest";
import { isValidSlug, slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases, strips accents and symbols", () => {
    expect(slugify("Café & Co-Working: Pune!")).toBe("cafe-and-co-working-pune");
  });
  it("never returns an empty slug", () => {
    expect(slugify("!!!", { fallback: "post" })).toBe("post");
    expect(slugify("")).toBe("item");
  });
  it("respects the maximum length without trailing hyphens", () => {
    const s = slugify("word ".repeat(40), { max: 20 });
    expect(s.length).toBeLessThanOrEqual(20);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("adds a random suffix so equal titles do not collide", () => {
    const a = uniqueSlug("Smart Mess Tracker");
    const b = uniqueSlug("Smart Mess Tracker");
    expect(a).not.toBe(b);
    expect(isValidSlug(a)).toBe(true);
    expect(a.startsWith("smart-mess-tracker-")).toBe(true);
  });
});

describe("isValidSlug", () => {
  it.each(["a", "hello-world", "a1-b2"])("accepts %s", (s) => expect(isValidSlug(s)).toBe(true));
  it.each(["", "Hello", "a--b", "-a", "a-", "a b", "../x"])("rejects %j", (s) => expect(isValidSlug(s)).toBe(false));
});

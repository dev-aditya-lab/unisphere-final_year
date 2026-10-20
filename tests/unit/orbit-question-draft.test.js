import { describe, expect, it } from "vitest";
import { AUTO_CATEGORIES, categoryForDay, shuffleWithKey } from "@/lib/orbits/question-draft";

describe("shuffleWithKey", () => {
  it("keeps every answer and points the key at the same answer wherever it lands", () => {
    const options = ["Alpha", "Bravo", "Charlie", "Delta"];
    for (let seed = 1; seed <= 50; seed++) {
      let s = seed;
      const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const out = shuffleWithKey(options, 2, random);
      expect([...out.options].sort()).toEqual([...options].sort());
      expect(out.options[out.correct]).toBe("Charlie");
    }
  });

  it("moves the key around instead of leaving it in place", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(shuffleWithKey(["a", "b", "c", "d"], 1).correct);
    expect(seen.size).toBe(4);
  });
});

describe("categoryForDay", () => {
  it("rotates daily through the categories, never campus life, and is stable for a date", () => {
    const week = Array.from({ length: 5 }, (_, i) => categoryForDay(`2031-03-${String(10 + i).padStart(2, "0")}`));
    expect(new Set(week).size).toBe(AUTO_CATEGORIES.length);
    expect(AUTO_CATEGORIES).not.toContain("campus");
    expect(categoryForDay("2031-03-11")).toBe(categoryForDay("2031-03-11"));
  });
});

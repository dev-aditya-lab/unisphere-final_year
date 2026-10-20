import { describe, expect, it } from "vitest";
import { normalizeInterests, rankCandidates, scorePost } from "@/lib/feed/rank";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

let n = 0;
const post = (over = {}) => ({
  id: `p${++n}`,
  author_id: `a${n}`,
  author_name: `Author ${n}`,
  college_id: "c1",
  category: "general",
  title: null,
  body: "A reasonably long post about something the community cares about, with enough text to count as substance. ".repeat(3),
  created_at: hoursAgo(2),
  reaction_count: 0,
  comment_count: 0,
  attachments: [],
  ...over,
});
const ctx = (over = {}) => ({ interests: [], following: new Set(), affinity: {}, now: NOW, viewerId: "me", ...over });
const ids = (list) => list.map((p) => p.id);

describe("scorePost", () => {
  it("is deterministic: same inputs, same score", () => {
    const p = post({ body: "Building a robotics club " + "x".repeat(300) });
    const c = ctx({ interests: ["robotics"] });
    expect(scorePost(p, c)).toEqual(scorePost(p, c));
  });

  it("rewards a stated interest, and explains it", () => {
    const match = post({ title: "Robotics club meets Friday" });
    const other = post({ title: "Canteen menu" });
    const c = ctx({ interests: ["robotics"] });
    expect(scorePost(match, c).score).toBeGreaterThan(scorePost(other, c).score);
    expect(scorePost(match, c).why).toBe("Matches your interest in robotics");
  });

  it("matches whole words and hashtags, not fragments", () => {
    const c = ctx({ interests: ["ai"] });
    expect(scorePost(post({ body: "Please email the maintenance team " + "y".repeat(300) }), c).why ?? "").not.toMatch(/Matches your interest/);
    expect(scorePost(post({ body: "Talk on #AI next week " + "y".repeat(300) }), c).why).toBe("Matches your interest in ai");
  });

  it("boosts followed authors", () => {
    const p = post({ author_id: "friend" });
    expect(scorePost(p, ctx({ following: new Set(["friend"]) })).score).toBeGreaterThan(scorePost(p, ctx()).score);
    expect(scorePost(p, ctx({ following: new Set(["friend"]) })).why).toBe("From someone you follow");
  });

  it("uses what the member engaged with, but the signal saturates", () => {
    const p = post({ category: "projects" });
    const some = scorePost(p, ctx({ affinity: { categories: { projects: 3 } } })).score;
    const lots = scorePost(p, ctx({ affinity: { categories: { projects: 3000 } } })).score;
    const none = scorePost(p, ctx()).score;
    expect(some).toBeGreaterThan(none);
    expect(lots - some).toBeLessThan(1.2); // capped by WEIGHTS.category
  });

  it("does not treat likes alone as quality", () => {
    const viral = post({ body: "lol", reaction_count: 5000 });
    const substantial = post({ comment_count: 12, reaction_count: 3 });
    expect(scorePost(substantial, ctx()).score).toBeGreaterThan(scorePost(viral, ctx()).score);
  });

  it("decays with age", () => {
    expect(scorePost(post({ created_at: hoursAgo(1) }), ctx()).score).toBeGreaterThan(scorePost(post({ created_at: hoursAgo(96) }), ctx()).score);
  });

  it("lowers topics and authors the member dismissed, and their own posts", () => {
    const base = scorePost(post({ category: "events", author_id: "x" }), ctx()).score;
    expect(scorePost(post({ category: "events", author_id: "x" }), ctx({ affinity: { dismissedCategories: { events: 3 } } })).score).toBeLessThan(base);
    expect(scorePost(post({ category: "events", author_id: "x" }), ctx({ affinity: { dismissedAuthors: { x: 1 } } })).score).toBeLessThan(base);
    expect(scorePost(post({ category: "events", author_id: "me" }), ctx()).score).toBeLessThan(base);
  });

  it("only offers 'something different' once there is a pattern to differ from", () => {
    const p = post({ category: "events" });
    expect(scorePost(p, ctx()).why).toBeNull(); // nothing personal to say yet, so nothing is claimed
    const withPattern = scorePost(p, ctx({ affinity: { categories: { projects: 5 } } }));
    expect(withPattern.why).toMatch(/Something different/);
  });
});

describe("rankCandidates", () => {
  it("gives a new member (no interests, follows or history) a varied page, not one author or topic", () => {
    const authors = ["a", "b", "c", "d"];
    const cats = ["general", "projects", "questions", "events"];
    const candidates = [];
    // one prolific author posting recently, plus several different members a little older
    for (let i = 0; i < 8; i++) candidates.push(post({ author_id: "prolific", category: "general", created_at: hoursAgo(1 + i * 0.1) }));
    authors.forEach((a, i) => candidates.push(post({ author_id: a, category: cats[i], created_at: hoursAgo(6 + i) })));
    const top6 = rankCandidates(candidates, ctx()).slice(0, 6);
    const byAuthor = top6.filter((p) => p.author_id === "prolific").length;
    expect(byAuthor).toBeLessThanOrEqual(3);
    expect(new Set(top6.map((p) => p.category)).size).toBeGreaterThanOrEqual(3);
  });

  it("does not let one category fill a page when others are available", () => {
    const candidates = [
      ...Array.from({ length: 10 }, (_, i) => post({ category: "questions", created_at: hoursAgo(1 + i * 0.2) })),
      ...Array.from({ length: 4 }, (_, i) => post({ category: "projects", created_at: hoursAgo(10 + i) })),
    ];
    const top8 = rankCandidates(candidates, ctx()).slice(0, 8);
    expect(top8.filter((p) => p.category === "projects").length).toBeGreaterThanOrEqual(2);
  });

  it("puts matching posts first for a member with interests", () => {
    const match = post({ title: "Robotics build night", author_id: "r1", created_at: hoursAgo(30) });
    const fresh = post({ title: "Parking update", author_id: "r2", created_at: hoursAgo(1) });
    const ranked = rankCandidates([fresh, match], ctx({ interests: ["robotics"] }));
    expect(ranked[0].id).toBe(match.id);
    expect(ranked[0].why).toBe("Matches your interest in robotics");
  });

  it("never invents or drops posts: output is a permutation of the input", () => {
    const input = Array.from({ length: 40 }, (_, i) => post({ author_id: `a${i % 7}`, category: ["general", "ideas", "projects"][i % 3], created_at: hoursAgo(i) }));
    const out = rankCandidates(input, ctx({ interests: ["x"] }));
    expect(ids(out).sort()).toEqual(ids(input).sort());
  });

  it("is stable for identical inputs and handles an empty window", () => {
    const input = Array.from({ length: 12 }, (_, i) => post({ created_at: hoursAgo(i) }));
    expect(ids(rankCandidates(input, ctx()))).toEqual(ids(rankCandidates(input, ctx())));
    expect(rankCandidates([], ctx())).toEqual([]);
  });

  it("ranks 150 posts within a small time budget (no unbounded work)", () => {
    const input = Array.from({ length: 150 }, (_, i) => post({ author_id: `a${i % 20}`, category: ["general", "ideas", "projects", "questions"][i % 4], created_at: hoursAgo(i / 3) }));
    const started = performance.now();
    rankCandidates(input, ctx({ interests: ["robotics", "ai", "design", "music"], affinity: { categories: { ideas: 4 }, tags: { ai: 3 } } }));
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("normalizeInterests", () => {
  it("lower-cases, strips #, drops duplicates and one-letter terms", () => {
    expect(normalizeInterests(["AI", "#ai", " Robotics ", "x", "", null])).toEqual(["ai", "robotics"]);
  });
});

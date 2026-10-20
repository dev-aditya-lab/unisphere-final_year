import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCardSpec } from "@/lib/orbits/card-spec";
import { REWARD_ICON_FILES, rewardIconFile, rewardIconSrc } from "@/lib/orbits/icons";

const DIR = path.resolve(import.meta.dirname, "../../public/icons/reward");

describe("reward artwork mapping", () => {
  it("only points at files that exist, and covers every file in the folder", () => {
    for (const file of Object.values(REWARD_ICON_FILES)) expect(existsSync(path.join(DIR, file)), file).toBe(true);
    for (let rank = 1; rank <= 10; rank++) expect(existsSync(path.join(DIR, rewardIconFile({ rank }))), `rank ${rank}`).toBe(true);
    const used = new Set([...Object.values(REWARD_ICON_FILES), ...Array.from({ length: 10 }, (_, i) => rewardIconFile({ rank: i + 1 }))]);
    expect(readdirSync(DIR).filter((f) => !used.has(f))).toEqual([]);
  });

  it("uses the Nth numbered badge for rank N and encodes the spaces in the file names", () => {
    expect(rewardIconFile({ rank: 1 })).toBe("1st-award badge.png");
    expect(rewardIconFile({ rank: 3 })).toBe("3rd-award badge.png");
    expect(rewardIconFile({ rank: 10 })).toBe("10th-award badge.png");
    expect(rewardIconSrc({ rank: 2 })).toBe("/icons/reward/2nd-award%20badge.png");
    expect(rewardIconSrc({ name: "orbit" })).toBe("/icons/reward/orbit.png");
  });

  it("falls back to a general badge for an unknown name or a rank outside 1 to 10", () => {
    expect(rewardIconFile({ name: "nope" })).toBe("award.png");
    expect(rewardIconFile({ name: "flame", rank: 11 })).toBe("flame.png");
    expect(rewardIconFile({ rank: 0 })).toBe("award.png");
  });
});

describe("Orbit Card text", () => {
  it("says exactly what the data says, in the right words", () => {
    const spec = buildCardSpec({ kind: "rank", rank: 3, scope: "college", period: "weekly", score: 1250, name: "Asha Rao", username: "asha" });
    // a live position, never presented as an earned badge
    expect(spec.headline).toBe("3rd on the college leaderboard");
    expect(spec.sub).toBe("This week so far · 1,250 Orbits");
    expect(spec.badge).toEqual({ rank: 3, name: undefined });
    expect(spec.who).toBe("Asha Rao");
    expect(spec.handle).toBe("@asha");
    expect(spec.shareText).toBe("Asha Rao is 3rd on the college leaderboard on UniSphere (This week so far · 1,250 Orbits)");
    expect(spec.shareText).not.toMatch(/earned|Top 10/);
  });

  it("shows the right ordinal, and does not say a period is over when it is not", () => {
    const spec = buildCardSpec({ kind: "rank", rank: 11, scope: "global", period: "monthly", score: 40 });
    expect(spec.headline).toBe("11th on the global leaderboard");
    expect(spec.sub).toContain("so far");
    expect(buildCardSpec({ kind: "rank", rank: 2, scope: "global", period: "alltime" }).sub).not.toContain("so far");
    expect(spec.badge.rank).toBeUndefined();
    expect(buildCardSpec({ kind: "rank", rank: 12, scope: "global", period: "alltime" }).headline).toContain("12th");
    expect(buildCardSpec({ kind: "rank", rank: 22, scope: "global", period: "alltime" }).headline).toContain("22nd");
    expect(buildCardSpec({ kind: "rank", rank: 101, scope: "global", period: "alltime" }).headline).toContain("101st");
  });

  it("leaves out the name and handle when the member has not allowed them", () => {
    const spec = buildCardSpec({ kind: "streak", days: 30, name: null, username: null });
    expect(spec.who).toBeNull();
    expect(spec.handle).toBeNull();
    expect(spec.headline).toBe("30-day Orbit Streak");
    expect(spec.shareText).toMatch(/^I earned/);
    expect(JSON.stringify(spec)).not.toMatch(/@/);
  });

  it("builds balance and badge cards from their own data and appends the verification link when there is one", () => {
    expect(buildCardSpec({ kind: "balance", balance: 12345 }).headline).toBe("12,345 Orbits earned");
    const badge = buildCardSpec({ kind: "achievement", title: "Sharp Mind", icon: "brain", url: "https://example.test/u/asha/orbits" });
    expect(badge).toMatchObject({ headline: "Sharp Mind", badge: { name: "brain" }, footer: "example.test/u/asha/orbits" });
    expect(badge.shareText.endsWith("https://example.test/u/asha/orbits")).toBe(true);
    const season = buildCardSpec({ kind: "achievement", title: "Orbit Elite: Global", icon: "award", scope: "global", period: "Season 1", rank: 2 });
    expect(season.sub).toBe("2nd · Global · Season 1");
    expect(season.badge.rank).toBe(2);
  });

  it("carries a badge picture an administrator uploaded, except where the numbered ranking badge is the meaning", () => {
    const key = "orbit_badge/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
    expect(buildCardSpec({ kind: "achievement", title: "Sharp Mind", icon: "brain", imageKey: key }).badge).toEqual({ name: "brain", rank: undefined, imageKey: key });
    expect(buildCardSpec({ kind: "streak", days: 7, imageKey: key }).badge).toEqual({ name: "flame", imageKey: key });
    // a top-ten position keeps its numbered badge, like RewardIcon on screen
    const ranked = buildCardSpec({ kind: "achievement", title: "Orbit Elite", icon: "award", rank: 2, scope: "global", period: "Season 1", imageKey: key });
    expect(ranked.badge.rank).toBe(2);
    expect(ranked.badge.imageKey).toBeUndefined();
    // no upload: the card stays on the built-in artwork
    expect(buildCardSpec({ kind: "achievement", title: "Sharp Mind", icon: "brain" }).badge.imageKey).toBeUndefined();
  });
});

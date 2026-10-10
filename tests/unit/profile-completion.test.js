import { describe, expect, it } from "vitest";
import { COMPLETION_ITEMS, profileCompletion } from "@/lib/profile-completion";

describe("profileCompletion", () => {
  it("weights add up to 100 so the percentage is meaningful", () => {
    expect(COMPLETION_ITEMS.reduce((s, i) => s + i.weight, 0)).toBe(100);
  });
  it("is 0 for an empty profile and 100 for a complete one", () => {
    expect(profileCompletion({ skills: [], interests: [] }).percent).toBe(0);
    const full = {
      avatar_key: "k",
      headline: "h",
      bio: "b",
      college_id: "c",
      department_id: "d",
      skills: ["a", "b", "c"],
      interests: ["x"],
      github_url: "https://g",
      verification_status: "verified",
    };
    expect(profileCompletion(full).percent).toBe(100);
  });
  it("lists exactly what is missing", () => {
    const { missing } = profileCompletion({ headline: "h", skills: ["a"], interests: [] });
    expect(missing.map((m) => m.key)).toContain("skills");
    expect(missing.map((m) => m.key)).not.toContain("headline");
  });
});

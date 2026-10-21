import { describe, expect, it } from "vitest";
import { draftNotice, hoursToBoardDeadline } from "@/lib/privacy/incident-templates";

const empty = { reference: "INC-2026-0001", severity: "high", systems: [], data_categories: [] };
const full = {
  ...empty,
  description: "A misconfigured storage rule exposed profile photos for two hours.",
  occurred_at: "2026-10-20T10:00:00Z",
  aware_at: "2026-10-20T12:00:00Z",
  systems: ["file storage"],
  data_categories: ["profile"],
  affected_count_estimate: 42,
  containment: "The rule was corrected.",
  remediation: "A policy check now runs on every deploy.",
  root_cause: "A rule was edited by hand.",
  findings_on_person: "No malicious actor was identified.",
};
const contact = { contactName: "Asha", contactEmail: "privacy@example.test" };

describe("breach notice drafts", () => {
  it("do not invent facts: everything missing is a visible [to be completed] marker", () => {
    for (const a of ["principals", "board_initial", "board_detailed"]) {
      const d = draftNotice(a, empty, contact);
      expect((d.subject + d.body).match(/\[to be completed:/g)?.length ?? 0, a).toBeGreaterThanOrEqual(3);
    }
  });

  it("use the recorded facts and nothing else", () => {
    const d = draftNotice("principals", full, contact);
    expect(d.body).toContain("misconfigured storage rule");
    expect(d.body).toContain("profile");
    expect(d.body).toContain("The rule was corrected.");
    expect(d.body).toContain("privacy@example.test");
    // Two things are never in the record and must stay for a person to write.
    expect(d.body).toMatch(/\[to be completed: the consequences/);
    expect(d.body).toMatch(/\[to be completed: specific steps/);
  });

  it("cover what Rule 7 asks for in the notice to the Board", () => {
    const initial = draftNotice("board_initial", full, contact).body;
    for (const word of ["Nature", "Extent", "Timing", "Location", "Likely impact"]) expect(initial).toContain(word);
    const detailed = draftNotice("board_detailed", full, contact).body;
    for (const word of ["Broad facts", "mitigate", "Findings regarding the person", "Remedial", "Intimations"]) expect(detailed).toContain(word);
  });
});

describe("the 72-hour clock", () => {
  it("counts from when UniSphere became aware, and is negative when overdue", () => {
    const now = Date.parse("2026-10-20T12:00:00Z") + 10 * 3600 * 1000;
    expect(Math.round(hoursToBoardDeadline("2026-10-20T12:00:00Z", now))).toBe(62);
    expect(hoursToBoardDeadline("2026-10-20T12:00:00Z", Date.parse("2026-10-24T12:00:00Z"))).toBeLessThan(0);
    expect(hoursToBoardDeadline(null)).toBeNull();
  });
});

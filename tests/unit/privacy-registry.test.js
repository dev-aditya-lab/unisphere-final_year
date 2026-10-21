import { describe, expect, it } from "vitest";
import { CURRENT_NOTICE, DATA_CATEGORIES, NOTICE_VERSIONS, OPTIONAL_PURPOSES, PURPOSES, PURPOSE_BY_KEY } from "@/lib/privacy/registry";
import { noticeContent, noticeFingerprint } from "@/lib/privacy/fingerprint";
import { getPolicySections } from "@/lib/privacy/policy-text";

describe("the privacy notice is versioned", () => {
  it("pins the current content: changing it without a new version fails here", () => {
    expect(
      noticeFingerprint(),
      `The purposes, itemised data or policy text changed. Add a new entry to NOTICE_VERSIONS in lib/privacy/registry.js and set its fingerprint to:\n${noticeFingerprint()}`,
    ).toBe(CURRENT_NOTICE.fingerprint);
  });

  it("has well-formed, ordered, unique versions", () => {
    const versions = NOTICE_VERSIONS.map((v) => v.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort()).toEqual(versions);
    for (const v of NOTICE_VERSIONS) {
      expect(v.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d{1,3}$/);
      expect(Number.isNaN(Date.parse(v.effectiveAt))).toBe(false);
      expect(v.summary.length).toBeGreaterThan(20);
      for (const p of v.reconsentPurposes) expect(PURPOSE_BY_KEY[p], p).toBeTruthy();
    }
  });

  it("is stable: the fingerprint does not depend on environment variables", () => {
    expect(noticeFingerprint()).toBe(noticeFingerprint());
    expect(JSON.stringify(noticeContent())).not.toMatch(/undefined|\$\{/);
  });
});

describe("purposes", () => {
  it("separate what an account needs from what is optional, and never bundle them", () => {
    const essential = PURPOSES.filter((p) => p.kind === "essential").map((p) => p.key);
    expect(essential.sort()).toEqual(["age_confirmation", "core_service"]);
    expect(OPTIONAL_PURPOSES.map((p) => p.key)).toEqual(["ai_assist", "ai_discovery_index", "identity_verification"]);
  });

  it("every itemised data category points at a real purpose, and optional purposes cover only optional data", () => {
    for (const c of DATA_CATEGORIES) {
      expect(PURPOSE_BY_KEY[c.purpose], c.id).toBeTruthy();
      if (PURPOSE_BY_KEY[c.purpose].kind === "optional") expect(c.required, `${c.id} is optional data`).toBe(false);
      expect(c.items.length).toBeGreaterThan(0);
    }
  });

  it("explain withdrawal for every purpose", () => {
    for (const p of PURPOSES) expect(p.withdrawal.length, p.key).toBeGreaterThan(20);
  });
});

describe("the policy text says only what the code does", () => {
  const ctx = { email: "x@example.test", handler: "Someone", entity: "", dpo: null, responseTarget: "14 days", maxDays: 90 };
  const text = JSON.stringify(getPolicySections(ctx));

  it("does not claim certifications, a DPO or a legal entity that is not configured", () => {
    expect(text).not.toMatch(/ISO ?27001|SOC ?2|certified|compliant with the DPDP|fully compliant|bank-grade|military/i);
    expect(text).toMatch(/has not appointed a Data Protection Officer/);
    expect(text).not.toMatch(/Significant Data Fiduciary/);
  });

  it("states what is not in place", () => {
    expect(text).toMatch(/not had an independent security audit/);
  });

  it("names a DPO only when one is configured, and an entity only when configured", () => {
    const withDpo = JSON.stringify(getPolicySections({ ...ctx, dpo: "Asha Rao", entity: "Example Foundation" }));
    expect(withDpo).toMatch(/Asha Rao/);
    expect(withDpo).toMatch(/Example Foundation/);
    expect(text).not.toMatch(/Asha Rao|Example Foundation/);
  });

  it("describes adults-only honestly: a declaration, not a verification", () => {
    expect(text).toMatch(/declaration, not a check/);
    expect(text).toMatch(/does not offer accounts to under-18s/);
    expect(text).not.toMatch(/parental consent is verified|verified age/i);
  });

  it("does not promise AI providers forget data", () => {
    expect(text).not.toMatch(/never (store|retain|keep)|do(es)? not retain|zero retention/i);
  });
});

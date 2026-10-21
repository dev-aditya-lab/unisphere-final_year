import { describe, expect, it } from "vitest";
import { evaluateGate, isPrivacySafePath, needsReconsent } from "@/lib/privacy/gate";
import { NOTICE_VERSION } from "@/lib/privacy/registry";

const granted = (version = NOTICE_VERSION) => ({ status: "granted", notice_version: version, updated_at: "2026-10-21T00:00:00Z" });
const full = { core_service: granted(), age_confirmation: granted() };

describe("privacy gate", () => {
  it("asks nothing of a member who has agreed under the current notice", () => {
    expect(evaluateGate({ consents: full, createdAt: "2026-11-01T00:00:00Z" }).state).toBe("ok");
  });

  it("never locks anyone out when the consent tables cannot be read", () => {
    expect(evaluateGate({ consents: null, createdAt: "2026-11-01T00:00:00Z", mode: "required" }).state).toBe("ok");
  });

  it("is a soft banner for an account that predates the consent flow", () => {
    const g = evaluateGate({ consents: {}, createdAt: "2026-01-01T00:00:00Z", cutoverAt: "2026-10-21T00:00:00Z" });
    expect(g.state).toBe("review_soft");
    expect(g.missing).toEqual(["age_confirmation", "core_service"]);
  });

  it("is required for an account created after the cutover (for example one that bypassed the signup form)", () => {
    expect(evaluateGate({ consents: {}, createdAt: "2026-11-05T00:00:00Z", cutoverAt: "2026-10-21T00:00:00Z" }).state).toBe("review_required");
  });

  it("becomes required for everyone when the privacy team switches the mode", () => {
    expect(evaluateGate({ consents: {}, createdAt: "2026-01-01T00:00:00Z", cutoverAt: "2026-10-21T00:00:00Z", mode: "required" }).state).toBe("review_required");
  });

  it("treats a declared minor as a minor under an adults-only policy", () => {
    const g = evaluateGate({ consents: { age_confirmation: { status: "declined", notice_version: NOTICE_VERSION } }, createdAt: "2026-01-01T00:00:00Z" });
    expect(g.state).toBe("minor");
  });

  it("a withdrawn or declined core consent counts as missing", () => {
    const g = evaluateGate({ consents: { ...full, core_service: { status: "declined", notice_version: NOTICE_VERSION } }, createdAt: "2026-01-01T00:00:00Z" });
    expect(g.missing).toEqual(["core_service"]);
  });

  it("re-consent is asked only for purposes a newer notice says need it", () => {
    expect(needsReconsent(granted(NOTICE_VERSION), "core_service")).toBe(false);
    expect(needsReconsent(null, "core_service")).toBe(false);
    expect(needsReconsent({ status: "withdrawn", notice_version: NOTICE_VERSION }, "ai_assist")).toBe(false);
  });

  it("keeps the pages for withdrawing, downloading and deleting reachable whatever the state", () => {
    for (const p of ["/privacy-review", "/delete-account", "/privacy-requests", "/privacy-requests/abc", "/settings/privacy", "/settings", "/suspended", "/privacy-review?next=%2Ffeed"]) {
      expect(isPrivacySafePath(p), p).toBe(true);
    }
    for (const p of ["/feed", "/messages", "/u/someone", "/settingsx", "/", "/projects/new"]) expect(isPrivacySafePath(p), p).toBe(false);
  });
});

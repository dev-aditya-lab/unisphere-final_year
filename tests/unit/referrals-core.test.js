import { describe, expect, it } from "vitest";
import {
  REFERRAL_REWARD, REF_CODE_REGEX, buildReferralUrl, buildShareText, makeRefCookieValue, normalizeRefCode, parseRefCookieValue, qualificationRules, shareTargets,
} from "@/lib/referrals/core";

const CODE = "aditya-k7m2";
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

describe("referral codes", () => {
  it("accepts username-plus-suffix codes, in any case", () => {
    expect(normalizeRefCode(CODE)).toBe(CODE);
    expect(normalizeRefCode(` ${CODE.toUpperCase()} `)).toBe(CODE);
    expect(normalizeRefCode("the_real-name-9xzp")).toBe("the_real-name-9xzp");
    expect(normalizeRefCode("abc-k7m2")).toBe("abc-k7m2");
  });

  it("refuses anything else, including look-alike symbols, wrong suffix length and hostile input", () => {
    const long = "a".repeat(31);
    for (const bad of ["", "aditya", "aditya-k7m", "aditya-k7m22", "aditya-k7m0", "aditya-k7m1", "aditya-k7mi", "aditya-k7ml", "aditya-k7mo", "ab-k7m2", `${long}-k7m2`,
      "adi tya-k7m2", "aditya_k7m2", "<script>", "x".repeat(300), null, undefined, 42, {}, ["aditya-k7m2"]]) {
      expect(normalizeRefCode(bad), String(bad)).toBeNull();
    }
    expect(REF_CODE_REGEX.test(CODE)).toBe(true);
  });

  it("matches the pattern the database enforces on referral_codes", () => {
    expect(REF_CODE_REGEX.source).toBe("^[a-z0-9_-]{3,30}-[abcdefghjkmnpqrstuvwxyz23456789]{4}$");
  });
});

describe("the attribution cookie", () => {
  it("round-trips a code inside its window", () => {
    const v = makeRefCookieValue(CODE, NOW);
    expect(v).toBe(`${CODE}.${NOW / 1000}`);
    expect(parseRefCookieValue(v, { nowMs: NOW + 29 * 86_400_000, maxDays: 30 })).toBe(CODE);
  });

  it("expires after the attribution window", () => {
    const v = makeRefCookieValue(CODE, NOW);
    expect(parseRefCookieValue(v, { nowMs: NOW + 31 * 86_400_000, maxDays: 30 })).toBeNull();
    expect(parseRefCookieValue(v, { nowMs: NOW + 31 * 86_400_000, maxDays: 45 })).toBe(CODE); // the window is a setting
  });

  it("refuses tampered, malformed and future values", () => {
    for (const bad of [undefined, null, "", CODE, `${CODE}.`, `${CODE}.abc`, `${CODE}.${NOW / 1000}.x`, `short.${NOW / 1000}`, `${CODE}.${NOW / 1000 + 86_400}`, `${CODE}.1`, `${CODE}.99999999999999`]) {
      expect(parseRefCookieValue(bad, { nowMs: NOW, maxDays: 30 }), String(bad)).toBeNull();
    }
    expect(makeRefCookieValue("nope", NOW)).toBeNull();
  });
});

describe("the invite link and sharing", () => {
  it("uses the real sign-up route and the generated code", () => {
    expect(buildReferralUrl(CODE, "https://unispheres.in")).toBe(`https://unispheres.in/register?ref=${CODE}`);
    expect(buildReferralUrl(CODE.toLowerCase(), "https://unispheres.in/")).toBe(`https://unispheres.in/register?ref=${CODE}`);
    expect(buildReferralUrl("bad", "https://unispheres.in")).toBeNull();
  });

  it("puts the actual link in the share text, with no placeholder or hard-coded code", () => {
    const url = buildReferralUrl(CODE, "https://unispheres.in");
    const text = buildShareText(url);
    expect(text).toBe(`Join me on UniSphere — connect with students, discover opportunities and build your community. Join here: ${url}`);
    expect(text).not.toMatch(/\[|\]|REFERRAL_CODE/);
  });

  it("builds every share target from that one link", () => {
    const url = buildReferralUrl(CODE, "https://unispheres.in");
    const targets = shareTargets(url);
    expect(targets.map((t) => t.id)).toEqual(["whatsapp", "telegram", "x", "linkedin", "email", "sms"]);
    for (const t of targets) expect(decodeURIComponent(t.href), t.id).toContain(url);
    expect(targets[0].href.startsWith("https://wa.me/?text=")).toBe(true);
    for (const t of targets) expect(t.href).toMatch(/^(https:\/\/|mailto:|sms:)/);
    expect(shareTargets(null)).toEqual([]);
  });
});

describe("what the page promises", () => {
  it("states the qualification rule from the live settings, nothing more", () => {
    const rules = qualificationRules({ activation_days: 2, qualify_days: 30 }).join(" ");
    expect(rules).toMatch(/confirms their email/);
    expect(rules).toMatch(/2 different days/);
    expect(rules).toMatch(/30 days/);
    expect(qualificationRules({ activation_days: 1, qualify_days: 14 }).join(" ")).toMatch(/a day/);
    expect(REFERRAL_REWARD).toBe(100);
  });
});

import { describe, expect, it } from "vitest";
import { formatEventRange, isValidTimezone, tzLabel, utcIsoToZonedLocal, zonedLocalToUtcIso } from "@/lib/time";

describe("zonedLocalToUtcIso", () => {
  it("converts fixed-offset zones", () => {
    expect(zonedLocalToUtcIso("2026-10-20T18:00", "Asia/Kolkata")).toBe("2026-10-20T12:30:00.000Z");
    expect(zonedLocalToUtcIso("2026-10-20T18:00", "UTC")).toBe("2026-10-20T18:00:00.000Z");
  });
  it("honours daylight saving time on both sides of a transition", () => {
    expect(zonedLocalToUtcIso("2026-07-01T12:00", "America/New_York")).toBe("2026-07-01T16:00:00.000Z"); // EDT, UTC-4
    expect(zonedLocalToUtcIso("2026-12-01T12:00", "America/New_York")).toBe("2026-12-01T17:00:00.000Z"); // EST, UTC-5
    expect(zonedLocalToUtcIso("2026-07-01T12:00", "Europe/London")).toBe("2026-07-01T11:00:00.000Z"); // BST
  });
  it("round-trips through the zone", () => {
    for (const tz of ["Asia/Kolkata", "America/Los_Angeles", "Australia/Sydney", "Europe/Berlin"]) {
      const iso = zonedLocalToUtcIso("2026-03-15T09:30", tz);
      expect(utcIsoToZonedLocal(iso, tz)).toBe("2026-03-15T09:30");
    }
  });
  it("rejects malformed input and unknown zones", () => {
    expect(zonedLocalToUtcIso("tomorrow", "UTC")).toBeNull();
    expect(zonedLocalToUtcIso("2026-10-20T18:00", "Mars/Olympus")).toBeNull();
    expect(zonedLocalToUtcIso("2026-13-40T99:99", "UTC")).toBeNull();
  });
});

describe("isValidTimezone / formatEventRange", () => {
  it("validates IANA names", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
  it("shows the event in its own timezone and collapses same-day ranges", () => {
    const text = formatEventRange("2026-10-20T12:30:00.000Z", "2026-10-20T14:30:00.000Z", "Asia/Kolkata");
    expect(text).toMatch(/6:00\s?pm/i);
    expect(text).toMatch(/8:00\s?pm/i);
    expect(text.match(/2026/g)).toHaveLength(1);
  });
});

describe("tzLabel", () => {
  it("uses the familiar abbreviation for Indian Standard Time", () => {
    expect(tzLabel("Asia/Kolkata", new Date("2026-10-20T12:30:00Z"))).toBe("IST");
  });
});

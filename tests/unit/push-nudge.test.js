import { describe, expect, it } from "vitest";
import { MAX_NUDGES, NUDGE_GAPS_DAYS, afterNudge, decideNudge, parseNudgeHistory, silencedNudges } from "@/lib/native/push-nudge";

// When the Android app offers to turn notifications on: helpful, never a nag.
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const off = { supported: true, permission: "prompt", enabled: false };
const blocked = { supported: true, permission: "denied", enabled: false };
const at = (daysAgo) => NOW - daysAgo * DAY;

describe("when the notifications pop-up is shown", () => {
  it("is shown straight away the first time, and leads to the permission box", () => {
    expect(decideNudge({ state: off, history: null, now: NOW })).toBe("ask");
    expect(decideNudge({ state: off, history: undefined, now: NOW })).toBe("ask");
  });

  it("is never shown when notifications are already on, or the phone cannot receive them", () => {
    expect(decideNudge({ state: { supported: true, permission: "granted", enabled: true }, history: null, now: NOW })).toBeNull();
    expect(decideNudge({ state: { supported: false }, history: null, now: NOW })).toBeNull();
    expect(decideNudge({ state: undefined, history: null, now: NOW })).toBeNull();
  });

  it("explains the phone's settings instead once Android has stopped asking", () => {
    expect(decideNudge({ state: blocked, history: null, now: NOW })).toBe("settings");
  });

  it("asks again where Android allows it but has not been allowed yet (and on old Androids, which never show a box)", () => {
    expect(decideNudge({ state: { supported: true, permission: "granted", enabled: false }, history: null, now: NOW })).toBe("ask");
  });

  it("waits 3, then 7, then 14 days between reminders", () => {
    expect(NUDGE_GAPS_DAYS).toEqual([0, 3, 7, 14]);
    const shown = (count, daysAgo) => ({ count, lastAt: at(daysAgo), never: false });
    expect(decideNudge({ state: off, history: shown(1, 2.9), now: NOW })).toBeNull();
    expect(decideNudge({ state: off, history: shown(1, 3.1), now: NOW })).toBe("ask");
    expect(decideNudge({ state: off, history: shown(2, 6.9), now: NOW })).toBeNull();
    expect(decideNudge({ state: off, history: shown(2, 7.1), now: NOW })).toBe("ask");
    expect(decideNudge({ state: off, history: shown(3, 13.9), now: NOW })).toBeNull();
    expect(decideNudge({ state: off, history: shown(3, 14.1), now: NOW })).toBe("ask");
  });

  it("stops for good after four pop-ups, however long ago the last was", () => {
    expect(MAX_NUDGES).toBe(4);
    expect(decideNudge({ state: off, history: { count: 4, lastAt: at(400), never: false }, now: NOW })).toBeNull();
    expect(decideNudge({ state: blocked, history: { count: 9, lastAt: at(400), never: false }, now: NOW })).toBeNull();
  });

  it("respects \"Don't ask again\" and a member who switched notifications off themselves", () => {
    expect(decideNudge({ state: off, history: { count: 1, lastAt: at(100), never: true }, now: NOW })).toBeNull();
    expect(decideNudge({ state: off, history: silencedNudges({ count: 0, lastAt: 0, never: false }, NOW), now: NOW + 365 * DAY })).toBeNull();
  });
});

describe("remembering what was shown", () => {
  it("counts each pop-up and keeps \"never\" once it is set", () => {
    const first = afterNudge(null, NOW);
    expect(first).toEqual({ count: 1, lastAt: NOW, never: false });
    const second = afterNudge(first, NOW + DAY, { never: true });
    expect(second).toEqual({ count: 2, lastAt: NOW + DAY, never: true });
    expect(afterNudge(second, NOW + 2 * DAY).never).toBe(true);
  });

  it("reads what is stored defensively: anything unexpected is the same as never having been shown", () => {
    const none = { count: 0, lastAt: 0, never: false };
    for (const raw of [null, undefined, "", "not json", "[]", "42", '{"count":"3"}', '{"count":-1}', '{"count":1.5}', '{"lastAt":"yesterday"}']) {
      expect(parseNudgeHistory(raw), String(raw)).toEqual(expect.objectContaining({ never: false }));
    }
    expect(parseNudgeHistory("not json")).toEqual(none);
    expect(parseNudgeHistory('{"count":2,"lastAt":123,"never":true}')).toEqual({ count: 2, lastAt: 123, never: true });
    expect(parseNudgeHistory('{"count":999999}').count).toBe(99);
    expect(parseNudgeHistory({ count: 3, lastAt: 5, never: "yes" }).never).toBe(false);
  });
});

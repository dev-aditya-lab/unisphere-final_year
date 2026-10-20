import { describe, expect, it, vi } from "vitest";

// Each test gets a fresh module, because the store is module-level state shared by every widget on a page.
async function fresh() {
  vi.resetModules();
  return import("@/lib/orbits/glance-store");
}
const snap = (at, balance = 0, pending = 0) => ({ at, balance, pending, checkin: { claimed_today: false, reward: 5 }, streak: { current: 0 } });

describe("glance store", () => {
  it("only moves forward in time: a slow or stale snapshot never replaces a newer one", async () => {
    const { publishGlance, peekGlance } = await fresh();
    publishGlance(snap(100, 5));
    publishGlance(snap(300, 20));
    publishGlance(snap(200, 10)); // arrives late
    expect(peekGlance().balance).toBe(20);
    publishGlance(snap(300, 99)); // same instant: ignored
    expect(peekGlance().balance).toBe(20);
  });

  it("ignores empty or malformed input instead of clearing what it knows", async () => {
    const { publishGlance, peekGlance } = await fresh();
    publishGlance(snap(100, 5));
    publishGlance(null);
    publishGlance({ balance: 1 });
    expect(peekGlance().balance).toBe(5);
  });

  it("patches locally (badges taken) without claiming to be newer", async () => {
    const { publishGlance, patchGlance, peekGlance } = await fresh();
    publishGlance(snap(100, 5, 2));
    patchGlance({ pending: 0 });
    expect(peekGlance()).toMatchObject({ pending: 0, at: 100, balance: 5 });
    publishGlance(snap(100, 5, 2)); // the same server render again must not bring the badges back
    expect(peekGlance().pending).toBe(0);
    publishGlance(snap(200, 5, 1)); // a genuinely newer read may
    expect(peekGlance().pending).toBe(1);
  });
});

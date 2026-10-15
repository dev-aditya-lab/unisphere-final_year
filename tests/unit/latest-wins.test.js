import { describe, expect, it } from "vitest";
import { createLatestWins } from "@/lib/client/latest-wins";

/** A save function whose responses the test releases by hand, in any order. */
function manualSave() {
  const calls = [];
  const save = (value) =>
    new Promise((resolve) => {
      calls.push({ value, resolve });
    });
  return { save, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createLatestWins", () => {
  it("shows the change at once and saves it", async () => {
    const shown = [];
    const { save, calls } = manualSave();
    const c = createLatestWins({ initial: false, save, onChange: (v) => shown.push(v) });
    c.set(true);
    expect(shown).toEqual([true]); // before any response
    expect(calls.map((x) => x.value)).toEqual([true]);
    calls[0].resolve({ ok: true });
    await tick();
    expect(c.confirmed).toBe(true);
  });

  it("sends one request at a time and finishes on the newest intent", async () => {
    const shown = [];
    const { save, calls } = manualSave();
    const c = createLatestWins({ initial: false, save, onChange: (v) => shown.push(v) });
    c.set(true);
    c.set(false);
    c.set(true);
    expect(calls).toHaveLength(1); // the later taps wait for the first response
    calls[0].resolve({ ok: true });
    await tick();
    // the final intent equals what the server confirmed, so there is nothing more to send
    expect(calls).toHaveLength(1);
    expect(c.confirmed).toBe(true);
    expect(shown.at(-1)).toBe(true);
  });

  it("sends a follow-up when the member ended up somewhere else", async () => {
    const { save, calls } = manualSave();
    const c = createLatestWins({ initial: false, save, onChange: () => {} });
    c.set(true);
    c.set(false); // changed their mind while the first request was in flight
    calls[0].resolve({ ok: true });
    await tick();
    expect(calls.map((x) => x.value)).toEqual([true, false]);
    calls[1].resolve({ ok: true });
    await tick();
    expect(c.confirmed).toBe(false);
  });

  it("rolls back to the last confirmed value and reports a failure", async () => {
    const shown = [];
    const errors = [];
    const { save, calls } = manualSave();
    const c = createLatestWins({ initial: false, save, onChange: (v) => shown.push(v), onError: (e, attempted) => errors.push([e, attempted]) });
    c.set(true);
    calls[0].resolve({ ok: false, error: "Nope" });
    await tick();
    expect(shown).toEqual([true, false]);
    expect(errors).toEqual([["Nope", true]]);
    expect(c.confirmed).toBe(false);
  });

  it("treats a thrown error like a failed save", async () => {
    const errors = [];
    const c = createLatestWins({
      initial: 0,
      save: async () => {
        throw new Error("offline");
      },
      onChange: () => {},
      onError: (e) => errors.push(e),
    });
    await c.set(1);
    expect(errors).toEqual(["offline"]);
  });

  it("adopts the server's numbers when nothing changed in the meantime", async () => {
    const shown = [];
    const { save, calls } = manualSave();
    const c = createLatestWins({
      initial: { reaction: null, count: 4 },
      equals: (a, b) => a.reaction === b.reaction,
      save,
      onChange: (v) => shown.push(v),
    });
    c.set({ reaction: "like", count: 5 });
    calls[0].resolve({ ok: true, value: { reaction: "like", count: 9 } }); // others liked it too
    await tick();
    expect(shown.at(-1)).toEqual({ reaction: "like", count: 9 });
  });

  it("does not overwrite a newer choice with a stale server response", async () => {
    const shown = [];
    const { save, calls } = manualSave();
    const c = createLatestWins({
      initial: { reaction: null, count: 1 },
      equals: (a, b) => a.reaction === b.reaction,
      save,
      onChange: (v) => shown.push(v),
    });
    c.set({ reaction: "like", count: 2 });
    c.set({ reaction: null, count: 1 });
    calls[0].resolve({ ok: true, value: { reaction: "like", count: 7 } });
    await tick();
    expect(shown.at(-1)).toEqual({ reaction: null, count: 1 }); // the member's newer choice still shows
    expect(calls).toHaveLength(2); // and is being saved
  });
});

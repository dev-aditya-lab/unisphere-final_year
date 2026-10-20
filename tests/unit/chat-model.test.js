import { describe, expect, it } from "vitest";
import { backoffMs, classifyFailure, compareByTime, composeView, cursorAtOrAfter, keyOf, previewOf, preferServer } from "@/lib/chat/model";
import { COMPRESS, compressImage, targetSize, wantsCompression } from "@/lib/images/compress-core";

describe("ordering", () => {
  it("orders by time, then by microseconds, then by id", () => {
    const a = { created_at: "2026-01-01T00:00:00.123400+00:00", id: "b" };
    const b = { created_at: "2026-01-01T00:00:00.123456+00:00", id: "a" };
    expect(compareByTime(a, b)).toBeLessThan(0);
    expect(compareByTime({ created_at: "2026-01-01T00:00:00+00:00", id: "a" }, { created_at: "2026-01-01T00:00:00+00:00", id: "b" })).toBeLessThan(0);
    expect(compareByTime({ created_at: "2026-01-02T00:00:00+00:00", id: "a" }, { created_at: "2026-01-01T00:00:00+00:00", id: "z" })).toBeGreaterThan(0);
  });

  it("compares cursors", () => {
    expect(cursorAtOrAfter({ ts: "2026-01-02T00:00:00+00:00", id: "a" }, { ts: "2026-01-01T00:00:00+00:00", id: "a" })).toBe(true);
    expect(cursorAtOrAfter({ ts: "2026-01-01T00:00:00+00:00", id: "a" }, { ts: "2026-01-01T00:00:00+00:00", id: "a" })).toBe(true);
    expect(cursorAtOrAfter(null, { ts: "x", id: "a" })).toBe(false);
  });

  it("puts unconfirmed messages after confirmed ones whatever the device clock says", () => {
    const confirmed = [{ id: "1", key: "1", created_at: "2026-01-01T10:00:00+00:00" }];
    const outbox = [{ client_op_id: "x", conversation_id: "c", body: "from a slow clock", created_at: "2025-01-01T00:00:00.000Z", queued_at: 1, state: "queued", attempts: 0 }];
    const view = composeView(confirmed, outbox, "me");
    expect(view.map((m) => m.id)).toEqual(["1", "x"]);
    expect(view[1].send.state).toBe("queued");
  });

  it("returns the same view object while an outbox entry is unchanged (memoised rows hold)", () => {
    const entry = { client_op_id: "x", conversation_id: "c", body: "hi", created_at: "t", queued_at: 1, state: "queued", attempts: 0 };
    expect(composeView([], [entry], "me")[0]).toBe(composeView([], [entry], "me")[0]);
    entry.state = "failed";
    expect(composeView([], [entry], "me")[0].send.state).toBe("failed");
  });

  it("keys a message by its client id so the bubble survives confirmation", () => {
    expect(keyOf({ id: "server", client_op_id: "client" })).toBe("client");
    expect(keyOf({ id: "server", client_op_id: null })).toBe("server");
  });

  it("never lets a stale copy undelete a message", () => {
    expect(preferServer({ status: "deleted" }, { status: "sent" }).status).toBe("deleted");
    expect(preferServer({ status: "sent" }, { status: "deleted" }).status).toBe("deleted");
  });
});

describe("previews and retry policy", () => {
  it("matches the database preview", () => {
    expect(previewOf("  hello \n\n  world  ")).toBe("hello world");
    expect(previewOf("", [{ id: "f" }])).toBe("Sent an attachment");
    expect(previewOf("x".repeat(200))).toHaveLength(90);
  });

  it("backs off exponentially with a cap", () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => backoffMs(n, mid))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(backoffMs(3, () => 0)).toBeLessThan(backoffMs(3, () => 1));
  });

  it("separates transient, permanent and session failures", () => {
    expect(classifyFailure({ ok: false, kind: "network" })).toBe("retry");
    expect(classifyFailure({ ok: false, kind: "transient" })).toBe("retry");
    expect(classifyFailure({ ok: false, kind: "permanent" })).toBe("fail");
    expect(classifyFailure({ ok: false, kind: "notfound" })).toBe("fail");
    expect(classifyFailure({ ok: false, kind: "auth" })).toBe("auth");
    expect(classifyFailure({ ok: true })).toBeNull();
  });
});

describe("image compression rules", () => {
  const env = (outSize, type) => ({
    createCanvas: (w, h) => ({ w, h, getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_) {}, set imageSmoothingQuality(_) {} }) }),
    encode: async () => new Blob([new Uint8Array(outSize)], { type }),
    decode: async () => ({ width: env.w, height: env.h, close() {} }),
  });
  const file = (size, type) => new Blob([new Uint8Array(size)], { type });
  const withDims = (e, w, h) => ({ ...e, decode: async () => ({ width: w, height: h, close() {} }) });

  it("only touches photos", () => {
    expect(wantsCompression({ type: "image/jpeg" })).toBe(true);
    expect(wantsCompression({ type: "application/pdf" })).toBe(false);
  });

  it("scales down, never up", () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 2048, height: 1536, scaled: true });
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
  });

  it("leaves small images alone", async () => {
    const r = await compressImage(file(100_000, "image/jpeg"), withDims(env(10, "image/jpeg"), 1000, 800));
    expect(r.changed).toBe(false);
  });

  it("shrinks a large photo and keeps its format", async () => {
    const r = await compressImage(file(4_000_000, "image/jpeg"), withDims(env(600_000, "image/jpeg"), 4032, 3024));
    expect(r.changed).toBe(true);
    expect(r.blob.type).toBe("image/jpeg");
    expect(r.blob.size).toBe(600_000);
  });

  it("returns the original when re-encoding does not help", async () => {
    const original = file(4_000_000, "image/jpeg");
    const r = await compressImage(original, withDims(env(3_900_000, "image/jpeg"), 4032, 3024));
    expect(r.changed).toBe(false);
    expect(r.blob).toBe(original);
    expect(COMPRESS.minSaving).toBeLessThan(1);
  });

  it("does not convert formats (a PNG stays a PNG)", async () => {
    const original = file(5_000_000, "image/png");
    const r = await compressImage(original, withDims(env(900_000, "image/jpeg"), 3000, 2000));
    expect(r.changed).toBe(false); // the encoder returned a different type: rejected
  });

  it("passes through what it cannot decode", async () => {
    const original = file(2_000_000, "image/jpeg");
    const r = await compressImage(original, { createCanvas: () => null, encode: async () => null, decode: async () => Promise.reject(new Error("bad")) });
    expect(r.blob).toBe(original);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/push/native: the app registers and forgets its phone here. The guards are the point: it is cookie-authenticated.
const getAuthUser = vi.fn();
const enforceRateLimit = vi.fn();
const saveDevice = vi.fn();
const removeDevice = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAuthUser: (...a) => getAuthUser(...a) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a) => enforceRateLimit(...a) }));
vi.mock("@/lib/services/push", () => ({ saveDevice: (...a) => saveDevice(...a), removeDevice: (...a) => removeDevice(...a) }));
const { POST, DELETE } = await import("@/app/api/push/native/route");

const TOKEN = "f3Gh-_9:APA91bHnqzXyKq0aYy2Jt8vVwq0tYy9a0r1Tt3Yp5cQ_x8LmN0pQ2";
const call = (handler, { method = "POST", origin = "http://localhost:3000", body = { token: TOKEN, platform: "android", appVersion: "2.6.0" } } = {}) =>
  handler(
    new Request("http://localhost:3000/api/push/native", {
      method,
      headers: { "content-type": "application/json", host: "localhost:3000", ...(origin ? { origin } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  for (const fn of [getAuthUser, enforceRateLimit, saveDevice, removeDevice]) fn.mockReset();
  getAuthUser.mockResolvedValue({ id: "user-1" });
  enforceRateLimit.mockResolvedValue(null);
  saveDevice.mockResolvedValue({ ok: true });
  removeDevice.mockResolvedValue({ ok: true });
});

describe("POST /api/push/native", () => {
  it("registers the phone for the signed-in member", async () => {
    const res = await call(POST);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(saveDevice).toHaveBeenCalledWith({ userId: "user-1", input: { token: TOKEN, platform: "android", appVersion: "2.6.0" } });
    expect(enforceRateLimit).toHaveBeenCalledWith("push-device", "user-1", { limit: 30, windowSec: 3600 });
  });

  it("refuses a request that comes from another site, before looking at who is signed in", async () => {
    const res = await call(POST, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(getAuthUser).not.toHaveBeenCalled();
    expect(saveDevice).not.toHaveBeenCalled();
  });

  it("refuses a request with neither an Origin nor a Referer", async () => {
    expect((await call(POST, { origin: null })).status).toBe(403);
  });

  it("asks for a sign-in", async () => {
    getAuthUser.mockResolvedValue(null);
    const res = await call(POST);
    expect(res.status).toBe(401);
    expect(saveDevice).not.toHaveBeenCalled();
  });

  it("is rate limited per member", async () => {
    enforceRateLimit.mockResolvedValue({ error: "Too many requests." });
    const res = await call(POST);
    expect(res.status).toBe(429);
    expect(saveDevice).not.toHaveBeenCalled();
  });

  it("answers 400 with the reason when the device is not valid, and treats a body that is not JSON as no device", async () => {
    saveDevice.mockResolvedValue({ ok: false, error: "That device is not valid." });
    const res = await call(POST, { body: { token: "x" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That device is not valid." });

    await call(POST, { body: "not json" });
    expect(saveDevice).toHaveBeenLastCalledWith({ userId: "user-1", input: null });
  });
});

describe("DELETE /api/push/native", () => {
  it("forgets the phone, only for the member who asks", async () => {
    const res = await call(DELETE, { method: "DELETE", body: { token: TOKEN } });
    expect(res.status).toBe(200);
    expect(removeDevice).toHaveBeenCalledWith({ userId: "user-1", token: TOKEN });
  });

  it("has the same guards: another site, no sign-in", async () => {
    expect((await call(DELETE, { method: "DELETE", origin: "https://evil.example" })).status).toBe(403);
    getAuthUser.mockResolvedValue(null);
    expect((await call(DELETE, { method: "DELETE" })).status).toBe(401);
    expect(removeDevice).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const env = { APP_SECRET: "s".repeat(40), SUPABASE_SECRET_KEY: "k".repeat(20), NODE_ENV: "production" };
vi.mock("@/lib/env", () => ({ getEnv: () => env, getAppSecret: () => env.APP_SECRET }));
vi.mock("@/lib/env-public", () => ({ publicEnv: { appUrl: "https://unispheres.in" } }));

const user = { current: { id: "owner-1" } };
const allowed = { current: true };
const limit = vi.fn(async () => ({ ok: true }));
const connect = vi.fn(async () => ({ ok: true, email: "owner@gmail.com" }));
vi.mock("@/lib/auth/session", () => ({ getAuthUser: async () => user.current }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: async () => ({ data: allowed.current }) }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a) => limit(...a) }));
vi.mock("@/lib/services/academy-google", () => ({
  googleAuthUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  connectWithCode: (...a) => connect(...a),
}));

const { sealSecret } = await import("@/lib/security/secret-box");
const start = await import("@/app/api/academy/google/connect/route");
const back = await import("@/app/api/academy/google/callback/route");
const { STATE_COOKIE } = await import("@/lib/academy/google-event");

const word = (res) => new URL(res.headers.get("location")).searchParams.get("google");
const cookieFor = (over = {}) => sealSecret(JSON.stringify({ s: "STATE", u: "owner-1", e: Date.now() + 60_000, ...over }), "academy-google-state");
// NextRequest-like cookies accessor for the route
const withCookies = (req) => Object.assign(req, { cookies: { get: (n) => { const m = new RegExp(`${n}=([^;]+)`).exec(req.headers.get("cookie") ?? ""); return m ? { value: m[1] } : undefined; } } });
const call = (qs, cookie) => back.GET(withCookies(new Request(`https://unispheres.in/api/academy/google/callback${qs}`, { headers: cookie ? { cookie: `${STATE_COOKIE}=${cookie}` } : {} })));

beforeEach(() => {
  user.current = { id: "owner-1" };
  allowed.current = true;
  limit.mockResolvedValue({ ok: true });
  connect.mockClear();
});

describe("/api/academy/google/connect", () => {
  it("sends only a person who may change Academy settings to Google, with a state that is also sealed in their cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await start.GET();
    vi.unstubAllEnvs();
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location"));
    expect(to.host).toBe("accounts.google.com");
    const state = to.searchParams.get("state");
    expect(state.length).toBeGreaterThanOrEqual(30);
    const set = res.headers.get("set-cookie");
    expect(set).toContain(`${STATE_COOKIE}=`);
    expect(set.toLowerCase()).toContain("httponly");
    expect(set.toLowerCase()).toContain("secure");
    expect(set.toLowerCase()).toContain("samesite=lax");
    expect(set).not.toContain(state);   // sealed, not readable
  });
  it("turns away someone without permission, and signed-out visitors go to sign in", async () => {
    allowed.current = false;
    expect(word(await start.GET())).toBe("denied");
    user.current = null;
    expect(new URL((await start.GET()).headers.get("location")).pathname).toBe("/login");
  });
  it("slows down repeated attempts", async () => {
    limit.mockResolvedValueOnce({ ok: false });
    expect(word(await start.GET())).toBe("slow_down");
  });
});

describe("/api/academy/google/callback", () => {
  it("connects when Google echoes the state this browser holds", async () => {
    const res = await call("?code=abc&state=STATE", cookieFor());
    expect(word(res)).toBe("connected");
    expect(connect).toHaveBeenCalledWith("abc", "owner-1");
    expect(res.headers.get("set-cookie")).toContain(`${STATE_COOKIE}=;`);   // the one-time cookie is cleared
  });
  it("refuses a return whose state does not match, has no cookie, is for somebody else, or is old", async () => {
    for (const [qs, cookie] of [
      ["?code=abc&state=OTHER", cookieFor()],
      ["?code=abc&state=STATE", null],
      ["?code=abc&state=STATE", cookieFor({ u: "someone-else" })],
      ["?code=abc&state=STATE", cookieFor({ e: Date.now() - 1 })],
      ["?code=abc&state=STATE", "not-a-sealed-cookie"],
      ["?code=abc", cookieFor()],
      ["?state=STATE", cookieFor()],
    ]) {
      expect(word(await call(qs, cookie)), qs).toBe("invalid");
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it("re-checks permission, and passes on how a failed connection failed without echoing Google's text", async () => {
    allowed.current = false;
    expect(word(await call("?code=abc&state=STATE", cookieFor()))).toBe("denied");
    allowed.current = true;
    connect.mockResolvedValueOnce({ ok: false, reason: "no_refresh_token" });
    expect(word(await call("?code=abc&state=STATE", cookieFor()))).toBe("no_refresh_token");
    expect(word(await call("?error=access_denied&state=STATE", cookieFor()))).toBe("cancelled");
  });
});

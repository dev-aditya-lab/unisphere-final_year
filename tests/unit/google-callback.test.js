import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.fn();
const signOut = vi.fn(async () => ({}));
const deleteUser = vi.fn(async () => ({}));
const profileRow = { data: { created_at: new Date().toISOString() } };
const settings = { registration_open: true };
const limit = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: (...a) => exchange(...a), signOut: (...a) => signOut(...a) } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => profileRow }) }) }), auth: { admin: { deleteUser: (...a) => deleteUser(...a) } } }),
}));
vi.mock("@/lib/settings", () => ({ getPublicSettings: async () => settings }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: async () => "203.0.113.9", rateLimit: (...a) => limit(...a) }));
const { GET } = await import("@/app/auth/callback/route");

const call = (qs) => GET(new Request(`http://localhost:3000/auth/callback${qs}`));
const where = (res) => res.headers.get("location");

beforeEach(() => {
  exchange.mockReset();
  exchange.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  deleteUser.mockClear();
  signOut.mockClear();
  limit.mockResolvedValue({ ok: true });
  settings.registration_open = true;
  profileRow.data = { created_at: new Date().toISOString() };
});

describe("/auth/callback (Google sign-in)", () => {
  it("exchanges the one-time code for a session and goes to the page asked for", async () => {
    const res = await call("?code=abc&next=%2Facademy%2Fdashboard");
    expect(exchange).toHaveBeenCalledWith("abc");
    expect(where(res)).toBe("/academy/dashboard");
  });

  it("never redirects off the site, whatever `next` says", async () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      const res = await call(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(where(res), next).toMatch(/^\/[^/\\]/);
      expect(where(res), next).not.toContain("evil");
    }
  });

  it("answers one friendly message when Google reports an error, there is no code, or the exchange fails", async () => {
    expect(where(await call("?error=access_denied"))).toBe("/login?error=google_failed");
    expect(where(await call(""))).toBe("/login?error=google_failed");
    exchange.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(where(await call("?code=bad"))).toBe("/login?error=google_failed");
  });

  it("does not let anyone create an account while registration is closed, and removes the one this attempt made", async () => {
    settings.registration_open = false;
    const res = await call("?code=abc");
    expect(where(res)).toBe("/login?error=registration_closed");
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalled();
  });

  it("still lets an existing member sign in while registration is closed", async () => {
    settings.registration_open = false;
    profileRow.data = { created_at: new Date(Date.now() - 86_400_000).toISOString() };
    const res = await call("?code=abc&next=%2Ffeed");
    expect(where(res)).toBe("/feed");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("slows down an address that keeps calling it", async () => {
    limit.mockResolvedValueOnce({ ok: false });
    const res = await call("?code=abc");
    expect(where(res)).toBe("/login?error=google_failed");
    expect(exchange).not.toHaveBeenCalled();
  });
});

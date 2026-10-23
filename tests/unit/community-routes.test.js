import { beforeEach, describe, expect, it, vi } from "vitest";

// The community HTTP endpoints. Everything behind them is mocked: what is under test is the gate each one puts in front of the
// database (session, same-origin, feature switch, input shape, rate limit), because those decide what ever reaches an RPC.
const session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
const flags = { communities: true };
const limited = { value: null };
const send = vi.fn(async () => ({ ok: true, message: { id: "m" }, replayed: false }));
const markRead = vi.fn(async () => ({ ok: true }));
const edit = vi.fn(async () => ({ ok: true, message: { id: "m" } }));
const del = vi.fn(async () => ({ ok: true, data: { status: "deleted" } }));
const search = vi.fn(async () => ({ ok: true, results: [], people: {} }));
const page = vi.fn(async () => ({ items: [], hasMore: false, people: {}, refs: {} }));
const channel = vi.fn(async () => ({ id: "c", postState: "ok" }));

vi.mock("@/lib/auth/session", () => ({ getAuthUser: async () => session.user, AuthUnavailableError: class extends Error {} }));
vi.mock("@/lib/settings", () => ({ isFlagEnabled: async (key) => flags[key] !== false }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => limited.value }));
vi.mock("@/lib/security/origin", () => ({ isSameOrigin: (req) => new URL(req.headers.get("origin") ?? "http://evil.example").host === "app.example" }));
vi.mock("@/lib/services/community-workspace", () => ({
  sendMessage: (...a) => send(...a), markRead: (...a) => markRead(...a), editMessage: (...a) => edit(...a), deleteMessage: (...a) => del(...a),
  searchMessages: (...a) => search(...a), getChannelPage: (...a) => page(...a), getChannel: (...a) => channel(...a), pinMessage: async () => ({ ok: true }),
  getPinned: async () => ({ items: [], people: {} }), loadPeople: async () => ({}),
}));

const messages = await import("@/app/api/community-channels/[channelId]/messages/route.js");
const read = await import("@/app/api/community-channels/[channelId]/read/route.js");
const one = await import("@/app/api/community-messages/[messageId]/route.js");
const searchRoute = await import("@/app/api/communities/[communityId]/search/route.js");

const CH = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const params = (o) => ({ params: Promise.resolve(o) });
const write = (url, method, body, headers = {}) =>
  new Request(`https://app.example${url}`, { method, headers: { "content-type": "application/json", origin: "https://app.example", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const good = { body: "hello", fileIds: [], clientOpId: "44444444-4444-4444-8444-444444444444" };

beforeEach(() => {
  session.user = { id: "11111111-1111-4111-8111-111111111111" };
  flags.communities = true;
  limited.value = null;
  for (const f of [send, markRead, edit, del, search, page, channel]) f.mockClear();
});

describe("who may call", () => {
  it("answers 401 without a session, and never reaches the service", async () => {
    session.user = null;
    expect((await messages.GET(new Request("https://app.example/x"), params({ channelId: CH }))).status).toBe(401);
    expect((await messages.POST(write("/x", "POST", good), params({ channelId: CH }))).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();
  });

  it("refuses a write from another origin (cookie-based CSRF), but allows a read", async () => {
    const cross = write("/x", "POST", good, { origin: "https://evil.example" });
    expect((await messages.POST(cross, params({ channelId: CH }))).status).toBe(403);
    expect((await one.DELETE(write("/x", "DELETE", {}, { origin: "https://evil.example" }), params({ messageId: MSG }))).status).toBe(403);
    expect((await read.POST(write("/x", "POST", {}, { origin: "https://evil.example" }), params({ channelId: CH }))).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect((await messages.GET(new Request("https://app.example/x"), params({ channelId: CH }))).status).toBe(200);
  });

  it("is switched off with the communities feature flag", async () => {
    flags.communities = false;
    expect((await messages.POST(write("/x", "POST", good), params({ channelId: CH }))).status).toBe(403);
    expect((await searchRoute.GET(new Request("https://app.example/x?q=hello"), params({ communityId: CH }))).status).toBe(403);
  });
});

describe("what is accepted", () => {
  it("treats a malformed id as not found, not as an error", async () => {
    expect((await messages.GET(new Request("https://app.example/x"), params({ channelId: "../etc" }))).status).toBe(404);
    expect((await one.PATCH(write("/x", "PATCH", { body: "a" }), params({ messageId: "nope" }))).status).toBe(404);
    expect(page).not.toHaveBeenCalled();
  });

  it("refuses malformed, oversized or incomplete messages before any database call", async () => {
    const bad = [{}, { ...good, body: "x".repeat(4001) }, { ...good, fileIds: Array.from({ length: 6 }, () => CH) }, { ...good, clientOpId: "not-a-uuid" }, { ...good, body: "   " }];
    for (const body of bad) expect((await messages.POST(write("/x", "POST", body), params({ channelId: CH }))).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    const notJson = new Request("https://app.example/x", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.example" }, body: "{oops" });
    expect((await messages.POST(notJson, params({ channelId: CH }))).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a request that declares a huge body", async () => {
    const big = write("/x", "POST", good, { "content-length": String(10 * 1024 * 1024) });
    expect((await messages.POST(big, params({ channelId: CH }))).status).toBe(400);
  });

  it("sends a valid message with the idempotency key and the session's own identity only", async () => {
    const res = await messages.POST(write("/x", "POST", { ...good, authorId: "someone-else", role: "owner" }), params({ channelId: CH }));
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledWith({ channelId: CH, body: "hello", fileIds: [], replyTo: undefined, clientOpId: good.clientOpId });
    expect(JSON.stringify(send.mock.calls[0])).not.toMatch(/someone-else|owner/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("validates cursors and clamps the page size", async () => {
    expect((await messages.GET(new Request("https://app.example/x?beforeTs=bad&beforeId=nope"), params({ channelId: CH }))).status).toBe(400);
    expect((await messages.GET(new Request(`https://app.example/x?beforeTs=2026-01-01T00:00:00.000Z&beforeId=${MSG}&afterTs=2026-01-01T00:00:00.000Z&afterId=${MSG}`), params({ channelId: CH }))).status).toBe(400);
    await messages.GET(new Request("https://app.example/x?limit=100000"), params({ channelId: CH }));
    expect(page.mock.calls.at(-1)[1].limit).toBe(100);
  });

  it("answers 404, like a missing channel, when the service cannot see it", async () => {
    channel.mockResolvedValueOnce(null);
    expect((await messages.GET(new Request("https://app.example/x"), params({ channelId: CH }))).status).toBe(404);
  });
});

describe("limits", () => {
  it("applies the rate limit to edits and answers 429 with Retry-After", async () => {
    limited.value = { ok: false, error: "Too many attempts." };
    const res = await one.PATCH(write("/x", "PATCH", { body: "a" }), params({ messageId: MSG }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(edit).not.toHaveBeenCalled();
  });

  it("requires at least two characters to search and rejects a bad channel filter", async () => {
    expect((await searchRoute.GET(new Request("https://app.example/x?q=a"), params({ communityId: CH }))).status).toBe(400);
    expect((await searchRoute.GET(new Request("https://app.example/x?q=hello&channel=zzz"), params({ communityId: CH }))).status).toBe(400);
    expect((await searchRoute.GET(new Request("https://app.example/x?q=hello"), params({ communityId: CH }))).status).toBe(200);
    expect(search.mock.calls.at(-1)[1]).toBe("hello");
  });
});

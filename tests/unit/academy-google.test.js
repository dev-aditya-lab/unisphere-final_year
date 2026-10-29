import { beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  APP_SECRET: "s".repeat(40), SUPABASE_SECRET_KEY: "k".repeat(20), NODE_ENV: "production",
  GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "csecret",
};
vi.mock("@/lib/env", () => ({ getEnv: () => env, getAppSecret: () => env.APP_SECRET }));
vi.mock("@/lib/env-public", () => ({ publicEnv: { appUrl: "https://unispheres.in" } }));

// ── a tiny fake of the Supabase admin client, recording what the service asks for ──
const db = { session: null, google: null, people: [], connection: null, calls: [], updated: [] };
const rpc = vi.fn(async (name, args) => {
  db.calls.push([name, args]);
  if (name === "academy_google_get") return { data: db.connection ? [db.connection] : [], error: null };
  if (name === "_academy_session_attendees") return { data: db.people.map((email) => ({ email })), error: null };
  return { data: null, error: null };
});
const table = (name) => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: name === "academy_live_sessions" ? db.session : db.google }), single: async () => ({ data: { id: "c1", code: "USA-WD-001", title: "Web Dev" } }) }) }),
  update: (patch) => ({ eq: () => ({ eq: () => ({ lte: () => ({ select: async () => { db.updated.push(patch); return { data: [{ session_id: "s1" }] }; } }) }) }) }),
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: (...a) => rpc(...a), from: (n) => table(n) }) }));

const getToken = vi.fn();
const getAccessToken = vi.fn(async () => ({ token: "access-1" }));
const setCredentials = vi.fn();
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    generateAuthUrl(o) { return `https://accounts.google.com/o/oauth2/v2/auth?state=${o.state}&scope=${encodeURIComponent(o.scope.join(" "))}&access_type=${o.access_type}`; }
    getToken(...a) { return getToken(...a); }
    setCredentials(...a) { return setCredentials(...a); }
    getAccessToken() { return getAccessToken(); }
    verifyIdToken() { return { getPayload: () => ({ email: "owner@gmail.com", email_verified: true }) }; }
    revokeToken() { return Promise.resolve(); }
  },
}));

const { sealSecret, openSecret } = await import("@/lib/security/secret-box");
const { buildEvent, classifyGoogleError, meetLinkOf, MAX_GUESTS } = await import("@/lib/academy/google-event");
const svc = await import("@/lib/services/academy-google");

const session = { id: "11111111-1111-4111-8111-111111111111", title: "Week 1 live", description: "Intro", starts_at: "2030-01-10T13:30:00Z", ends_at: "2030-01-10T15:00:00Z", timezone: "Asia/Kolkata", course_id: "c1", cohort_id: null, status: "scheduled", auto_meet: true };
const course = { id: "22222222-2222-4222-8222-222222222222", code: "USA-WD-001", title: "Web Dev" };

describe("secret box", () => {
  it("opens what it sealed, and nothing else", () => {
    const sealed = sealSecret("refresh-token-123", "purpose-a");
    expect(sealed).not.toContain("refresh-token-123");
    expect(openSecret(sealed, "purpose-a")).toBe("refresh-token-123");
    expect(openSecret(sealed, "purpose-b")).toBeNull();            // another purpose cannot open it
    expect(openSecret(sealed.slice(0, -2) + "xx", "purpose-a")).toBeNull();  // any change is detected
    expect(openSecret("garbage", "purpose-a")).toBeNull();
    expect(openSecret(undefined, "purpose-a")).toBeNull();
    expect(sealSecret("x", "purpose-a")).not.toBe(sealSecret("x", "purpose-a")); // fresh nonce each time
  });
});

describe("the Calendar event", () => {
  it("keeps students private from each other and from changing the class", () => {
    const e = buildEvent({ session, course, emails: ["a@x.com", "b@x.com"], appUrl: "https://unispheres.in" });
    expect(e.guestsCanSeeOtherGuests).toBe(false);
    expect(e.guestsCanInviteOthers).toBe(false);
    expect(e.guestsCanModify).toBe(false);
    expect(e.attendees).toEqual([{ email: "a@x.com" }, { email: "b@x.com" }]);
    expect(e.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
    expect(e.start).toEqual({ dateTime: "2030-01-10T13:30:00.000Z", timeZone: "Asia/Kolkata" });
    expect(e.extendedProperties.private.unisphereSession).toBe(session.id);
  });
  it("leaves the conference alone when only updating, and never sends more than Google allows", () => {
    expect(buildEvent({ session, course, emails: [], appUrl: "https://x.y", createMeet: false }).conferenceData).toBeUndefined();
    const many = Array.from({ length: 250 }, (_, i) => `s${i}@x.com`);
    expect(buildEvent({ session, course, emails: many, appUrl: "https://x.y" }).attendees).toHaveLength(MAX_GUESTS);
  });
  it("strips control characters from text it sends", () => {
    const e = buildEvent({ session: { ...session, title: "Hi\u0007 there" }, course, emails: [], appUrl: "https://x.y" });
    expect(e.summary).not.toMatch(/\u0007/);
  });
  it("keeps only a real Meet address", () => {
    expect(meetLinkOf({ hangoutLink: "https://meet.google.com/abc-defg-hij" })).toBe("https://meet.google.com/abc-defg-hij");
    expect(meetLinkOf({ hangoutLink: "https://evil.example/abc-defg-hij" })).toBeNull();
    expect(meetLinkOf({ hangoutLink: "javascript:alert(1)" })).toBeNull();
    expect(meetLinkOf({ conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }] } })).toBe("https://meet.google.com/abc-defg-hij");
    expect(meetLinkOf(null)).toBeNull();
  });
  it("explains errors to the administrator and says which are worth retrying", () => {
    expect(classifyGoogleError(400, { error: "invalid_grant" })).toMatchObject({ code: "needs_reconnect", permanent: true });
    expect(classifyGoogleError(403, { error: { errors: [{ reason: "rateLimitExceeded" }] } })).toMatchObject({ permanent: false });
    expect(classifyGoogleError(403, { error: { errors: [{ reason: "forbidden" }] } })).toMatchObject({ permanent: true });
    expect(classifyGoogleError(503, null)).toMatchObject({ permanent: false });
  });
});

describe("connecting Google", () => {
  it("asks for calendar events only, offline, and never for mail or files", () => {
    const url = svc.googleAuthUrl("STATE123");
    expect(url).toContain("state=STATE123");
    expect(url).toContain("access_type=offline");
    expect(decodeURIComponent(url)).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(decodeURIComponent(url)).not.toMatch(/gmail|drive|contacts/);
  });
  it("redirects back to the Academy callback on this site", () => {
    expect(svc.googleRedirectUri()).toBe("https://unispheres.in/api/academy/google/callback");
  });
  it("stores the refresh token sealed, never in the clear", async () => {
    rpc.mockClear();
    getToken.mockResolvedValueOnce({ tokens: { refresh_token: "r-secret", scope: "openid email https://www.googleapis.com/auth/calendar.events", id_token: "t" } });
    const res = await svc.connectWithCode("code", "user-1");
    expect(res).toEqual({ ok: true, email: "owner@gmail.com" });
    const save = rpc.mock.calls.find(([n]) => n === "academy_google_save")[1];
    expect(save.p_enc).not.toContain("r-secret");
    expect(openSecret(save.p_enc, "academy-google-refresh-token")).toBe("r-secret");
  });
  it("refuses a connection without lasting access or without the calendar permission", async () => {
    getToken.mockResolvedValueOnce({ tokens: { scope: "openid email https://www.googleapis.com/auth/calendar.events", id_token: "t" } });
    expect(await svc.connectWithCode("c", "u")).toEqual({ ok: false, reason: "no_refresh_token" });
    getToken.mockResolvedValueOnce({ tokens: { refresh_token: "r", scope: "openid email", id_token: "t" } });
    expect(await svc.connectWithCode("c", "u")).toEqual({ ok: false, reason: "missing_scope" });
    getToken.mockRejectedValueOnce(new Error("bad code"));
    expect(await svc.connectWithCode("c", "u")).toEqual({ ok: false, reason: "exchange_failed" });
  });
});

describe("syncing one live class", () => {
  const calls = [];
  const googleFetch = (handler) => {
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = new URL(String(url));
      calls.push({ method: init?.method ?? "GET", path: u.pathname.replace("/calendar/v3/calendars/primary/events", "") || "/", query: Object.fromEntries(u.searchParams), body: init?.body ? JSON.parse(init.body) : null, auth: init?.headers?.Authorization });
      const r = handler(init?.method ?? "GET", u);
      return new Response(r.body === null ? null : JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
    });
  };
  const failed = () => rpc.mock.calls.filter(([n]) => n === "academy_google_fail").map(([, a]) => a);
  const done = () => rpc.mock.calls.filter(([n]) => n === "academy_google_done").map(([, a]) => a);

  beforeEach(() => {
    calls.length = 0;
    rpc.mockClear();
    db.session = { ...session };
    db.google = { event_id: null };
    db.people = ["a@x.com", "b@x.com"];
    db.connection = { email: "owner@gmail.com", refresh_token_enc: sealSecret("r-secret", "academy-google-refresh-token"), status: "connected" };
    getAccessToken.mockResolvedValue({ token: "access-1" });
  });

  it("creates the event with a Meet, invites the enrolled students, and records the link", async () => {
    googleFetch((m) => (m === "GET" ? { body: { items: [] } } : { body: { id: "ev1", hangoutLink: "https://meet.google.com/abc-defg-hij" } }));
    const res = await svc.syncLiveSession(session.id);
    expect(res).toMatchObject({ ok: true, invited: 2, meet: true });
    const post = calls.find((c) => c.method === "POST");
    expect(post.query).toMatchObject({ conferenceDataVersion: "1", sendUpdates: "all" });
    expect(post.auth).toBe("Bearer access-1");
    expect(post.body.attendees).toHaveLength(2);
    expect(done()[0]).toMatchObject({ p_event: "ev1", p_url: "https://meet.google.com/abc-defg-hij", p_emails: ["a@x.com", "b@x.com"] });
  });

  it("does not make a second event when an earlier try already created one", async () => {
    googleFetch((m) => (m === "GET" ? { body: { items: [{ id: "ev-old", hangoutLink: "https://meet.google.com/abc-defg-hij" }] } } : { body: { id: "ev-old", hangoutLink: "https://meet.google.com/abc-defg-hij" } }));
    await svc.syncLiveSession(session.id);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(done()[0].p_event).toBe("ev-old");
  });

  it("updates the existing event instead of creating another when the list or time changed", async () => {
    db.google = { event_id: "ev1" };
    googleFetch(() => ({ body: { id: "ev1", hangoutLink: "https://meet.google.com/abc-defg-hij" } }));
    await svc.syncLiveSession(session.id);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch.path).toBe("/ev1");
    expect(patch.body.conferenceData).toBeUndefined();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("removes the event when the class is cancelled", async () => {
    db.session = { ...session, status: "cancelled" };
    db.google = { event_id: "ev1" };
    googleFetch(() => ({ status: 204, body: null }));
    await svc.syncLiveSession(session.id);
    expect(calls[0]).toMatchObject({ method: "DELETE", path: "/ev1", query: { sendUpdates: "all" } });
    expect(rpc.mock.calls.some(([n]) => n === "academy_google_cleared")).toBe(true);
  });

  it("stops with a clear message when Google is not connected", async () => {
    db.connection = null;
    googleFetch(() => ({ body: {} }));
    const res = await svc.syncLiveSession(session.id);
    expect(res.ok).toBe(false);
    expect(failed()[0]).toMatchObject({ p_permanent: true });
    expect(failed()[0].p_error).toMatch(/not connected/i);
    expect(calls).toHaveLength(0);
  });

  it("marks the connection for reconnecting when Google revokes it", async () => {
    getAccessToken.mockRejectedValueOnce({ response: { data: { error: "invalid_grant" } } });
    googleFetch(() => ({ body: {} }));
    await svc.syncLiveSession(session.id);
    expect(rpc.mock.calls.some(([n, a]) => n === "academy_google_mark" && a.p_status === "needs_reconnect")).toBe(true);
    expect(failed()[0].p_permanent).toBe(true);
  });

  it("will not invite more students than Google allows on one event", async () => {
    db.people = Array.from({ length: 201 }, (_, i) => `s${i}@x.com`);
    googleFetch(() => ({ body: {} }));
    await svc.syncLiveSession(session.id);
    expect(failed()[0]).toMatchObject({ p_permanent: true });
    expect(failed()[0].p_error).toMatch(/200/);
    expect(calls).toHaveLength(0);
  });

  it("treats a Google outage as something to retry", async () => {
    googleFetch((m) => (m === "GET" ? { body: { items: [] } } : { status: 503, body: { error: { message: "backend" } } }));
    const res = await svc.syncLiveSession(session.id);
    expect(res.ok).toBe(false);
    expect(failed()[0].p_permanent).toBe(false);
  });

  it("does nothing for a session it cannot take the lease on", async () => {
    // Without `leased`, the service first tries to take the lease; the fake grants it. With `leased: true` it must not try.
    googleFetch((m) => (m === "GET" ? { body: { items: [] } } : { body: { id: "ev1", hangoutLink: "https://meet.google.com/abc-defg-hij" } }));
    db.updated.length = 0;
    await svc.syncLiveSession(session.id, { leased: true });
    expect(db.updated).toHaveLength(0);
  });
});

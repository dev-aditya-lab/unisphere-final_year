import "server-only";
import { OAuth2Client } from "google-auth-library";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { publicEnv } from "@/lib/env-public";
import { openSecret, sealSecret } from "@/lib/security/secret-box";
import { CALENDAR_SCOPE, GOOGLE_SCOPES, MAX_GUESTS, buildEvent, classifyGoogleError, meetLinkOf } from "@/lib/academy/google-event";

/**
 * Live classes on Google Calendar and Google Meet, with the Academy owner's own Google account.
 *
 *   - Google's `google-auth-library` does the OAuth work (consent URL, code exchange, ID-token check, refreshing access tokens).
 *     Calendar itself is three plain REST calls, so no large SDK is added.
 *   - The refresh token is sealed with AES-256-GCM before it is stored (lib/security/secret-box.js). Only this file ever opens it.
 *   - Everything here runs on the server with the service role, after the caller's permission was checked by the route or action.
 *   - Google sends the invitations. Invited people join the Meet directly; anyone else has to ask to be let in.
 */
const PURPOSE = "academy-google-refresh-token";
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TIMEOUT_MS = 15_000;

/** The Calendar client can be the same Google OAuth client sign-in uses (add one more redirect address to it) or its own. */
export function googleCredentials() {
  const e = getEnv();
  const clientId = e.GOOGLE_CALENDAR_CLIENT_ID || e.GOOGLE_CLIENT_ID;
  const clientSecret = e.GOOGLE_CALENDAR_CLIENT_SECRET || e.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleRedirectUri = () => `${publicEnv.appUrl}/api/academy/google/callback`;

function oauthClient() {
  const c = googleCredentials();
  return c ? new OAuth2Client({ clientId: c.clientId, clientSecret: c.clientSecret, redirectUri: googleRedirectUri() }) : null;
}

/** The address to send the owner to. `offline` + `consent` make Google return a refresh token every time. */
export function googleAuthUrl(state) {
  const client = oauthClient();
  if (!client) return null;
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES, state, include_granted_scopes: false });
}

/** The owner came back from Google with a code. Stores the (sealed) connection, or says why not. */
export async function connectWithCode(code, userId) {
  const client = oauthClient();
  if (!client) return { ok: false, reason: "not_configured" };
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }
  if (!tokens.refresh_token) return { ok: false, reason: "no_refresh_token" };
  if (!String(tokens.scope ?? "").split(" ").includes(CALENDAR_SCOPE)) return { ok: false, reason: "missing_scope" };
  let email;
  try {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: googleCredentials().clientId });
    const payload = ticket.getPayload();
    if (payload?.email_verified) email = payload.email;
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }
  if (!email) return { ok: false, reason: "exchange_failed" };
  const { error } = await createAdminClient().rpc("academy_google_save", { p_email: email, p_enc: sealSecret(tokens.refresh_token, PURPOSE), p_scopes: tokens.scope, p_by: userId });
  if (error) return { ok: false, reason: "save_failed" };
  return { ok: true, email };
}

/** Disconnects: tells Google to forget the token (best effort) and deletes ours. Events already created stay on the calendar. */
export async function disconnectGoogle(userId) {
  const admin = createAdminClient();
  const { data } = await admin.rpc("academy_google_get");
  const row = data?.[0];
  const token = row ? openSecret(row.refresh_token_enc, PURPOSE) : null;
  if (token) await oauthClient()?.revokeToken(token).catch(() => {});
  const { error } = await admin.rpc("academy_google_clear", { p_by: userId });
  return !error;
}

// ── Talking to Calendar ────────────────────────────────────────────────────

/** An access token for the connected account, or { error } with a message fit to show an administrator. */
async function accessToken() {
  const client = oauthClient();
  if (!client) return { error: "Google is not set up on this server.", permanent: true };
  const admin = createAdminClient();
  const { data } = await admin.rpc("academy_google_get");
  const row = data?.[0];
  if (!row) return { error: "Google is not connected. Connect it in Academy settings.", permanent: true };
  if (row.status !== "connected") return { error: "Google needs to be reconnected in Academy settings.", permanent: true };
  const refresh = openSecret(row.refresh_token_enc, PURPOSE);
  if (!refresh) {
    await admin.rpc("academy_google_mark", { p_status: "needs_reconnect", p_error: "The saved connection could not be read. Reconnect Google." });
    return { error: "The saved Google connection could not be read. Reconnect Google in Academy settings.", permanent: true };
  }
  client.setCredentials({ refresh_token: refresh });
  try {
    const { token } = await client.getAccessToken();
    if (token) return { token };
    return { error: "Google did not give an access token.", permanent: false };
  } catch (err) {
    if (JSON.stringify(err?.response?.data ?? err?.message ?? "").includes("invalid_grant")) {
      await admin.rpc("academy_google_mark", { p_status: "needs_reconnect", p_error: "Google no longer accepts the connection." });
      return { error: "Google no longer accepts the connection. Reconnect Google in Academy settings.", permanent: true };
    }
    return { error: "Could not reach Google. It will try again.", permanent: false };
  }
}

async function calendar(token, method, path, { query = {}, body } = {}) {
  const url = new URL(`${EVENTS}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Google may answer a create before the Meet link is ready; look again a few times. */
async function waitForMeet(token, event) {
  let link = meetLinkOf(event);
  for (let i = 0; i < 3 && !link; i++) {
    await sleep(1000);
    const again = await calendar(token, "GET", `/${event.id}`, { query: { conferenceDataVersion: "1" } });
    if (again.ok) link = meetLinkOf(again.data);
  }
  return link;
}

// ── Syncing one session ────────────────────────────────────────────────────

/**
 * Brings Google in line with one session: creates the event (with a Meet link) when the class asks for it, updates it when the time,
 * title or list of enrolled students changed, removes it when the class is cancelled or no longer asks for it. Never throws; the
 * outcome is written to academy_live_google, where administrators see it.
 */
export async function syncLiveSession(sessionId, { leased = false } = {}) {
  const admin = createAdminClient();
  if (!leased) {
    // Take the lease so the background worker and the page that just saved do not do the same session twice.
    const { data: took } = await admin
      .from("academy_live_google").update({ next_try: new Date(Date.now() + 5 * 60_000).toISOString() })
      .eq("session_id", sessionId).eq("sync", "pending").lte("next_try", new Date().toISOString()).select("session_id");
    if (!took?.length) return { skipped: true };
  }
  const fail = async (message, permanent = false) => {
    await admin.rpc("academy_google_fail", { p_session: sessionId, p_error: message, p_permanent: permanent });
    return { ok: false, error: message };
  };

  const [{ data: s }, { data: g }] = await Promise.all([
    admin.from("academy_live_sessions").select("id, course_id, cohort_id, title, description, starts_at, ends_at, timezone, status, auto_meet").eq("id", sessionId).maybeSingle(),
    admin.from("academy_live_google").select("event_id").eq("session_id", sessionId).maybeSingle(),
  ]);
  if (!s) return { skipped: true };
  const wanted = s.auto_meet && (s.status === "scheduled" || s.status === "live");
  const finished = s.status === "completed";
  if (finished && !wanted) {
    await admin.rpc("academy_google_done", { p_session: sessionId, p_event: g?.event_id ?? null, p_url: null, p_emails: [] });
    return { ok: true };
  }
  if (!wanted && !g?.event_id) {
    await admin.rpc("academy_google_cleared", { p_session: sessionId });
    return { ok: true };
  }

  const auth = await accessToken();
  if (auth.error) return fail(auth.error, auth.permanent);
  const token = auth.token;

  if (!wanted) {
    const del = await calendar(token, "DELETE", `/${g.event_id}`, { query: { sendUpdates: "all" } });
    if (!del.ok && del.status !== 404 && del.status !== 410) {
      const c = classifyGoogleError(del.status, del.data);
      return fail(c.message, c.permanent);
    }
    await admin.rpc("academy_google_cleared", { p_session: sessionId });
    return { ok: true, removed: true };
  }

  if (new Date(s.ends_at).getTime() < Date.now() && !g?.event_id) {
    await admin.rpc("academy_google_cleared", { p_session: sessionId });
    return { ok: true };
  }

  const [{ data: course }, { data: people }] = await Promise.all([
    admin.from("academy_courses").select("id, code, title").eq("id", s.course_id).single(),
    admin.rpc("_academy_session_attendees", { p_session: sessionId }),
  ]);
  const emails = (people ?? []).map((p) => p.email);
  if (emails.length > MAX_GUESTS) return fail(`More than ${MAX_GUESTS} students are enrolled. Google allows ${MAX_GUESTS} guests on one event; split the class by cohort.`, true);

  const body = (createMeet) => buildEvent({ session: s, course, emails, appUrl: publicEnv.appUrl, createMeet, requestId: s.id });
  let eventId = g?.event_id ?? null;
  let event = null;

  if (eventId) {
    const patch = await calendar(token, "PATCH", `/${eventId}`, { query: { sendUpdates: "all" }, body: body(false) });
    if (patch.ok) event = patch.data;
    else if (patch.status === 404 || patch.status === 410) eventId = null;      // deleted on Google by hand: make a new one
    else {
      const c = classifyGoogleError(patch.status, patch.data);
      return fail(c.message, c.permanent);
    }
  }
  if (!eventId) {
    // A previous try may have created the event and then been interrupted before it was recorded: look for it first.
    const found = await calendar(token, "GET", "", { query: { privateExtendedProperty: `unisphereSession=${s.id}`, maxResults: "1", showDeleted: "false" } });
    const existing = found.ok ? found.data?.items?.[0] : null;
    if (existing?.id) {
      const patch = await calendar(token, "PATCH", `/${existing.id}`, { query: { sendUpdates: "all", conferenceDataVersion: "1" }, body: body(false) });
      event = patch.ok ? patch.data : existing;
    } else {
      const created = await calendar(token, "POST", "", { query: { conferenceDataVersion: "1", sendUpdates: "all" }, body: body(true) });
      if (!created.ok) {
        const c = classifyGoogleError(created.status, created.data);
        return fail(c.message, c.permanent);
      }
      event = created.data;
    }
    eventId = event.id;
  }

  const url = await waitForMeet(token, event);
  await admin.rpc("academy_google_done", { p_session: sessionId, p_event: eventId, p_url: url, p_emails: emails });
  return { ok: true, invited: emails.length, meet: Boolean(url) };
}

/** The background worker (called from the cron tick). */
export async function processGoogleSync({ limit = 10 } = {}) {
  const stats = { claimed: 0, ok: 0, failed: 0, removed: 0 };
  if (!googleCredentials()) return stats;
  const admin = createAdminClient();

  // Events of deleted sessions.
  const { data: tombs } = await admin.rpc("academy_google_tombstones_take", { p_limit: 20 });
  if (tombs?.length) {
    const auth = await accessToken();
    for (const t of tombs) {
      if (auth.error) {
        await admin.from("academy_google_tombstones").upsert({ event_id: t.event_id });
        continue;
      }
      const del = await calendar(auth.token, "DELETE", `/${t.event_id}`, { query: { sendUpdates: "all" } });
      if (del.ok || del.status === 404 || del.status === 410) stats.removed += 1;
      else await admin.from("academy_google_tombstones").upsert({ event_id: t.event_id });
    }
  }

  const { data: due, error } = await admin.rpc("academy_google_claim", { p_limit: limit });
  if (error) {
    console.error("[academy-google] claim failed", error.code);
    return stats;
  }
  stats.claimed = due?.length ?? 0;
  for (const row of due ?? []) {
    const res = await syncLiveSession(row.session_id, { leased: true });
    if (res.ok) stats.ok += 1;
    else if (!res.skipped) stats.failed += 1;
  }
  return stats;
}

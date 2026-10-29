// What a live class looks like on Google Calendar. Pure functions (no network, no secrets) so they can be tested on their own.
import { randomUUID } from "node:crypto";

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
/** The cookie that ties a return from Google to the browser that started the connection. */
export const STATE_COOKIE = "ac_g_state";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** Google allows 200 guests on one event. */
export const MAX_GUESTS = 200;

const clean = (t, max) => String(t ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

/**
 * The body sent to Google. Guests cannot see each other's addresses, invite others or change the event: students are private from
 * one another, and the class belongs to the Academy. Google sends the invitations (`sendUpdates=all` on the request).
 */
export function buildEvent({ session, course, emails, appUrl, createMeet = true, requestId = randomUUID() }) {
  const tz = session.timezone || "Asia/Kolkata";
  const lines = [
    session.description ? clean(session.description, 1000) : null,
    `Course: ${clean(course.title, 120)} (${clean(course.code, 40)})`,
    `Open the course: ${appUrl}/academy/learn/${course.id}`,
    "You were invited because you are enrolled in this course on UniSphere Academy. Please do not forward this invitation.",
  ].filter(Boolean);
  return {
    summary: `${clean(course.title, 80)}: ${clean(session.title, 100)}`.slice(0, 200),
    description: lines.join("\n\n"),
    start: { dateTime: new Date(session.starts_at).toISOString(), timeZone: tz },
    end: { dateTime: new Date(session.ends_at).toISOString(), timeZone: tz },
    attendees: emails.slice(0, MAX_GUESTS).map((email) => ({ email })),
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: false,
    reminders: { useDefault: false, overrides: [{ method: "email", minutes: 60 }, { method: "popup", minutes: 10 }] },
    extendedProperties: { private: { unisphereSession: session.id } },
    ...(createMeet ? { conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
}

/** The Meet address from an event Google returned, or null. Only a google.com Meet address is ever kept. */
export function meetLinkOf(event) {
  const link = event?.hangoutLink ?? event?.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
  return typeof link === "string" && /^https:\/\/meet\.google\.com\/[a-z0-9-]{3,40}$/i.test(link) ? link : null;
}

/** Turns a Google error into a short message for the administrator, and says whether trying again could help. */
export function classifyGoogleError(status, body) {
  const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? body?.error;
  if (body?.error === "invalid_grant" || status === 401) return { code: "needs_reconnect", permanent: true, message: "Google no longer accepts the connection. Reconnect Google in Academy settings." };
  if (status === 403 && /rate|quota/i.test(String(reason))) return { code: "rate", permanent: false, message: "Google is limiting requests right now. It will try again." };
  if (status === 403) return { code: "forbidden", permanent: true, message: "Google refused: the connected account may not create events or Meet links. Reconnect and tick the calendar permission." };
  if (status === 404 || status === 410) return { code: "gone", permanent: false, message: "The event no longer exists on Google." };
  if (status === 429 || status >= 500) return { code: "retry", permanent: false, message: "Google had a temporary problem. It will try again." };
  return { code: "failed", permanent: false, message: `Google answered with an error (${status}).` };
}

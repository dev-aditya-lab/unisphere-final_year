// Client for the messaging endpoints (app/api/messages). Every call resolves, never throws, and says what KIND of
// failure it was, because the outbox treats them differently:
//
//   network    the request did not complete (offline, DNS, reset): the message may or may not have been stored
//   transient  the server answered 5xx/429/408: try again later
//   auth       401: the session is gone
//   notfound   404: the conversation is gone or was never ours
//   permanent  any other 4xx: the server understood and refused (validation, blocked, not allowed)
//
// Responses are never read from the HTTP cache (`cache: "no-store"`): private conversations must come from the
// server's current answer or from this device's own store, nothing in between.

const TIMEOUT_MS = 20_000;

function kindOf(status) {
  if (status === 401) return "auth";
  if (status === 404) return "notfound";
  if (status === 408 || status === 429 || status >= 500) return "transient";
  return "permanent";
}

async function request(fetchImpl, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  init.signal?.addEventListener?.("abort", onAbort);
  try {
    const res = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* a proxy error page or an empty body */
    }
    if (res.ok && body?.ok) return { ok: true, status: res.status, data: body };
    const retryAfter = Number(res.headers?.get?.("Retry-After"));
    return {
      ok: false,
      status: res.status,
      kind: kindOf(res.status),
      code: body?.code ?? null,
      error: body?.error ?? "Something went wrong.",
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
    };
  } catch (error) {
    return { ok: false, status: 0, kind: "network", code: "network", error: "You appear to be offline.", aborted: error?.name === "AbortError" };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener?.("abort", onAbort);
  }
}

function cursorQuery(prefix, cursor) {
  return cursor ? { [`${prefix}Ts`]: cursor.ts, [`${prefix}Id`]: cursor.id } : {};
}

export function createChatApi(fetchImpl = (...args) => fetch(...args)) {
  const q = (params) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null) s.set(k, String(v));
    const text = s.toString();
    return text ? `?${text}` : "";
  };
  return {
    inbox: () => request(fetchImpl, "/api/messages/inbox"),
    /** Header and the newest page (no cursor), older (before) or newer (after) messages. */
    thread: (conversationId, { before = null, after = null, limit = 30, signal } = {}) =>
      request(fetchImpl, `/api/messages/${conversationId}${q({ ...cursorQuery("before", before), ...cursorQuery("after", after), limit })}`, { signal }),
    send: (conversationId, { body, fileIds, clientOpId }, { signal } = {}) =>
      request(fetchImpl, `/api/messages/${conversationId}`, { method: "POST", body: JSON.stringify({ body, fileIds, clientOpId }), signal }),
    markRead: (conversationId) => request(fetchImpl, `/api/messages/${conversationId}/read`, { method: "POST", body: "{}" }),
  };
}

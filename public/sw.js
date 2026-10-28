/* UniSphere service worker.
 *
 * What it does:
 *   - Keeps static assets (build files, icons, fonts, images) so repeat visits start instantly.
 *   - Shows a friendly offline page when a page cannot be loaded.
 *   - Receives Web Push notifications and opens the right page when one is tapped.
 *
 * What it deliberately does NOT do: cache signed-in pages, API responses, Supabase traffic or anything
 * private. Those always come from the network, so nothing personal is ever left in a shared device's
 * cache after logging out.
 */
const VERSION = "v3";
const STATIC_CACHE = `unisphere-static-${VERSION}`;
const SHELL = ["/logo-mark.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png"];
// Next.js dev files are not content-hashed, so on localhost they must never be served from cache.
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>You are offline · UniSphere</title>
<style>
:root{color-scheme:light dark;--bg:#fbf6ec;--fg:#1b1812;--muted:#675f52;--primary:#1b1812;--card:#fffefb;--border:#e4d9c6}
@media (prefers-color-scheme:dark){:root{--bg:#14120f;--fg:#f5efe3;--muted:#b6ad9d;--primary:#f5efe3;--card:#1d1a16;--border:#38322a}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:26rem;text-align:center}img{width:64px;height:64px;border-radius:16px}h1{font-size:1.6rem;margin:18px 0 8px}p{color:var(--muted);margin:0 0 12px}
button{margin-top:10px;background:var(--primary);color:var(--bg);border:0;border-radius:8px;padding:11px 20px;font:600 15px system-ui;cursor:pointer}
button:focus-visible{outline:3px solid var(--primary);outline-offset:3px}.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-top:22px;font-size:14px;text-align:left}
</style></head><body><main>
<img src="/icons/icon-192.png" alt="" width="64" height="64">
<h1>You are offline</h1>
<p>UniSphere could not reach the internet. Check your connection, then try again.</p>
<button type="button" onclick="location.reload()">Try again</button>
<div class="card"><strong>Good to know</strong><br>Posts, messages and notifications load fresh each time, so nothing private is kept on this device while you are offline. Anything you were typing is still in the page you left.</div>
</main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("unisphere-") && k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// The page asks for the new worker to take over when the member taps "Reload" on the update notice.
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") self.skipWaiting();
  // Sent on log out: drop everything except the public static cache.
  if (event.data.type === "CLEAR_USER_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))));
  }
});

const isStaticAsset = (path) => path.startsWith("/_next/static/") || /^\/icons\//.test(path) || /\.(?:png|jpe?g|webp|svg|ico|woff2?)$/i.test(path);

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok && res.type === "basic") cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, R2, fonts CDN: the browser handles those
  const path = url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/") || path === "/sw.js" || path === "/manifest.webmanifest") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () => new Response(OFFLINE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }),
      ),
    );
    return;
  }
  if (LOCAL) return;
  if (path.startsWith("/_next/static/")) event.respondWith(cacheFirst(request));
  else if (isStaticAsset(path)) event.respondWith(staleWhileRevalidate(request));
});

// ── Chat outbox (Background Sync) ──────────────────────────────────────────
// The page keeps unsent messages in its own IndexedDB (database "unisphere-chat:<user id>", store "outbox"). When a
// message is written offline the page asks for a one-off sync; if the browser supports it and the page is closed
// before connectivity returns, this handler sends them with the member's cookies. It is an accelerator, not the
// mechanism: browsers may never fire it (iOS, Firefox), and the open page always flushes its own outbox. Sending
// is idempotent (the same client_op_id), so a message that both paths try is stored once.
// It reads only the outbox and writes only the sent message back; it never touches inbox or draft stores.
const CHAT_DB_PREFIX = "unisphere-chat:";

const idbRequest = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const idbDone = (tx) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });

async function flushChatOutbox() {
  if (!self.indexedDB || !indexedDB.databases) return;
  const names = (await indexedDB.databases()).map((d) => d.name).filter((n) => n && n.startsWith(CHAT_DB_PREFIX));
  let mustRetry = false;
  let changed = false;
  for (const name of names) {
    const db = await idbRequest(indexedDB.open(name)).catch(() => null);
    if (!db) continue;
    try {
      if (!db.objectStoreNames.contains("outbox") || !db.objectStoreNames.contains("messages")) continue;
      const entries = await idbRequest(db.transaction("outbox").objectStore("outbox").getAll());
      entries.sort((a, b) => a.queued_at - b.queued_at);
      for (const entry of entries) {
        if (entry.state === "failed") continue;
        let res;
        try {
          res = await fetch("/api/messages/" + entry.conversation_id, {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ body: entry.body, fileIds: (entry.files || []).map((f) => f.id), clientOpId: entry.client_op_id }),
          });
        } catch {
          mustRetry = true;
          break; // still offline: stop, the browser will try the sync again
        }
        const data = await res.json().catch(() => null);
        const tx = db.transaction(["outbox", "messages"], "readwrite");
        if (res.ok && data && data.ok && data.message) {
          tx.objectStore("outbox").delete(entry.client_op_id);
          tx.objectStore("messages").put(data.message);
          changed = true;
        } else if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) {
          mustRetry = true; // the page deals with a lost session; transient errors are retried later
          tx.abort();
          break;
        } else {
          tx.objectStore("outbox").put({ ...entry, state: "failed", error: (data && data.error) || "This message could not be sent.", error_code: (data && data.code) || null });
          changed = true;
        }
        await idbDone(tx).catch(() => {});
      }
    } finally {
      db.close();
    }
  }
  if (changed) {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach((w) => w.postMessage({ type: "CHAT_OUTBOX_CHANGED" }));
  }
  if (mustRetry) throw new Error("outbox not fully delivered");
}

self.addEventListener("sync", (event) => {
  if (event.tag === "unisphere-outbox") event.waitUntil(flushChatOutbox());
});

// ── Web Push ────────────────────────────────────────────────────────────────
// A browser keeps one push subscription per site, so a push can reach this worker that UniSphere did not send (for
// example one left behind by a third-party script). UniSphere's server marks every payload it sends
// with `from: "unisphere"`, and this worker shows only those, so a third party's message is never presented with
// UniSphere's name, icon and link.
self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (!data || data.from !== "unisphere") return;
  const title = String(data.title || "UniSphere").slice(0, 80);
  event.waitUntil(
    (async () => {
      // The member is looking at the very page this is about (a new message in the open conversation): it is already on their screen.
      // Browsers allow this only while a visible, focused window of the site exists, which is exactly what is checked.
      const path = typeof data.url === "string" ? data.url.split(/[?#]/)[0].replace(/\/+$/, "") : "";
      if (path) {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const here = windows.some((w) => w.visibilityState === "visible" && w.focused && new URL(w.url).pathname.replace(/\/+$/, "") === path);
        if (here) return;
      }
      await self.registration.showNotification(title, {
        body: String(data.body || "").slice(0, 200),
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { from: "unisphere", url: typeof data.url === "string" ? data.url : "/notifications" },
      });
    })(),
  );
});

// Only same-site relative paths are ever opened from a notification.
const safePath = (u) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : "/notifications");

self.addEventListener("notificationclick", (event) => {
  if (!event.notification.data || event.notification.data.from !== "unisphere") return; // not one of ours
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The browser rotated the push endpoint: register the new one for the signed-in member (cookies are sent).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
    })().catch(() => {}),
  );
});

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { isAdPath } from "@/lib/routes";
import { buildCsp } from "@/lib/security/csp";
import { monetag } from "@/lib/monetag";
import { getCookieSections, getPrivacySections } from "@/lib/content/legal";

describe("where the advertising-network tag may run", () => {
  it("is limited to the four explanatory pages", () => {
    for (const p of ["/", "/about", "/features", "/faq", "/about/", "/faq?x=1"]) expect(isAdPath(p), p).toBe(true);
    for (const p of ["/privacy", "/terms", "/cookies", "/contact", "/guidelines", "/login", "/register", "/feed", "/messages", "/admin", "/u/someone", "/settings/profile", "/api/health"]) {
      expect(isAdPath(p), p).toBe(false);
    }
  });

  it("is configured with the issued zone and an https origin", () => {
    expect(monetag.tagUrl).toBe("https://quge5.com/88/tag.min.js");
    expect(monetag.zone).toBe("296070");
    expect(monetag.origin).toBe("https://quge5.com");
  });
});

describe("Content-Security-Policy and the ad network", () => {
  const env = { NEXT_PUBLIC_APP_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" };

  it("admits the network's origin only when asked to, and never loosens the rest", () => {
    const off = buildCsp({ nonce: "n", env });
    expect(off).not.toContain("quge5.com");

    const on = buildCsp({ nonce: "n", env, adNetworkOrigin: monetag.origin });
    expect(on).toMatch(/script-src [^;]*https:\/\/quge5\.com/);
    expect(on).toMatch(/connect-src [^;]*https:\/\/quge5\.com/);
    expect(on).toContain("'strict-dynamic'");
    expect(on).toContain("object-src 'none'");
    expect(on).toContain("frame-ancestors 'none'");
    expect(on).toContain("frame-src 'none'");
    expect(on).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe("policies describe the network tag", () => {
  it("say nothing about it when it is off, and say what it may do when it is on", () => {
    expect(JSON.stringify(getPrivacySections({ networkAds: false }))).not.toMatch(/Monetag/);
    const on = JSON.stringify(getPrivacySections({ networkAds: true }));
    expect(on).toMatch(/Monetag/);
    expect(on).toMatch(/signed-in members/);
    expect(on).toMatch(/notifications/);
    expect(JSON.stringify(getCookieSections({ networkAds: true }))).toMatch(/Monetag/);
    expect(JSON.stringify(getCookieSections({ networkAds: false }))).not.toMatch(/Monetag/);
  });
});

// The worker is exercised in a stubbed ServiceWorkerGlobalScope: what matters is which events it claims.
describe("service worker push handling", () => {
  function load() {
    const listeners = {};
    const shown = [];
    const self = {
      location: { origin: "https://example.test" },
      addEventListener: (type, fn) => (listeners[type] = [...(listeners[type] ?? []), fn]),
      registration: { showNotification: (title, opts) => (shown.push({ title, opts }), Promise.resolve()) },
      clients: { matchAll: async () => [], openWindow: async () => {} },
      skipWaiting() {},
    };
    const src = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
    vm.runInNewContext(src, { self, caches: {}, fetch() {}, URL, Response, console, Promise, JSON, String, Boolean, Symbol: Symbol }, { filename: "sw.js" });
    return { listeners, shown };
  }
  const pushEvent = (payload) => {
    const waits = [];
    return { data: payload === undefined ? null : { json: () => payload, text: () => "" }, waitUntil: (p) => waits.push(p), waits };
  };

  it("shows a notification only for payloads UniSphere's server marked", async () => {
    const { listeners, shown } = load();
    const handler = listeners.push[0];

    const ours = pushEvent({ from: "unisphere", title: "Asha reacted", body: "to your post", url: "/posts/x" });
    handler(ours);
    await Promise.all(ours.waits);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("Asha reacted");
    expect(shown[0].opts.data).toMatchObject({ from: "unisphere", url: "/posts/x" });

    // somebody else's push (no mark) is not dressed up as a UniSphere notification
    const theirs = pushEvent({ title: "WIN A PRIZE", body: "click here", url: "https://evil.example" });
    handler(theirs);
    expect(theirs.waits).toHaveLength(0);
    expect(shown).toHaveLength(1);
  });

  it("opens only UniSphere's own notifications on click", () => {
    const { listeners } = load();
    const click = listeners.notificationclick[0];
    const waits = [];
    let closed = false;
    click({ notification: { data: { from: "unisphere", url: "/messages" }, close: () => (closed = true) }, waitUntil: (p) => waits.push(p) });
    expect(closed).toBe(true);
    expect(waits).toHaveLength(1);

    closed = false;
    const w2 = [];
    click({ notification: { data: { url: "https://evil.example" }, close: () => (closed = true) }, waitUntil: (p) => w2.push(p) });
    expect(closed).toBe(false);
    expect(w2).toHaveLength(0);
  });
});

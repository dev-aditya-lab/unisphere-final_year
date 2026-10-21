import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";

/**
 * The cookie finding is "UniSphere has no non-essential trackers, so it has no consent banner". This test keeps that true:
 * if someone adds an analytics, advertising or social-pixel script, it fails and says what must be done first (a consent
 * choice that blocks the tracker until the member agrees, and a cookies page update).
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCAN = ["app", "components", "lib", "public"];
const TRACKERS = [
  "google-analytics.com", "googletagmanager.com", "gtag(", "analytics.js", "plausible.io", "posthog", "mixpanel", "segment.com", "hotjar", "clarity.ms",
  "connect.facebook.net", "fbq(", "doubleclick.net", "googlesyndication.com", "adsbygoogle", "monetag", "quge5.com", "sentry.io", "datadoghq", "fullstory", "hubspot", "intercom.io",
  "@vercel/analytics", "va.vercel-scripts.com",
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (/\.(js|jsx|mjs|html|json)$/.test(name) && !/package-lock/.test(name)) yield full;
  }
}

describe("no non-essential trackers", () => {
  it("source and public files reference no analytics, advertising or pixel service", () => {
    const hits = [];
    for (const top of SCAN) {
      for (const f of files(path.join(ROOT, top))) {
        const src = readFileSync(f, "utf8").toLowerCase();
        for (const t of TRACKERS) if (src.includes(t.toLowerCase())) hits.push(`${path.relative(ROOT, f)} mentions ${t}`);
      }
    }
    expect(hits, `A tracker was added. Before it ships: block it until the member consents, add a Reject-as-easy-as-Accept choice, record it as a consent purpose (lib/privacy/registry.js), update /cookies and bump the notice.\n${hits.join("\n")}`).toEqual([]);
  });

  it("does not load any third-party script, style or font from a remote origin", () => {
    const hits = [];
    for (const f of [...files(path.join(ROOT, "app")), ...files(path.join(ROOT, "components"))]) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<script[^>]+src=["']https?:\/\/[^"']+["']/gi)) hits.push(`${path.relative(ROOT, f)}: ${m[0]}`);
      for (const m of src.matchAll(/<link[^>]+href=["']https?:\/\/(?!localhost)[^"']+["']/gi)) hits.push(`${path.relative(ROOT, f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it("the content security policy admits only the project's own Supabase, its media storage, and Razorpay on the checkout page", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_APP_URL: "https://uni.example", CLOUDFLARE_ACCOUNT_ID: "acct" };
    const normal = buildCsp({ nonce: "n", env });
    const origins = (csp) => [...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]);
    expect(normal).not.toMatch(/razorpay/);
    for (const o of origins(normal)) expect(o, o).toMatch(/supabase\.co|r2\.cloudflarestorage\.com/);
    const checkout = buildCsp({ nonce: "n", env, checkout: true });
    expect(checkout).toMatch(/checkout\.razorpay\.com/);
    expect(checkout).not.toMatch(/google|facebook|doubleclick/);
  });

  it("the cookies page lists the real storage keys the code uses", () => {
    const cookies = readFileSync(path.join(ROOT, "lib/content/legal.js"), "utf8");
    for (const key of ["unisphere-theme", "unisphere:draft:", "unisphere:install-dismissed", "unisphere:first-post-seen"]) expect(cookies).toContain(key);
  });
});

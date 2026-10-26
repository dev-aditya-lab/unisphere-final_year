import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config.mjs";
import { buildCsp } from "@/lib/security/csp";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const root = path.resolve(import.meta.dirname, "../..");
const headerMap = async (source = "/:path*") => {
  const rules = await nextConfig.headers();
  return Object.fromEntries(rules.filter((r) => r.source === source).flatMap((r) => r.headers.map((h) => [h.key, h.value])));
};

afterEach(() => vi.unstubAllEnvs());

describe("response headers (next.config.mjs)", () => {
  it("sets the baseline protections on every route", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const h = await headerMap();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\)/);
    expect(h["Permissions-Policy"]).toMatch(/microphone=\(\)/);
    expect(h["Permissions-Policy"]).toMatch(/geolocation=\(\)/);
    expect(h["Permissions-Policy"]).toMatch(/payment=\(\)/);
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("enables HSTS in production only (never over plain-http development)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await headerMap())["Strict-Transport-Security"]).toMatch(/max-age=\d{7,}/);
    vi.stubEnv("NODE_ENV", "development");
    expect((await headerMap())["Strict-Transport-Security"]).toBeUndefined();
  });

  it("never publishes browser source maps and does not announce the framework", () => {
    expect(nextConfig.productionBrowserSourceMaps).toBe(false);
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("allows next/image to fetch from one configured media host only, never a wildcard", () => {
    for (const p of nextConfig.images.remotePatterns) expect(p.hostname).not.toContain("*");
  });

  it("keeps the proxy body ceiling equal to the upload ceiling", async () => {
    const { MAX_UPLOAD_BODY_BYTES } = await import("@/lib/storage/policy");
    expect(nextConfig.experimental.proxyClientMaxBodySize).toBe(`${MAX_UPLOAD_BODY_BYTES / 1024 / 1024}mb`);
  });

  it("answers no cross-origin requests: nothing in the app sets CORS headers", () => {
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || ["node_modules", "tests", "docs", "playstore", "test-results"].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(m?js|jsx)$/.test(e.name) && /access-control-allow/i.test(fs.readFileSync(full, "utf8"))) hits.push(path.relative(root, full));
      }
    };
    walk(root);
    expect(hits.filter((f) => f !== path.join("tests", "unit", "security-config.test.js"))).toEqual([]);
  });
});

describe("Content-Security-Policy", () => {
  const env = {
    NEXT_PUBLIC_APP_URL: "https://unisphere.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_MEDIA_URL: "https://media.example",
    CLOUDFLARE_ACCOUNT_ID: "acct123",
  };
  const directives = (csp) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

  it("keeps scripts strict: nonce, no inline, no eval, no wildcard, no plain http", () => {
    const d = directives(buildCsp({ nonce: "n0nce", env }));
    expect(d["script-src"]).toContain("'nonce-n0nce'");
    expect(d["script-src"]).toContain("'strict-dynamic'");
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "*", "http:", "https:", "data:"]) expect(d["script-src"]).not.toContain(bad);
  });

  it("forbids framing, plugins, base-tag and form-target hijacking", () => {
    const d = directives(buildCsp({ nonce: "x", env }));
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["frame-src"]).toEqual(["'none'"]);
    expect(d["default-src"]).toEqual(["'self'"]);
  });

  it("connects only to this site, its own database and media host", () => {
    const d = directives(buildCsp({ nonce: "x", env }));
    expect(d["connect-src"].sort()).toEqual(["'self'", "https://abc.supabase.co", "https://media.example", "wss://abc.supabase.co"].sort());
  });

  it("admits no payment company (payment is taken on the gateway's own page, reached through the one checkout route)", () => {
    const csp = buildCsp({ nonce: "x", env });
    expect(directives(csp)["script-src"].join(" ")).not.toMatch(/https:\/\//);
    expect(directives(csp)["frame-src"]).toEqual(["'none'"]);
    expect(directives(csp)["form-action"]).toEqual(["'self'"]);
  });

  it("allows eval only in development, and upgrades insecure requests only on an https site", () => {
    expect(buildCsp({ nonce: "x", env, isDev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: "x", env })).toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "x", env: { ...env, NEXT_PUBLIC_APP_URL: "http://localhost:3000" } })).not.toContain("upgrade-insecure-requests");
  });
});

describe("sitemap.xml and robots.txt", () => {
  const entries = sitemap();
  const base = new URL(entries[0].url).origin;
  const pathOf = (u) => new URL(u).pathname;
  const marketing = (p) => path.join(root, "app", "(marketing)", p === "/" ? "" : p, "page.js");

  it("lists only pages that exist, with absolute URLs on one origin and no duplicates", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) {
      expect(new URL(u).origin).toBe(base);
      expect(fs.existsSync(marketing(pathOf(u))), pathOf(u)).toBe(true);
    }
  });

  it("lists only pages that opt in to indexing and name themselves as canonical", () => {
    const layout = fs.readFileSync(path.join(root, "app", "(marketing)", "layout.js"), "utf8");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*true/);
    for (const e of entries) {
      const p = pathOf(e.url);
      const src = fs.readFileSync(marketing(p), "utf8");
      expect(src, p).not.toMatch(/index:\s*false/);
      if (p !== "/") expect(src, p).toContain(`canonical: "${p}"`);
    }
  });

  it("never lists a private or internal area", () => {
    for (const e of entries) expect(pathOf(e.url)).not.toMatch(/^\/(admin|api|auth|feed|messages|settings|u|login|register|onboarding|notifications|search|orbits|projects|events|communities|opportunities|colleges|alumni|connections|bookmarks)(\/|$)/);
  });

  it("robots.txt blocks everything except the listed public pages and points at the sitemap", () => {
    const r = robots();
    const rule = r.rules[0];
    expect(rule.disallow).toBe("/");
    expect(r.sitemap).toBe(`${base}/sitemap.xml`);
    const allowed = rule.allow.map((p) => p.replace(/\$$/, ""));
    for (const e of entries) expect(allowed).toContain(pathOf(e.url));
    for (const p of allowed) expect(p).not.toMatch(/^\/(admin|api|auth|feed|messages|settings|u)(\/|$)/);
  });

  it("the whole site is noindex by default, so a page can only be found by opting in", () => {
    const layout = fs.readFileSync(path.join(root, "app", "layout.js"), "utf8");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false/);
    const admin = fs.readFileSync(path.join(root, "app", "(admin)", "admin", "layout.js"), "utf8");
    expect(admin).toMatch(/index:\s*false/);
  });
});

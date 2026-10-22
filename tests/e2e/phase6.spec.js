import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { admin, cleanupUsers, createUser, grantRoleDirect, PASSWORD } from "../helpers/supabase.js";

async function login(page, email) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
}

const tag = Math.random().toString(36).slice(2, 7);

test.describe.serial("production readiness: security, SEO and accessibility", () => {
  test.setTimeout(420_000); // first visits compile every route in dev mode
  let author, member, gadmin, publicPost, collegePost;
  test.beforeAll(async () => {
    author = await createUser("p6-author");
    member = await createUser("p6-member");
    gadmin = await createUser("p6-admin");
    await grantRoleDirect(gadmin.id, "global_admin");
    await admin.from("profiles").update({ visibility: "public" }).eq("id", author.id);
    const mk = async (visibility, title) =>
      (await author.client.from("posts").insert({ author_id: author.id, slug: `p6-${visibility}-${tag}`, title: `${title} ${tag}`, body: "A post written for the production-readiness tests.", category: "projects", visibility }).select("id, slug").single()).data;
    publicPost = await mk("public", "Public robotics notes");
    collegePost = await mk("college", "College-only timetable");
  });
  test.afterAll(async () => {
    await admin.from("posts").delete().like("slug", `p6-%-${tag}`);
    await cleanupUsers();
  });

  test("every response carries the security headers, and the CSP is nonce-based with no third-party origins", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    const csp = h["content-security-policy"];
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    // Only our own Supabase project and our own R2 storage (signed file URLs) may be named: no third-party origin at all.
    const origins = [...csp.matchAll(/(?:https?|wss?):\/\/[^\s;]+/g)].map((m) => m[0]);
    // (plus the media host when a public bucket is configured: NEXT_PUBLIC_MEDIA_URL / CLOUDFLARE_R2_PUBLIC_URL)
    const media = [process.env.NEXT_PUBLIC_MEDIA_URL, process.env.CLOUDFLARE_R2_PUBLIC_URL].filter(Boolean).map((u) => new URL(u).origin);
    for (const o of origins) {
      if (media.some((m) => o === m)) continue;
      expect(o, o).toMatch(/^(?:wss?|https?):\/\/(?:127\.0\.0\.1|localhost|\*?\.?[a-z0-9]+\.r2\.cloudflarestorage\.com)/);
    }
    // a different nonce on every request
    const again = (await request.get("/")).headers()["content-security-policy"];
    expect(again.match(/nonce-([^']+)/)[1]).not.toBe(csp.match(/nonce-([^']+)/)[1]);
    // API and redirects are covered too
    expect((await request.get("/api/health")).headers()["content-security-policy"]).toBeTruthy();
    expect((await request.get("/feed", { maxRedirects: 0 })).headers()["content-security-policy"]).toBeTruthy();
  });

  test("pages render and work under the CSP: no violations on public, member and admin pages", async ({ browser }) => {
    const violations = [];
    const watch = (page) => {
      page.on("console", (m) => /content security policy|refused to (load|execute|apply|connect)/i.test(m.text()) && violations.push(`${page.url()} :: ${m.text().slice(0, 200)}`));
      page.on("pageerror", (e) => /content security policy/i.test(e.message) && violations.push(e.message));
    };
    const anon = await (await browser.newContext()).newPage();
    watch(anon);
    for (const path of ["/", "/about", "/features", "/guidelines", "/contact", "/login", "/register"]) {
      await anon.goto(path);
      await anon.waitForLoadState("networkidle");
    }
    const m = await (await browser.newContext()).newPage();
    watch(m);
    await login(m, member.email);
    for (const path of ["/feed", "/explore", "/projects", "/events", "/messages", "/notifications", "/settings/notifications", "/settings/privacy", "/feedback", "/roadmap", "/changelog"]) {
      await m.goto(path);
      await m.waitForLoadState("networkidle");
    }
    const a = await (await browser.newContext()).newPage();
    watch(a);
    await login(a, gadmin.email);
    for (const path of ["/admin", "/admin/analytics", "/admin/settings", "/admin/reports", "/admin/releases"]) {
      await a.goto(path);
      await a.waitForLoadState("networkidle");
    }
    // the theme toggle (our one inline script's job) and toasts (runtime style injection) still work
    await m.goto("/settings/notifications");
    await m.getByRole("button", { name: /theme/i }).first().click().catch(() => {});
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("the sitemap, robots and llms.txt describe a closed network: only the explanatory pages are listed", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/about", "/features", "/guidelines", "/privacy", "/terms", "/contact"]) expect(sitemap).toContain(path);
    for (const never of ["/posts/", "/u/", "/projects/", "/events/", "/roadmap", "/changelog", "/admin", "/feed", publicPost.slug, collegePost.slug, author.username]) {
      expect(sitemap, never).not.toContain(never);
    }

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \//);
    expect(robots).toMatch(/Allow: \/about/);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);

    const llms = await request.get("/llms.txt");
    expect(llms.status()).toBe(200);
    expect(llms.headers()["content-type"]).toContain("text/plain");
    const text = await llms.text();
    expect(text).toMatch(/every college community/i);
    expect(text).toMatch(/nothing inside is public/i);
    expect(text).toMatch(/open to anyone who wants to join/);
    // positioning is multi-college: no single institution and no personal attribution
    expect(text).not.toMatch(/Ramgarh|RGEC|Aditya Kumar|Sumit Jha|Sahil Nayak|Vishal Kumar/);
  });

  test("logged-out visitors are sent to the login page for every member page, even ones marked public", async ({ request }) => {
    for (const path of [`/posts/${publicPost.slug}`, `/u/${author.username}`, "/feed", "/projects", "/events", "/roadmap", "/changelog", "/search?q=robotics", "/admin"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers().location, path).toContain("/login");
    }
    // the sign-up and explanatory pages stay open
    for (const path of ["/", "/about", "/features", "/faq", "/login", "/register", "/contact", "/privacy", "/terms", "/guidelines", "/content-policy", "/copyright-policy", "/brand-policy", "/accessibility", "/cookies"]) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
    // there is no public preview of a member post either
    expect((await request.get(`/posts/${publicPost.slug}/opengraph-image`, { maxRedirects: 0 })).status()).not.toBe(200);
  });

  test("the home page has valid structured data and previews; member pages are never indexable", async ({ page, browser }) => {
    await page.goto("/");
    const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((t) => [].concat(JSON.parse(t)));
    const org = ld.find((d) => d["@type"] === "Organization");
    expect(org.name).toBe("UniSphere");
    expect(org.founder).toBeUndefined(); // no personal attribution in structured data
    expect(JSON.stringify(org)).not.toMatch(/Ramgarh|CollegeOrUniversity/);
    expect(ld.some((d) => d["@type"] === "FAQPage")).toBe(true);
    // browsers hide the nonce attribute from the DOM (getAttribute is empty); the element's nonce property carries it
    expect(await page.locator('script[type="application/ld+json"]').first().evaluate((el) => el.nonce)).toBeTruthy();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect((await page.request.get(new URL(og).pathname)).headers()["content-type"]).toContain("image/png");

    const m = await (await browser.newContext()).newPage();
    await login(m, author.email);
    await m.goto(`/posts/${publicPost.slug}`);
    await expect(m.getByRole("heading", { name: /Public robotics notes/ })).toBeVisible();
    await expect(m.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(await m.locator('meta[property="og:image"]').count()).toBe(0);
    expect(await m.locator('script[type="application/ld+json"]').count()).toBe(0);
  });

  test("health endpoint reports liveness without leaking internals", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
    const deep = await request.get("/api/health?deep=1");
    expect([200, 503]).toContain(deep.status());
    const body = await deep.json();
    expect(JSON.stringify(body)).not.toMatch(/key|secret|password|postgres:\/\//i);
  });

  test("key pages have no serious or critical accessibility violations (axe, WCAG 2.1 A/AA)", async ({ browser }) => {
    const scan = async (page, path) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      return bad.map((v) => `${path}: ${v.id} (${v.impact}) — ${v.help} — ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    };
    const problems = [];
    // Reduced motion shows every page in its final state, so scroll-reveal fades cannot skew colour measurements.
    const ctxOpts = { reducedMotion: "reduce" };
    const anon = await (await browser.newContext(ctxOpts)).newPage();
    for (const p of ["/", "/about", "/features", "/faq", "/login", "/register", "/contact", "/guidelines", "/content-policy", "/privacy", "/terms", "/cookies", "/copyright-policy", "/brand-policy", "/accessibility", "/pricing", "/refund-policy", "/shipping-policy"]) problems.push(...(await scan(anon, p)));
    const m = await (await browser.newContext(ctxOpts)).newPage();
    await login(m, member.email);
    for (const p of ["/feed", "/explore", "/projects", "/messages", "/settings/profile", "/settings/notifications", "/feedback", "/roadmap", "/changelog"]) problems.push(...(await scan(m, p)));
    const a = await (await browser.newContext(ctxOpts)).newPage();
    await login(a, gadmin.email);
    for (const p of ["/admin", "/admin/reports", "/admin/users", "/admin/settings", "/admin/analytics"]) problems.push(...(await scan(a, p)));
    expect(problems, problems.join("\n")).toEqual([]);
  });
});

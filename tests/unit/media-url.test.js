import { afterEach, describe, expect, it, vi } from "vitest";

// NEXT_PUBLIC_* values are read when the module loads, so each scenario imports a fresh copy.
async function load(env = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MEDIA_URL", env.base ?? "");
  vi.stubEnv("NEXT_PUBLIC_MEDIA_RESIZE", env.resize ?? "");
  return import("@/lib/media");
}
afterEach(() => vi.unstubAllEnvs());

// Keys exactly as the app has always stored them.
const KEY = "avatar/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";

describe("mediaUrl: existing URLs keep working", () => {
  it("uses the app route when there is no public media domain", async () => {
    const { mediaUrl } = await load();
    expect(mediaUrl(KEY)).toBe(`/api/media/${KEY}`);
    expect(mediaUrl(KEY, { width: 96 })).toBe(`/api/media/${KEY}`);
  });

  it("uses the media domain directly, trimming a trailing slash", async () => {
    const { mediaUrl } = await load({ base: "https://unimedia.example.test/" });
    expect(mediaUrl(KEY)).toBe(`https://unimedia.example.test/${KEY}`);
  });

  it("serves the original even when a width is asked for, unless resizing is switched on", async () => {
    const { mediaUrl } = await load({ base: "https://unimedia.example.test" });
    expect(mediaUrl(KEY, { width: 96 })).toBe(`https://unimedia.example.test/${KEY}`);
  });

  it("returns null for nothing, so the caller shows its fallback", async () => {
    const { mediaUrl } = await load({ base: "https://unimedia.example.test" });
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl("")).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
  });
});

describe("mediaUrl: sizes", () => {
  it("asks Cloudflare for the next size up from the width wanted", async () => {
    const { mediaUrl } = await load({ base: "https://unimedia.example.test", resize: "cloudflare" });
    expect(mediaUrl(KEY, { width: 40 })).toBe(`https://unimedia.example.test/cdn-cgi/image/width=48,fit=scale-down,quality=82,format=auto/${KEY}`);
    expect(mediaUrl(KEY, { width: 100 })).toContain("width=160,");
    expect(mediaUrl(KEY, { width: 1280 })).toContain("width=1280,");
  });

  it("uses only a few sizes, so one picture does not exist in a hundred cached copies", async () => {
    const { mediaUrl, MEDIA_WIDTHS } = await load({ base: "https://unimedia.example.test", resize: "cloudflare" });
    const seen = new Set();
    for (let w = 1; w <= 1280; w += 7) seen.add(mediaUrl(KEY, { width: w }));
    expect(seen.size).toBe(MEDIA_WIDTHS.length);
  });

  it("serves the original for no width, or one larger than any size", async () => {
    const { mediaUrl } = await load({ base: "https://unimedia.example.test", resize: "cloudflare" });
    expect(mediaUrl(KEY)).toBe(`https://unimedia.example.test/${KEY}`);
    expect(mediaUrl(KEY, { width: 5000 })).toBe(`https://unimedia.example.test/${KEY}`);
  });

  it("ignores the switch without a media domain (the app route cannot resize)", async () => {
    const { mediaUrl } = await load({ resize: "cloudflare" });
    expect(mediaUrl(KEY, { width: 96 })).toBe(`/api/media/${KEY}`);
  });
});

describe("mediaUrl: unsafe keys", () => {
  it("refuses anything that could change the host, add a query or leave the folder", async () => {
    const { mediaUrl, isSafeMediaKey } = await load({ base: "https://unimedia.example.test" });
    for (const bad of ["../secret.png", "https://evil.test/x.png", "//evil.test/x.png", "/abs/x.png", "a/b.png?x=1", "a/b.png#x", "a\\b.png", "a/../b.png", "a b.png", "a//b.png"]) {
      expect(isSafeMediaKey(bad), bad).toBe(false);
      expect(mediaUrl(bad), bad).toBeNull();
    }
    expect(isSafeMediaKey(KEY)).toBe(true);
  });
});

describe("privateFileUrl", () => {
  it("always goes through the authorising route, never straight to storage", async () => {
    const { privateFileUrl } = await load({ base: "https://unimedia.example.test" });
    expect(privateFileUrl("3f0c1c3e-0000-4000-8000-000000000000")).toBe("/api/files/3f0c1c3e-0000-4000-8000-000000000000");
    expect(privateFileUrl(null)).toBeNull();
  });
});

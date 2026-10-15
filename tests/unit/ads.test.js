import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CLIENT_ID, adsTxtLine, parseAdsConfig, resolveClientId } from "@/lib/ads";
import { buildCsp } from "@/lib/security/csp";

const CLIENT = "ca-pub-1234567890123456";

describe("parseAdsConfig", () => {
  it("is off when nothing is configured", () => {
    expect(parseAdsConfig({})).toEqual({ clientId: "", publisherId: "", slotId: "", enabled: false });
  });

  it("accepts only the real ID formats", () => {
    expect(parseAdsConfig({ clientId: "pub-123", slotId: "abc", enabled: "true" })).toMatchObject({ clientId: "", slotId: "", enabled: false });
    expect(parseAdsConfig({ clientId: "ca-pub-12345", slotId: "1234567890", enabled: "true" }).enabled).toBe(false);
  });

  it("declares the site (client ID only) without enabling any ad", () => {
    const c = parseAdsConfig({ clientId: CLIENT });
    expect(c.clientId).toBe(CLIENT);
    expect(c.publisherId).toBe("pub-1234567890123456");
    expect(c.enabled).toBe(false);
  });

  it("needs the client ID, an ad unit and the explicit switch", () => {
    expect(parseAdsConfig({ clientId: CLIENT, slotId: "1234567890" }).enabled).toBe(false);
    expect(parseAdsConfig({ clientId: CLIENT, enabled: "true" }).enabled).toBe(false);
    expect(parseAdsConfig({ clientId: CLIENT, slotId: "1234567890", enabled: "true" }).enabled).toBe(true);
    expect(parseAdsConfig({ clientId: CLIENT, slotId: "1234567890", enabled: "yes" }).enabled).toBe(false);
  });
});

describe("default publisher ID", () => {
  it("is well formed, and the environment can override it", () => {
    expect(DEFAULT_CLIENT_ID).toBe("ca-pub-4948320690892487");
    expect(parseAdsConfig({ clientId: DEFAULT_CLIENT_ID }).clientId).toBe(DEFAULT_CLIENT_ID);
    expect(resolveClientId("")).toBe(DEFAULT_CLIENT_ID);
    expect(resolveClientId("   ")).toBe(DEFAULT_CLIENT_ID);
    expect(resolveClientId(undefined)).toBe(DEFAULT_CLIENT_ID);
    expect(resolveClientId(CLIENT)).toBe(CLIENT);
  });

  it("only declares the site: ads stay off without an ad unit and the explicit switch", () => {
    expect(parseAdsConfig({ clientId: DEFAULT_CLIENT_ID }).enabled).toBe(false);
  });
});

describe("ads.txt line", () => {
  it("uses Google's documented format", () => {
    expect(adsTxtLine("pub-1234567890123456")).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0");
  });
});

describe("Content-Security-Policy", () => {
  const base = { NEXT_PUBLIC_APP_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" };

  it("allows no Google origins and no frames when ads are off", () => {
    const csp = buildCsp({ nonce: "n", env: base });
    expect(csp).not.toMatch(/google|doubleclick/);
    expect(csp).toContain("frame-src 'none'");
  });

  it("adds Google's ad origins only when ads are fully enabled", () => {
    const partial = buildCsp({ nonce: "n", env: { ...base, NEXT_PUBLIC_ADSENSE_CLIENT_ID: CLIENT } });
    expect(partial).not.toMatch(/googlesyndication/);

    const on = buildCsp({ nonce: "n", env: { ...base, NEXT_PUBLIC_ADSENSE_CLIENT_ID: CLIENT, NEXT_PUBLIC_ADSENSE_SLOT_ID: "1234567890", NEXT_PUBLIC_ADS_ENABLED: "true" } });
    expect(on).toContain("https://pagead2.googlesyndication.com");
    expect(on).toMatch(/frame-src [^;]*googleads\.g\.doubleclick\.net/);
    // the policy stays strict where it matters
    expect(on).toContain("'strict-dynamic'");
    expect(on).toContain("object-src 'none'");
    expect(on).toContain("frame-ancestors 'none'");
    expect(on).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe("GET /ads.txt", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists this site's own publisher ID by default, as plain text", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_CLIENT_ID", "");
    const { GET } = await import("@/app/ads.txt/route");
    const res = GET();
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("google.com, pub-4948320690892487, DIRECT, f08c47fec0942fa0\n");
  });

  it("lists exactly the configured publisher when one is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_CLIENT_ID", CLIENT);
    const { GET } = await import("@/app/ads.txt/route");
    expect(await GET().text()).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("never publishes a malformed ID: it falls back to a comment", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_CLIENT_ID", "not-an-id");
    const { GET } = await import("@/app/ads.txt/route");
    const lines = (await GET().text()).split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    expect(lines).toEqual([]);
  });
});

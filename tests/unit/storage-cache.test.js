import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { CACHE_CONTROL, PRIVATE_SIGNING, PUBLIC_SIGNING, cacheControlForPurpose, stableSigning } from "@/lib/storage/cache";
import { UPLOAD_PURPOSES } from "@/lib/storage/policy";

describe("cache policy by purpose", () => {
  it("makes every public image immutable and never lets a shared cache keep a private file", () => {
    for (const [purpose, rule] of Object.entries(UPLOAD_PURPOSES)) {
      const cc = cacheControlForPurpose(purpose, rule);
      if (rule.bucket === "public") expect(cc, purpose).toBe(CACHE_CONTROL.publicImmutable);
      else expect(cc, purpose).toMatch(/^private,/);
    }
  });

  it("keeps identity documents out of every cache, even the member's own", () => {
    expect(cacheControlForPurpose("verification_document", UPLOAD_PURPOSES.verification_document)).toBe("private, no-store");
  });

  it("lets only the member's own browser keep chat and post images, and briefly", () => {
    for (const purpose of ["message_attachment", "post_attachment"]) {
      const cc = cacheControlForPurpose(purpose, UPLOAD_PURPOSES[purpose]);
      expect(cc).toBe("private, max-age=300");
      expect(cc).not.toMatch(/public|immutable/);
    }
  });
});

describe("stableSigning", () => {
  const W = PRIVATE_SIGNING.windowSec;
  const at = (sec) => sec * 1000;

  it("signs as of the start of the window, so everyone asking in it gets the same URL", () => {
    const a = stableSigning({ now: at(W * 10 + 1), ...PRIVATE_SIGNING });
    const b = stableSigning({ now: at(W * 10 + W - 1), ...PRIVATE_SIGNING });
    expect(a.signingDate.getTime()).toBe(b.signingDate.getTime());
    expect(a.signingDate.getTime()).toBe(at(W * 10));
    expect(stableSigning({ now: at(W * 11), ...PRIVATE_SIGNING }).signingDate.getTime()).toBe(at(W * 11));
  });

  it("never leaves less than the promised validity, from any moment in the window", () => {
    for (const cfg of [PRIVATE_SIGNING, PUBLIC_SIGNING]) {
      for (const offset of [0, 1, Math.floor(cfg.windowSec / 2), cfg.windowSec - 1]) {
        const now = at(cfg.windowSec * 7 + offset);
        const { signingDate, expiresIn } = stableSigning({ now, ...cfg });
        const remainingSec = (signingDate.getTime() + expiresIn * 1000 - now) / 1000;
        expect(remainingSec).toBeGreaterThanOrEqual(cfg.minValiditySec);
      }
    }
  });

  it("keeps private URLs short-lived (well under an hour)", () => {
    expect(stableSigning({ now: Date.now(), ...PRIVATE_SIGNING }).expiresIn).toBeLessThanOrEqual(3600);
  });
});

describe("R2 helpers", () => {
  let r2;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct123");
    vi.stubEnv("CLOUDFLARE_R2_ENDPOINT", "");
    vi.stubEnv("CLOUDFLARE_R2_ACCESS_KEY_ID", "test-access-key");
    vi.stubEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "test-secret-key");
    vi.stubEnv("CLOUDFLARE_R2_BUCKET_NAME", "private-bucket");
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_BUCKET_NAME", "public-bucket");
    vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", "https://media.example.test");
    vi.stubEnv("CLOUDFLARE_R2_FORCE_PATH_STYLE", "false");
    r2 = await import("@/lib/storage/r2");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const query = (url) => new URL(url).searchParams;

  it("signs a private image identically within a window, so the browser recognises the picture it has", async () => {
    vi.useFakeTimers();
    const args = { visibility: "private", key: "post_attachment/u/f.webp", contentType: "image/webp", cacheControl: CACHE_CONTROL.privateImage, signing: PRIVATE_SIGNING };
    vi.setSystemTime(new Date("2026-10-21T10:00:10Z"));
    const first = await r2.presignDownload(args);
    vi.setSystemTime(new Date("2026-10-21T10:04:50Z"));
    expect(await r2.presignDownload(args)).toBe(first);
    vi.setSystemTime(new Date("2026-10-21T10:05:10Z"));
    expect(await r2.presignDownload(args)).not.toBe(first);
  });

  it("is still short-lived and carries the cache instruction in the signature", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T10:00:10Z"));
    const q = query(await r2.presignDownload({ visibility: "private", key: "message_attachment/u/f.png", cacheControl: CACHE_CONTROL.privateImage, signing: PRIVATE_SIGNING }));
    expect(Number(q.get("X-Amz-Expires"))).toBe(600);
    expect(q.get("response-cache-control")).toBe("private, max-age=300");
  });

  it("gives documents a fresh URL every time, expiring in two minutes, that storage says not to keep", async () => {
    vi.useFakeTimers();
    const args = { visibility: "private", key: "verification_document/u/f.pdf", cacheControl: CACHE_CONTROL.privateNoStore };
    vi.setSystemTime(new Date("2026-10-21T10:00:10Z"));
    const a = await r2.presignDownload(args);
    vi.setSystemTime(new Date("2026-10-21T10:00:11Z"));
    const b = await r2.presignDownload(args);
    expect(a).not.toBe(b);
    expect(Number(query(a).get("X-Amz-Expires"))).toBe(120);
    expect(query(a).get("response-cache-control")).toBe("private, no-store");
  });

  it("stores the Cache-Control it is given with the object, and none when none is given", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({});
    await r2.putObject({ visibility: "public", key: "avatar/u/f.webp", body: Buffer.from("x"), contentType: "image/webp", cacheControl: CACHE_CONTROL.publicImmutable });
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: "public-bucket", Key: "avatar/u/f.webp", CacheControl: "public, max-age=31536000, immutable", ContentType: "image/webp" });
    await r2.putObject({ visibility: "private", key: "x", body: Buffer.from("x"), contentType: "image/png" });
    expect(send.mock.calls[1][0].input.CacheControl).toBeUndefined();
  });
});

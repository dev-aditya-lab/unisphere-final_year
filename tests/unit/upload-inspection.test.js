import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { inspectImage, MAX_PIXELS } from "@/lib/storage/inspect-image";
import { detectMime } from "@/lib/storage/policy";

const env = { UPLOAD_SCAN_URL: undefined, UPLOAD_SCAN_TOKEN: undefined, UPLOAD_SCAN_TIMEOUT_MS: 1000 };
vi.mock("@/lib/env", () => ({ getEnv: () => env }));
const { scanUpload } = await import("@/lib/storage/scan");

const base = { create: { width: 64, height: 48, channels: 3, background: "#3366cc" } };
const jpeg = (opts = {}) => sharp(base).jpeg(opts).toBuffer();
const png = () => sharp(base).png().toBuffer();
const webp = () => sharp(base).webp().toBuffer();

describe("image inspection (upload hardening)", () => {
  it("accepts real JPEG, PNG and WebP images and reports their size", async () => {
    for (const [bytes, mime] of [[await jpeg(), "image/jpeg"], [await png(), "image/png"], [await webp(), "image/webp"]]) {
      expect(detectMime(bytes)).toBe(mime);
      const r = await inspectImage(bytes, mime);
      expect(r).toMatchObject({ ok: true, width: 64, height: 48 });
    }
  });

  it("rejects a file that starts like a JPEG but is not one", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<script>alert(1)</script>".repeat(10))]);
    expect(detectMime(fake)).toBe("image/jpeg"); // the magic number alone is fooled...
    expect((await inspectImage(fake, "image/jpeg")).ok).toBe(false); // ...decoding is not
  });

  it("rejects a truncated image", async () => {
    const whole = await png();
    expect((await inspectImage(whole.subarray(0, Math.floor(whole.length / 2)), "image/png")).ok).toBe(false);
  });

  it("rejects an image whose real format differs from the claimed one", async () => {
    expect(await inspectImage(await png(), "image/jpeg")).toMatchObject({ ok: false, reason: "format_mismatch" });
  });

  it("rejects SVG and other types it was not asked to handle", async () => {
    expect((await inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml")).ok).toBe(false);
  });

  it("rejects an image with more pixels than the limit (decompression bomb)", async () => {
    const side = Math.ceil(Math.sqrt(MAX_PIXELS)) + 10;
    const bomb = await sharp({ create: { width: side, height: side, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024); // tiny on disk...
    expect((await inspectImage(bomb, "image/png")).ok).toBe(false); // ...huge in memory
  }, 60_000);

  it("removes location and camera metadata", async () => {
    const withExif = await sharp(base)
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-owner", ImageDescription: "taken at home" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();
    const r = await inspectImage(withExif, "image/jpeg");
    expect(r).toMatchObject({ ok: true, stripped: true });
    expect((await sharp(r.bytes).metadata()).exif).toBeUndefined();
    expect(r.bytes.toString("latin1")).not.toContain("secret-owner");
  });

  it("applies the orientation flag to the pixels before dropping it, and reports the upright size", async () => {
    const rotated = await sharp(base).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = await inspectImage(rotated, "image/jpeg");
    expect(r.ok).toBe(true);
    expect({ w: r.width, h: r.height }).toEqual({ w: 48, h: 64 });
    expect(await sharp(r.bytes).metadata()).toMatchObject({ width: 48, height: 64 });
  });
});

describe("scanning boundary for PDFs", () => {
  beforeEach(() => Object.assign(env, { UPLOAD_SCAN_URL: undefined }));
  const pdf = Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\n");

  it("says plainly that nothing was scanned when no scanner is configured", async () => {
    expect(await scanUpload(pdf)).toEqual({ scanned: false, clean: true });
  });

  it("accepts only an explicit clean verdict", async () => {
    env.UPLOAD_SCAN_URL = "https://scan.example/check";
    const reply = (body, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body });
    expect(await scanUpload(pdf, { fetchImpl: reply({ clean: true }) })).toEqual({ scanned: true, clean: true });
    expect(await scanUpload(pdf, { fetchImpl: reply({ clean: false }) })).toEqual({ scanned: true, clean: false });
    expect((await scanUpload(pdf, { fetchImpl: reply({}) })).clean).toBe(false);
    expect((await scanUpload(pdf, { fetchImpl: reply({ clean: "true" }) })).clean).toBe(false);
  });

  it("fails closed when the scanner is down, slow or answers with an error", async () => {
    env.UPLOAD_SCAN_URL = "https://scan.example/check";
    expect(await scanUpload(pdf, { fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) })).toEqual({ scanned: false, clean: false });
    expect(await scanUpload(pdf, { fetchImpl: vi.fn().mockResolvedValue({ ok: false, json: async () => ({ clean: true }) }) })).toEqual({ scanned: false, clean: false });
  });

  it("sends the bearer token when one is configured", async () => {
    Object.assign(env, { UPLOAD_SCAN_URL: "https://scan.example/check", UPLOAD_SCAN_TOKEN: "tok" });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ clean: true }) });
    await scanUpload(pdf, { fetchImpl });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });
});

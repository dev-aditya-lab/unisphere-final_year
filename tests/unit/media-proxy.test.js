import { beforeEach, describe, expect, it, vi } from "vitest";

// The Orbit Card draws on a canvas, which cannot read an image from another domain. /api/media normally redirects to a signed
// storage URL; with ?proxy=1 it must stream the same public image from our own domain instead.
const KEY = "orbit_badge/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
let file;
const presign = vi.fn(async () => "https://storage.example/signed?sig=1");

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: file }) }) }) }) }),
}));
vi.mock("@/lib/storage/r2", () => ({ presignDownload: (a) => presign(a) }));

const { GET } = await import("@/app/api/media/[...key]/route.js");
const call = (query = "", key = KEY) => GET(new Request(`https://app.example/api/media/${key}${query}`), { params: Promise.resolve({ key: key.split("/") }) });

describe("/api/media", () => {
  beforeEach(() => {
    file = { bucket: "public", storage_key: KEY, mime_type: "image/png", status: "ready" };
    presign.mockClear();
    vi.unstubAllGlobals();
  });

  it("redirects to a signed storage URL by default", async () => {
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/signed?sig=1");
  });

  it("lets browsers and shared caches reuse the redirect, for less time than the URL it points at is valid", async () => {
    const { PUBLIC_SIGNING } = await import("@/lib/storage/cache");
    const res = await call();
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, stale-while-revalidate=3600");
    // max-age + stale-while-revalidate (2 h) is inside the six hours the URL is guaranteed to work
    expect(7200).toBeLessThan(PUBLIC_SIGNING.minValiditySec);
  });

  it("signs one stable URL per day for a public image, and asks storage to mark it immutable", async () => {
    await call();
    expect(presign.mock.calls[0][0]).toMatchObject({ cacheControl: "public, max-age=31536000, immutable", signing: { windowSec: 86_400 } });
  });

  it("streams the image from this domain with ?proxy=1", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200, headers: { "content-length": "4" } })));
    const res = await call("?proxy=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it("passes the validators on when it streams, so a returning browser can ask whether the picture changed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(4), { status: 200, headers: { "content-length": "4", etag: '"abc123"', "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT" } })),
    );
    const res = await call("?proxy=1");
    expect(res.headers.get("etag")).toBe('"abc123"');
    expect(res.headers.get("last-modified")).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
  });

  it("answers 404 when storage fails or the file is oversized", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect((await call("?proxy=1")).status).toBe(404);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(4), { status: 200, headers: { "content-length": String(9 * 1024 * 1024) } })));
    expect((await call("?proxy=1")).status).toBe(404);
  });

  it("still refuses keys that are not public purposes, and files that are not ready", async () => {
    expect((await call("?proxy=1", "private_doc/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png")).status).toBe(404);
    file = { ...file, status: "pending" };
    expect((await call("?proxy=1")).status).toBe(404);
  });

  it("lets a missing picture be answered from cache for a minute, not for longer", async () => {
    file = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("refuses attachments and identity documents by key shape, before the database is asked", async () => {
    for (const purpose of ["post_attachment", "message_attachment", "verification_document"]) {
      const res = await call("", `${purpose}/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png`);
      expect(res.status, purpose).toBe(404);
    }
    expect(presign).not.toHaveBeenCalled();
  });

  it("answers 503 when it cannot sign, and a missing object is not a redirect", async () => {
    presign.mockRejectedValueOnce(new Error("down"));
    expect((await call()).status).toBe(503);
    file = null;
    expect((await call()).status).toBe(404);
  });
});

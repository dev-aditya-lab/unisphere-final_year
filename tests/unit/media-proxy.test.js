import { beforeEach, describe, expect, it, vi } from "vitest";

// The Orbit Card draws on a canvas, which cannot read an image from another domain. /api/media normally redirects to a signed
// storage URL; with ?proxy=1 it must stream the same public image from our own domain instead.
const KEY = "orbit_badge/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
let file;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: file }) }) }) }) }),
}));
vi.mock("@/lib/storage/r2", () => ({ presignDownload: async () => "https://storage.example/signed?sig=1" }));

const { GET } = await import("@/app/api/media/[...key]/route.js");
const call = (query = "", key = KEY) => GET(new Request(`https://app.example/api/media/${key}${query}`), { params: Promise.resolve({ key: key.split("/") }) });

describe("/api/media", () => {
  beforeEach(() => {
    file = { bucket: "public", storage_key: KEY, mime_type: "image/png", status: "ready" };
    vi.unstubAllGlobals();
  });

  it("redirects to a signed storage URL by default", async () => {
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/signed?sig=1");
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
});

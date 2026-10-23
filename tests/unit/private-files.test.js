import { beforeEach, describe, expect, it, vi } from "vitest";

// Private files: who may be given a URL, and what a browser or cache may do with the answer.
// Row Level Security decides visibility inside the database; here it is modelled by what the query returns
// (a row for someone who may see the file, nothing for anyone else).
let row;
const presign = vi.fn(async (args) => `https://storage.example/signed?key=${args.key}`);
const selects = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: (cols) => {
        selects.push(cols);
        return { eq: () => ({ maybeSingle: async () => ({ data: row }) }) };
      },
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/env", () => ({ getIntegrations: () => ({ r2: true, r2Public: true }), getEnv: () => ({}) }));
vi.mock("@/lib/settings", () => ({ getSetting: async () => 5 }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => null }));
vi.mock("@/lib/storage/r2", () => ({ presignDownload: (a) => presign(a), putObject: async () => {}, deleteObject: async () => {} }));

const { getReadableFile, getReadableFileUrl } = await import("@/lib/storage/uploads");
const { GET } = await import("@/app/api/files/[fileId]/route.js");

const ID = "3f0c1c3e-0000-4000-8000-000000000000";
const call = (id = ID, query = "") => GET(new Request(`https://app.example/api/files/${id}${query}`), { params: Promise.resolve({ fileId: id }) });
const file = (over = {}) => ({ id: ID, bucket: "private", storage_key: "post_attachment/u/f.webp", mime_type: "image/webp", original_name: "pic.webp", status: "ready", purpose: "post_attachment", ...over });

beforeEach(() => {
  row = file();
  presign.mockClear();
  selects.length = 0;
});

describe("authorisation comes first", () => {
  it("gives no URL, and signs nothing, when the database shows the caller nothing", async () => {
    row = null;
    expect(await getReadableFile(ID)).toBeNull();
    expect(await getReadableFileUrl(ID)).toBeNull();
    expect(presign).not.toHaveBeenCalled();
  });

  it("gives no URL for a file that is not ready (pending, deleted)", async () => {
    for (const status of ["pending", "deleted"]) {
      row = file({ status });
      expect(await getReadableFile(ID), status).toBeNull();
    }
    expect(presign).not.toHaveBeenCalled();
  });

  it("answers 404 for a stranger or a made-up id, without caching the refusal", async () => {
    row = null;
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    presign.mockClear();
    expect((await call("not-a-uuid")).status).toBe(404);
    expect(presign).not.toHaveBeenCalled();
  });

  it("never reads storage directly: the route only redirects to a signed URL", async () => {
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^https:\/\/storage\.example\/signed/);
  });
});

describe("how a private file may be kept", () => {
  it("lets the member's own browser keep an attachment image briefly, and no shared cache keep anything", async () => {
    const res = await call();
    const cc = res.headers.get("cache-control");
    expect(cc).toBe("private, max-age=120");
    expect(cc).not.toMatch(/public|s-maxage|immutable/);
    expect(res.headers.get("vary")).toBe("Cookie");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    // the picture itself gets one stable URL per window and the matching storage-side instruction
    expect(presign.mock.calls[0][0]).toMatchObject({ cacheControl: "private, max-age=300", signing: { windowSec: 300 } });
  });

  it("keeps the redirect for less time than the URL it points at is guaranteed to work", async () => {
    const { PRIVATE_SIGNING } = await import("@/lib/storage/cache");
    expect(120).toBeLessThan(PRIVATE_SIGNING.minValiditySec);
  });

  it("keeps identity documents out of every cache and signs them freshly, for two minutes", async () => {
    row = file({ purpose: "verification_document", mime_type: "image/jpeg", storage_key: "verification_document/u/f.jpg" });
    const res = await call();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(presign.mock.calls[0][0]).toMatchObject({ cacheControl: "private, no-store", expiresIn: 120 });
    expect(presign.mock.calls[0][0].signing).toBeUndefined();
  });

  it("treats a PDF as a document: fresh URL, nothing kept", async () => {
    row = file({ purpose: "message_attachment", mime_type: "application/pdf", storage_key: "message_attachment/u/f.pdf" });
    const res = await call();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(presign.mock.calls[0][0].signing).toBeUndefined();
  });

  it("reports storage trouble as 503 and keeps nothing", async () => {
    presign.mockRejectedValueOnce(new Error("down"));
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("download", () => {
  it("is the same check as opening: a stranger gets nothing, and nothing is signed", async () => {
    row = null;
    const res = await call(ID, "?download=1");
    expect(res.status).toBe(404);
    expect(presign).not.toHaveBeenCalled();
  });

  it("asks storage to answer as an attachment, with a usable name, and keeps nothing", async () => {
    const res = await call(ID, "?download=1");
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(presign.mock.calls[0][0]).toMatchObject({ disposition: "attachment", filename: "pic.webp", cacheControl: "private, no-store" });
    expect(presign.mock.calls[0][0].signing).toBeUndefined(); // a fresh URL, never the shared five-minute one
  });

  it("names a file that has no stored name from its id and type, never from the client", async () => {
    row = file({ original_name: null, mime_type: "application/pdf" });
    await call(ID, "?download=1");
    expect(presign.mock.calls[0][0].filename).toMatch(/^unisphere-3f0c1c3e\.pdf$/);
  });

  it("opens inline unless asked, and ignores any other value of the parameter", async () => {
    await call(ID);
    expect(presign.mock.calls[0][0].disposition).toBe("inline");
    presign.mockClear();
    await call(ID, "?download=yes");
    expect(presign.mock.calls[0][0].disposition).toBe("inline");
  });
});

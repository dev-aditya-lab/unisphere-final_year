import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({ isFlagEnabled: async () => true }));
vi.mock("@/lib/ai/usage", () => ({ logAiUsage: vi.fn() }));
vi.mock("@/lib/privacy/consent", () => ({ hasConsent: async () => true }));

const DIMS = 4;
// 8 values from a (pretend) 4096-dimension model: only the first DIMS may be kept.
const FULL = [3, 4, 0, 0, 9, 9, 9, 9];
const reply = (body, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

async function load(overrides = {}) {
  vi.resetModules();
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p".repeat(20),
    SUPABASE_SECRET_KEY: "s".repeat(20),
    AI_ENABLED: "true",
    NVIDIA_AI_API_KEY: "nv-key",
    NVIDIA_AI_BASE_URL: "https://nim.example/v1/",
    EMBEDDING_PROVIDER: "nvidia",
    EMBEDDING_MODEL: "nvidia/nemotron-3.5-embed-8b",
    EMBEDDING_DIMENSIONS: String(DIMS),
    EMBEDDING_BASE_URL: "",
    EMBEDDING_API_KEY: "",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) vi.stubEnv(k, v);
  return { env: await import("@/lib/env"), embeddings: await import("@/lib/ai/embeddings") };
}

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("NVIDIA embeddings", () => {
  it("is configured from NVIDIA_AI_API_KEY and its base URL when the EMBEDDING_* ones are empty", async () => {
    const { env } = await load();
    expect(env.getEmbeddingConfig()).toMatchObject({ provider: "nvidia", apiKey: "nv-key", baseUrl: "https://nim.example/v1/", model: "nvidia/nemotron-3.5-embed-8b" });
    expect(env.getIntegrations().embeddings).toBe(true);
  });

  it("lets EMBEDDING_API_KEY and EMBEDDING_BASE_URL override the NVIDIA ones", async () => {
    const { env } = await load({ EMBEDDING_API_KEY: "own-key", EMBEDDING_BASE_URL: "https://other.example/v1" });
    expect(env.getEmbeddingConfig()).toMatchObject({ apiKey: "own-key", baseUrl: "https://other.example/v1" });
  });

  it("stays off without any key", async () => {
    const { env } = await load({ NVIDIA_AI_API_KEY: "" });
    expect(env.getIntegrations().embeddings).toBe(false);
  });

  it("posts a passage for stored content and keeps only the leading values, re-normalised", async () => {
    const { embeddings } = await load();
    const fetchMock = reply({ data: [{ embedding: FULL }] });
    vi.stubGlobal("fetch", fetchMock);
    const res = await embeddings.embedText("food waste in hostels", { purpose: "document" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://nim.example/v1/embeddings");
    expect(init.headers.Authorization).toBe("Bearer nv-key");
    expect(JSON.parse(init.body)).toMatchObject({ model: "nvidia/nemotron-3.5-embed-8b", input: ["food waste in hostels"], input_type: "passage", truncate: "END" });
    expect(res).toMatchObject({ ok: true, model: "nvidia/nemotron-3.5-embed-8b" });
    expect(res.vector).toEqual([0.6, 0.8, 0, 0]); // [3,4,0,0] / 5
  });

  it("asks for a query embedding for searches", async () => {
    const { embeddings } = await load();
    const fetchMock = reply({ data: [{ embedding: FULL }] });
    vi.stubGlobal("fetch", fetchMock);
    await embeddings.embedText("hostel food", { purpose: "query" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input_type).toBe("query");
  });

  it("refuses a vector that is shorter than the column instead of padding it", async () => {
    const { embeddings } = await load();
    vi.stubGlobal("fetch", reply({ data: [{ embedding: [1, 2] }] }));
    expect(await embeddings.embedText("anything")).toEqual({ ok: false, code: "dimension_mismatch" });
  });

  it("does not retry a bad key, and reports it", async () => {
    const { embeddings } = await load();
    const fetchMock = reply({}, 401);
    vi.stubGlobal("fetch", fetchMock);
    expect(await embeddings.embedText("anything")).toMatchObject({ ok: false, code: "auth", permanent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after a gateway timeout, as the hosted 8B model sometimes needs", async () => {
    const { embeddings } = await load();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 504 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ embedding: FULL }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await embeddings.embedText("anything", { purpose: "document" });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports the configured model in its status", async () => {
    const { embeddings } = await load();
    expect(embeddings.embeddingStatus()).toEqual({ configured: true, provider: "nvidia", model: "nvidia/nemotron-3.5-embed-8b", dimensions: DIMS });
  });
});

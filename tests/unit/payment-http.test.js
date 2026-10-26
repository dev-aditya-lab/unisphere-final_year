import { afterEach, describe, expect, it, vi } from "vitest";
import { gatewayRequest } from "@/lib/payments/http";

const reply = (status, json) => vi.fn(async () => ({ ok: status < 400, status, json: async () => json }));

afterEach(() => vi.unstubAllGlobals());

describe("gatewayRequest", () => {
  it("sends JSON with a timeout and no caching, and returns the parsed body", async () => {
    const fetchMock = reply(200, { id: "ord_1" });
    vi.stubGlobal("fetch", fetchMock);
    const res = await gatewayRequest({ tag: "t", method: "POST", url: "https://pay.example/v1/orders", headers: { Authorization: "Basic x" }, body: { amount: 100 } });
    expect(res).toEqual({ ok: true, status: 200, data: { id: "ord_1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://pay.example/v1/orders");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", body: '{"amount":100}' });
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", Authorization: "Basic x" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("can send a form body instead", async () => {
    const fetchMock = reply(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await gatewayRequest({ tag: "t", method: "POST", url: "https://pay.example/v1/x", form: { a: "1", b: "x y" } });
    expect(fetchMock.mock.calls[0][1].body).toBe("a=1&b=x+y");
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("hides the provider's error from the member and keeps it for administrators and the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", reply(400, { error: { code: "BAD_REQUEST", description: "key kid_live_123 is not allowed" } }));
    const res = await gatewayRequest({ tag: "t", url: "https://pay.example/v1/x", describeError: (j) => ({ code: j.error.code, message: j.error.description }) });
    expect(res).toMatchObject({ ok: false, code: "provider_error", status: 400, providerMessage: "key kid_live_123 is not allowed" });
    expect(res.error).not.toMatch(/kid_live/);
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/kid_live/);
    log.mockRestore();
  });

  it("reports an unreachable gateway without throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await gatewayRequest({ tag: "t", url: "https://pay.example/v1/x" })).toMatchObject({ ok: false, code: "provider_unreachable" });
    log.mockRestore();
  });
});

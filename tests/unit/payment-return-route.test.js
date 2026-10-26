import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmReturn = vi.fn();
const limit = vi.fn();
vi.mock("@/lib/services/blue-tick", () => ({ confirmReturn: (...a) => confirmReturn(...a) }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: async () => "203.0.113.9", rateLimit: (...a) => limit(...a) }));
const { GET, POST } = await import("@/app/api/payments/return/route");

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const get = (qs = "") => GET(new Request(`http://localhost:3000/api/payments/return${qs}`));

beforeEach(() => {
  confirmReturn.mockReset();
  limit.mockReset();
  limit.mockResolvedValue({ ok: true });
});

describe("/api/payments/return", () => {
  it("looks the order up, asks for its state, and sends the member to the blue tick page with a GET", async () => {
    confirmReturn.mockResolvedValue("done");
    const res = await get(`?o=${ID.toUpperCase()}`);
    expect(res.status).toBe(303);
    expect(confirmReturn).toHaveBeenCalledWith(ID);
    expect(new URL(res.headers.get("location")).pathname + new URL(res.headers.get("location")).search).toBe("/settings/blue-tick?payment=done");
  });

  it("keeps the order reference on the page while the payment is still unconfirmed, so 'check again' works", async () => {
    for (const state of ["pending", "error"]) {
      confirmReturn.mockResolvedValueOnce(state);
      const loc = new URL((await get(`?o=${ID}`)).headers.get("location"));
      expect(loc.searchParams.get("payment")).toBe("pending");
      expect(loc.searchParams.get("o")).toBe(ID);
    }
  });

  it("maps every other state to a message, or to none", async () => {
    const expected = { done: "done", duplicate: "duplicate", failed: "failed", refunded: null, unknown: null, surprise: null };
    for (const [state, notice] of Object.entries(expected)) {
      confirmReturn.mockResolvedValueOnce(state);
      const loc = new URL((await get(`?o=${ID}`)).headers.get("location"));
      expect(loc.searchParams.get("payment"), state).toBe(notice);
    }
  });

  it("also accepts the member being sent back with a POST, which carries no cookies", async () => {
    confirmReturn.mockResolvedValue("done");
    const res = await POST(new Request(`http://localhost:3000/api/payments/return?o=${ID}`, { method: "POST", body: "status=success" }));
    expect(res.status).toBe(303);
    expect(confirmReturn).toHaveBeenCalledWith(ID);
  });

  it("ignores anything that is not a plain order id, and never redirects off the site", async () => {
    for (const qs of ["", "?o=", "?o=1", "?o=https://evil.example", `?o=${ID}%20x`, "?o=../../x", `?next=https://evil.example&o=nope`]) {
      const res = await get(qs);
      expect(res.status, qs).toBe(303);
      expect(new URL(res.headers.get("location")).origin).toBe("http://localhost:3000");
      expect(new URL(res.headers.get("location")).pathname).toBe("/settings/blue-tick");
    }
    expect(confirmReturn).not.toHaveBeenCalled();
  });

  it("does not ask the gateway anything for a source that is over the limit", async () => {
    limit.mockResolvedValue({ ok: false });
    const res = await get(`?o=${ID}`);
    expect(res.status).toBe(303);
    expect(confirmReturn).not.toHaveBeenCalled();
  });
});

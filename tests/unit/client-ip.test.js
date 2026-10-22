import { describe, expect, it } from "vitest";
import { clientIpFrom } from "@/lib/rate-limit";

describe("clientIpFrom (rate-limit identity)", () => {
  it("takes the address the trusted proxy appended, not the one the client claimed", () => {
    // The client sent "1.2.3.4" itself; the proxy appended the connection's real address.
    expect(clientIpFrom("1.2.3.4, 203.0.113.9", null, 1)).toBe("203.0.113.9");
  });

  it("rotating the spoofed entry does not change the identity", () => {
    const a = clientIpFrom("9.9.9.9, 203.0.113.9", null, 1);
    const b = clientIpFrom("8.8.8.8, 203.0.113.9", null, 1);
    expect(a).toBe(b);
  });

  it("counts hops from the right when more than one proxy is in front", () => {
    expect(clientIpFrom("6.6.6.6, 198.51.100.7, 172.16.0.1", null, 2)).toBe("198.51.100.7");
  });

  it("works for a single value (Vercel overwrites the header)", () => {
    expect(clientIpFrom("198.51.100.7", null, 1)).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientIpFrom(null, "198.51.100.8", 1)).toBe("198.51.100.8");
    expect(clientIpFrom("", "", 1)).toBe("unknown");
  });

  it("never reads past the start of a short chain and bounds the length", () => {
    expect(clientIpFrom("198.51.100.7", null, 3)).toBe("198.51.100.7");
    expect(clientIpFrom("x".repeat(500), null, 1).length).toBe(64);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: () => ({}), getIntegrations: () => ({ r2: false }) }));

const { contentDisposition } = await import("@/lib/storage/r2");

describe("the Content-Disposition storage is asked to send", () => {
  it("makes a download an attachment and a view inline", () => {
    expect(contentDisposition("attachment", "notes.pdf")).toBe('attachment; filename="notes.pdf"');
    expect(contentDisposition("inline", "pic.png")).toBe('inline; filename="pic.png"');
    expect(contentDisposition("inline", null)).toBeUndefined();
  });

  it("never lets a quote, slash, newline or control character into the header", () => {
    for (const name of ['a"b.pdf', "a\r\nSet-Cookie: x=1.pdf", "../../etc/passwd", "a\u0000b.pdf", "x;y=z.pdf", "ünï.pdf"]) {
      const value = contentDisposition("attachment", name);
      expect(value, name).toMatch(/^attachment; filename="[\w. -]*"$/);
      expect(value).not.toMatch(/[\r\n"].*[\r\n]|\.\.\//);
    }
  });

  it("falls back to a neutral name and bounds the length", () => {
    expect(contentDisposition("attachment", "")).toBe('attachment; filename="download"');
    expect(contentDisposition("attachment", "a".repeat(500)).length).toBeLessThan(160);
  });

  it("treats an unknown disposition as inline", () => {
    expect(contentDisposition("something-else", "x.png")).toMatch(/^inline;/);
  });
});

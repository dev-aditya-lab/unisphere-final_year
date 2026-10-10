import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

describe("safeNext", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNext("/feed")).toBe("/feed");
    expect(safeNext("/settings/profile?tab=x#photo")).toBe("/settings/profile?tab=x#photo");
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "feed",
    "",
    "/ok\nSet-Cookie: a=b",
    `/${"a".repeat(600)}`,
    null,
    undefined,
    42,
  ])("falls back for unsafe target %j", (input) => {
    expect(safeNext(input, "/fallback")).toBe("/fallback");
  });
});

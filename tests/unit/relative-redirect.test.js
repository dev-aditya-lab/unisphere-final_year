import { describe, expect, it } from "vitest";
import { redirectToPath } from "@/lib/security/relative-redirect";

// Behind a proxy, `new URL(request.url).origin` is the server's own address (https://localhost:10000), not the public
// domain. Auth links (reset password, confirm email) must therefore redirect with a relative Location header.
describe("redirectToPath", () => {
  it("answers with a relative Location, never an origin", () => {
    const res = redirectToPath("/reset-password");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/reset-password");
  });

  it("keeps the query string", () => {
    expect(redirectToPath("/login?next=%2Ffeed&error=profile_missing").headers.get("location")).toBe("/login?next=%2Ffeed&error=profile_missing");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.example/", "//evil.example/", "evil.example", "", null, undefined]) {
      expect(() => redirectToPath(bad), String(bad)).toThrow();
    }
  });
});

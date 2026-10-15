import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isProtectedPath } from "@/lib/routes";

describe("route classification (closed network)", () => {
  it("keeps only the explanatory and sign-in pages open to logged-out visitors", () => {
    for (const p of ["/", "/about", "/features", "/faq", "/guidelines", "/content-policy", "/copyright-policy", "/brand-policy", "/accessibility", "/cookies", "/privacy", "/terms", "/contact", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/auth/confirm", "/maintenance", "/.well-known/assetlinks.json"]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
  });
  it("protects everything that holds member content, including pages that used to be public", () => {
    for (const p of ["/feed", "/u/someone", "/posts/a-post", "/ideas/an-idea", "/projects/a-project", "/events/an-event", "/communities/a-club", "/roadmap", "/changelog", "/feedback", "/settings/profile", "/admin", "/search", "/some/future/page"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });
  it("bounces signed-in members away from the sign-in pages only", () => {
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/register")).toBe(true);
    expect(isGuestOnlyPath("/about")).toBe(false);
  });
});

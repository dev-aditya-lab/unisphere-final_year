import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isProtectedPath } from "@/lib/routes";

describe("route classification (closed network)", () => {
  it("keeps only the explanatory and sign-in pages open to logged-out visitors", () => {
    for (const p of ["/", "/about", "/features", "/faq", "/guidelines", "/content-policy", "/copyright-policy", "/brand-policy", "/accessibility", "/cookies", "/pricing", "/refund-policy", "/shipping-policy", "/privacy", "/terms", "/contact", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/auth/confirm", "/maintenance", "/.well-known/assetlinks.json"]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
  });
  it("protects everything that holds member content, including pages that used to be public", () => {
    for (const p of ["/feed", "/u/someone", "/posts/a-post", "/ideas/an-idea", "/projects/a-project", "/events/an-event", "/communities/a-club", "/roadmap", "/changelog", "/feedback", "/settings/profile", "/admin", "/search", "/some/future/page"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });
  it("opens the Academy's catalogue, policies and certificate checks, and nothing that buys, learns or administers", () => {
    for (const p of ["/academy", "/academy/courses", "/academy/courses/full-stack-web", "/academy/programs/x", "/academy/internships", "/academy/mentorship", "/academy/pricing", "/academy/verify", "/academy/verify/US-2026-WD-00142"]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
    for (const p of ["/academy/dashboard", "/academy/my-learning", "/academy/learn/abc", "/academy/checkout/full-stack-web", "/academy/payments", "/academy/certificates", "/academy/assignments", "/academy/profile", "/academy/admin", "/academy/admin/orders", "/academy/some-new-page"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });
  it("bounces signed-in members away from the sign-in pages only", () => {
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/register")).toBe(true);
    expect(isGuestOnlyPath("/about")).toBe(false);
  });
});

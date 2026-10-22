import { describe, expect, it } from "vitest";
import { canShowPromptNow, isPromptRouteAllowed, isTypingTarget } from "@/lib/referrals/prompt-policy";

const quiet = { pathname: "/feed", visible: true, modalOpen: false, typing: false, composing: false, sessionShown: false };

describe("where the reminder may appear", () => {
  it("is allowed on ordinary reading pages", () => {
    for (const p of ["/feed", "/explore", "/projects", "/events", "/u/someone", "/posts/a-post", "/colleges"]) expect(isPromptRouteAllowed(p), p).toBe(true);
  });

  it("never interrupts messaging, creating or editing, sign-in flows, settings, privacy, or Refer & Earn itself", () => {
    for (const p of ["/messages", "/messages/abc", "/onboarding", "/privacy-review", "/privacy-requests", "/delete-account", "/settings/notifications", "/feedback", "/referrals", "/referrals/leaderboard", "/orbits", "/orbits/history", "/projects/new", "/ideas/new", "/events/x/edit", "/posts/compose", "/projects/x/manage", "/admin", "/suspended"]) {
      expect(isPromptRouteAllowed(p), p).toBe(false);
    }
    expect(isPromptRouteAllowed("/feedback-wall")).toBe(true); // a prefix match is a path-segment match
  });
});

describe("a quiet moment", () => {
  it("needs a visible tab, no other dialog, nobody typing, and a fresh session", () => {
    expect(canShowPromptNow(quiet)).toBe(true);
    expect(canShowPromptNow({ ...quiet, visible: false })).toBe(false);
    expect(canShowPromptNow({ ...quiet, modalOpen: true })).toBe(false);
    expect(canShowPromptNow({ ...quiet, typing: true })).toBe(false);
    expect(canShowPromptNow({ ...quiet, composing: true })).toBe(false);
    expect(canShowPromptNow({ ...quiet, sessionShown: true })).toBe(false);
  });

  it("follows the route: the same page state is fine on /feed and refused after navigating to /messages", () => {
    expect(canShowPromptNow({ ...quiet, pathname: "/feed" })).toBe(true);
    expect(canShowPromptNow({ ...quiet, pathname: "/messages/123" })).toBe(false);
    expect(canShowPromptNow({ ...quiet, pathname: "/feed" })).toBe(true); // a decision is made fresh each time, nothing is remembered
  });

  it("recognises fields people type into", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

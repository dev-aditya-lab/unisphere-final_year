import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";
import { parseSubscription } from "@/lib/services/push";

const keys = { p256dh: "BPk", auth: "abc" };

describe("push endpoint allow-list (SSRF guard)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QGx",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(true));

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://127.0.0.1/hook",
    "https://localhost:3000/api/health",
    "https://169.254.169.254/latest/meta-data/",
    "https://internal.service.local/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilfcm.googleapis.com.example.org/x",
    "https://notfcm.googleapis.com@evil.example/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://evil.example/?u=fcm.googleapis.com",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(false));

  it("is enforced when a subscription is parsed", () => {
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "https://169.254.169.254/latest", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/" + "a".repeat(1300), keys })).toBeNull();
  });
});

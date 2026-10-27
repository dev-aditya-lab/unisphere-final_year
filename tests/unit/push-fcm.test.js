import { describe, expect, it } from "vitest";
import { buildFcmMessage, classifyFcmFailure, parseServiceAccount } from "@/lib/push-fcm";

const key = { type: "service_account", project_id: "unisphere-test", client_email: "firebase-adminsdk@unisphere-test.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n" };

describe("the Firebase key in the environment", () => {
  it("reads the downloaded JSON, or the same JSON base64-encoded", () => {
    const expected = { project_id: key.project_id, client_email: key.client_email, private_key: key.private_key };
    expect(parseServiceAccount(JSON.stringify(key))).toEqual(expected);
    expect(parseServiceAccount(Buffer.from(JSON.stringify(key)).toString("base64"))).toEqual(expected);
    expect(parseServiceAccount(`  ${JSON.stringify(key)}\n`)).toEqual(expected);
  });

  it.each([
    ["nothing", undefined],
    ["an empty string", "  "],
    ["text that is not JSON", "not json"],
    ["a key without a private key", JSON.stringify({ ...key, private_key: undefined })],
    ["a private key that is not a key", JSON.stringify({ ...key, private_key: "hello" })],
    ["an email address that is not one", JSON.stringify({ ...key, client_email: "nope" })],
    ["a project id that could change the request address", JSON.stringify({ ...key, project_id: "x/../evil" })],
    ["a project id with capitals", JSON.stringify({ ...key, project_id: "My-Project" })],
  ])("is not used when it is %s", (_why, raw) => {
    expect(parseServiceAccount(raw)).toBeNull();
  });
});

describe("the message sent to a phone", () => {
  const payload = { title: "UniSphere", body: "Asha reacted to your post", url: "/posts/my-post", tag: "reaction:1", category: "social" };

  it("is a notification the system shows itself, with the page to open in its data", () => {
    const { message } = buildFcmMessage("tok", payload);
    expect(message.token).toBe("tok");
    expect(message.notification).toEqual({ title: "UniSphere", body: "Asha reacted to your post" });
    expect(message.data).toEqual({ origin: "unisphere", url: "/posts/my-post" });
    expect(message.android.notification).toEqual({ channelId: "social", tag: "reaction:1" });
    expect(message.android.ttl).toBe("3600s");
  });

  it("wakes the phone at once only for a direct message", () => {
    expect(buildFcmMessage("t", { ...payload, category: "messages" }).message.android.priority).toBe("HIGH");
    expect(buildFcmMessage("t", { ...payload, category: "messages" }).message.android.notification.channelId).toBe("messages");
    expect(buildFcmMessage("t", { ...payload, category: "events" }).message.android.priority).toBe("NORMAL");
    expect(buildFcmMessage("t", { ...payload, category: undefined }).message.android.notification.channelId).toBe("updates");
  });

  it("also wakes the phone at once for the member's own test", () => {
    expect(buildFcmMessage("t", { ...payload, category: "updates", urgent: true }).message.android.priority).toBe("HIGH");
    expect(buildFcmMessage("t", { ...payload, category: "updates", urgent: "yes" }).message.android.priority).toBe("NORMAL");
  });

  it.each(["https://evil.example/x", "//evil.example", "javascript:alert(1)", "/a\\b", "", undefined, 42])("only ever opens a page on this site: %s becomes the notifications page", (url) => {
    expect(buildFcmMessage("t", { ...payload, url }).message.data.url).toBe("/notifications");
  });

  it("keeps the title and text a sensible length and leaves the tag off when there is none", () => {
    const { message } = buildFcmMessage("t", { ...payload, title: "T".repeat(200), body: "B".repeat(500), tag: "" });
    expect(message.notification.title).toHaveLength(80);
    expect(message.notification.body).toHaveLength(200);
    expect(message.android.notification).toEqual({ channelId: "social" });
  });

  it("only carries strings in data, which is all FCM accepts", () => {
    for (const value of Object.values(buildFcmMessage("t", payload).message.data)) expect(typeof value).toBe("string");
  });

  it("never uses a data key FCM reserves: Google rejects the whole message for one", () => {
    // From Google's HTTP v1 reference: a data key must not be "from", "message_type", or start with "google" or "gcm". (This test exists
    // because a key called `from` made every notification fail with "Invalid data payload key: from", which only Google could tell us.)
    const reserved = /^(from|message_type)$|^(google|gcm)/i;
    for (const key of Object.keys(buildFcmMessage("t", payload).message.data)) expect(key, key).not.toMatch(reserved);
  });
});

describe("what a failed send means", () => {
  const fcmError = (status, errorCode, extra = {}) => [status, { error: { code: status, status: extra.status, details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }, ...(extra.details ?? [])] } }];

  it("deletes a device only when Google says the token is dead", () => {
    expect(classifyFcmFailure(...fcmError(404, "UNREGISTERED"))).toBe("gone");
    const badToken = { details: [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "message.token", description: "invalid" }] }] };
    expect(classifyFcmFailure(400, { error: { status: "INVALID_ARGUMENT", ...badToken } })).toBe("gone");
  });

  it("never blames the devices for a wrong project, key or permission, or one wrong setting would delete everyone", () => {
    expect(classifyFcmFailure(404, { error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found." } })).toBe("config");
    expect(classifyFcmFailure(401, { error: { status: "UNAUTHENTICATED" } })).toBe("config");
    expect(classifyFcmFailure(403, { error: { status: "PERMISSION_DENIED" } })).toBe("config");
    expect(classifyFcmFailure(...fcmError(403, "SENDER_ID_MISMATCH"))).toBe("config");
  });

  it("treats Google being busy as a lost notification, not a bad token", () => {
    expect(classifyFcmFailure(429, { error: { status: "RESOURCE_EXHAUSTED" } })).toBe("retry");
    expect(classifyFcmFailure(503, null)).toBe("retry");
    expect(classifyFcmFailure(...fcmError(500, "INTERNAL"))).toBe("retry");
    expect(classifyFcmFailure(...fcmError(503, "UNAVAILABLE"))).toBe("retry");
  });

  it("counts anything else against the token", () => {
    expect(classifyFcmFailure(400, { error: { status: "INVALID_ARGUMENT" } })).toBe("failed");
    expect(classifyFcmFailure(418, undefined)).toBe("failed");
  });
});

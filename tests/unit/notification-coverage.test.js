import { describe, expect, it } from "vitest";
import { NOTIFICATION_CATEGORIES, IN_APP_ONLY_CATEGORIES, describeNotification, notificationCategory } from "@/lib/notification-text";
import { PUSH_CHANNELS, channelForCategory } from "@/lib/push-channels";
import { emittedNotificationTypes } from "../helpers/notification-types.js";

/**
 * The guard for "every feature notifies properly" (docs/NOTIFICATIONS.md): whatever notification type the code can create must have a
 * category the member can switch, a sentence to show, a page to open and an Android channel. A new type added without one fails here.
 */
const types = emittedNotificationTypes();
const DEFAULT_TEXT = "You have a new notification";
const categories = NOTIFICATION_CATEGORIES.map((c) => c.value);

describe("every notification type the code can create", () => {
  it("is found (so this guard cannot silently check nothing)", () => {
    expect(types.size).toBeGreaterThan(40);
    for (const known of ["message", "reaction", "event_reminder", "announcement", "moderation_blue_tick", "referral_campaign", "channel_mention"]) {
      expect(types.has(known), known).toBe(true);
    }
  });

  it.each([...types.keys()].sort())("%s has its own text and a page to open", (type) => {
    const { text, href } = describeNotification({ type, data: { title: "T", slug: "s", name: "N", event: "approved" }, entity_id: "00000000-0000-4000-8000-000000000001" }, "Asha");
    expect(text, `no text case for "${type}" in lib/notification-text.js`).not.toBe(DEFAULT_TEXT);
    expect(text).toBeTruthy();
    expect(href).toMatch(/^\/[^/]/);
  });

  it.each([...types.keys()].sort())("%s belongs to a category the member can switch", (type) => {
    const category = notificationCategory(type);
    expect(categories, `"${type}" maps to "${category}", which has no switch in Settings > Notifications`).toContain(category);
  });
});

describe("categories and Android channels", () => {
  it("gives every category an explicit channel, and every channel exists", () => {
    const channelIds = PUSH_CHANNELS.map((c) => c.id);
    for (const category of categories) {
      const channel = channelForCategory(category);
      expect(channelIds, category).toContain(channel);
    }
  });

  it("puts messages alone on the channel that pops up", () => {
    expect(channelForCategory("messages")).toBe("messages");
    for (const category of categories.filter((c) => c !== "messages")) expect(channelForCategory(category), category).not.toBe("messages");
    expect(PUSH_CHANNELS.find((c) => c.id === "messages").importance).toBeGreaterThanOrEqual(4);
  });

  it("keeps Offers & invitations in the bell only", () => {
    expect([...IN_APP_ONLY_CATEGORIES]).toEqual(["promotions"]);
  });
});

describe("the lock screen", () => {
  it("never shows more than a sentence: no snippet, message or reason leaks into it", () => {
    const secret = "my-password-hunter2";
    for (const type of types.keys()) {
      const { text } = describeNotification({ type, data: { snippet: secret, message: secret, reason: secret, change: secret, note: secret, response: secret }, entity_id: "00000000-0000-4000-8000-000000000001" }, "Asha");
      expect(text, type).not.toContain(secret);
    }
  });
});

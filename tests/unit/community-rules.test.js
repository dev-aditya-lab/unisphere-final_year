import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/ai", () => ({ runAiTask: async () => ({}) }));
vi.mock("@/lib/settings", () => ({ getSetting: async () => null }));

import { CHANNEL_TYPES, PERMISSIONS, ROLES, ROLE_RANK, cleanName, roleAtLeast, roleCan } from "@/lib/community/rules";
import { mapRpcError } from "@/lib/services/community-workspace";
import { channelSchema, communityDetailsSchema, inviteCode, inviteSchema, moderateSchema, reportSchema, sendMessageSchema } from "@/lib/validators/community-workspace";
import { describeNotification } from "@/lib/notification-text";

const uuid = () => crypto.randomUUID();

describe("roles", () => {
  it("rank in a strict order, and every role holds everything below it", () => {
    expect(ROLES.map((r) => ROLE_RANK[r])).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < ROLES.length; i++) for (const p of PERMISSIONS[ROLES[i - 1]]) expect(PERMISSIONS[ROLES[i]].has(p), `${ROLES[i]} lacks ${p}`).toBe(true);
  });

  it("keeps the powerful permissions where they belong", () => {
    expect(roleCan("member", "messages.moderate")).toBe(false);
    expect(roleCan("moderator", "channels.manage")).toBe(false);
    expect(roleCan("moderator", "members.ban")).toBe(false);
    expect(roleCan("admin", "roles.manage")).toBe(false);
    expect(roleCan("admin", "community.transfer")).toBe(false);
    expect(roleCan("owner", "community.transfer")).toBe(true);
    expect(roleCan(undefined, "channels.view")).toBe(false);
    expect(roleAtLeast("admin", "moderator")).toBe(true);
    expect(roleAtLeast("member", "moderator")).toBe(false);
  });

  it("gives a staff channel a view role above ordinary members", () => {
    const staff = CHANNEL_TYPES.find((t) => t.value === "staff");
    expect(staff.view).not.toBe("member");
    expect(CHANNEL_TYPES.find((t) => t.value === "announcements").post).not.toBe("member");
  });
});

describe("database error mapping", () => {
  it("turns known codes into messages a person can read, with the right HTTP status", () => {
    expect(mapRpcError({ message: "forbidden" })).toMatchObject({ code: "forbidden", status: 403 });
    expect(mapRpcError({ message: "not_found" })).toMatchObject({ status: 404 });
    expect(mapRpcError({ message: "rate_limited" })).toMatchObject({ status: 429 });
    expect(mapRpcError({ message: "read_only" })).toMatchObject({ code: "read_only", status: 403 });
    expect(mapRpcError({ message: "invite_invalid" })).toMatchObject({ status: 400 });
    expect(mapRpcError({ message: "slow_mode:12" })).toMatchObject({ code: "slow_mode", status: 429, retryAfter: 12 });
  });

  it("never leaks SQL or internals", () => {
    const e = mapRpcError({ message: 'insert or update on table "channel_messages" violates foreign key constraint "x"', code: "23503" });
    expect(e.message).toBe("Something went wrong. Please try again.");
    expect(JSON.stringify(e)).not.toMatch(/channel_messages|constraint/);
  });
});

describe("validation", () => {
  it("accepts a sensible message and refuses oversized, malformed or over-attached ones", () => {
    const ok = { body: "hi", fileIds: [], clientOpId: uuid() };
    expect(sendMessageSchema.safeParse(ok).success).toBe(true);
    expect(sendMessageSchema.safeParse({ ...ok, body: "x".repeat(4001) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ ...ok, fileIds: Array.from({ length: 6 }, uuid) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ ...ok, fileIds: ["not-a-uuid"] }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ ...ok, clientOpId: "x" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ ...ok, extra: "ignored" }).data.extra).toBeUndefined();
  });

  it("refuses control characters and odd values in names, topics and slow mode", () => {
    const base = { name: "general", type: "text" };
    expect(channelSchema.safeParse(base).success).toBe(true);
    expect(channelSchema.safeParse({ ...base, name: "bad\u0000name" }).success).toBe(false);
    expect(channelSchema.safeParse({ ...base, name: "x".repeat(41) }).success).toBe(false);
    expect(channelSchema.safeParse({ ...base, type: "voice" }).success).toBe(false);
    expect(channelSchema.safeParse({ ...base, minViewRole: "owner" }).success).toBe(false);
    expect(channelSchema.safeParse({ ...base, slowModeSeconds: 7 }).success).toBe(false);
    const details = { name: "Robotics", kind: "club", visibility: "public", joinPolicy: "open", topics: ["coding"] };
    expect(communityDetailsSchema.safeParse(details).success).toBe(true);
    expect(communityDetailsSchema.safeParse({ ...details, topics: ["Bad Topic!"] }).success).toBe(false);
    expect(communityDetailsSchema.safeParse({ ...details, topics: Array.from({ length: 9 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  it("accepts only well-formed invitation codes", () => {
    expect(inviteCode.safeParse("0123456789abcdef01234567").success).toBe(true);
    for (const bad of ["", "short", "0123456789abcdef0123456", "0123456789abcdef012345678", "0123456789abcdef0123456g", "../../etc/passwd0000000"]) expect(inviteCode.safeParse(bad).success, bad).toBe(false);
    expect(inviteSchema.safeParse({ communityId: uuid(), hours: 100000 }).success).toBe(false);
    expect(inviteSchema.safeParse({ communityId: uuid(), hours: 24, maxUses: 5000 }).success).toBe(false);
    expect(inviteSchema.safeParse({ communityId: uuid(), hours: 24, maxUses: 0 }).data.maxUses).toBeNull();
  });

  it("limits moderation durations and reasons", () => {
    const base = { communityId: uuid(), userId: uuid(), action: "timeout", hours: 24 };
    expect(moderateSchema.safeParse(base).success).toBe(true);
    expect(moderateSchema.safeParse({ ...base, hours: 673 }).success).toBe(false);
    expect(moderateSchema.safeParse({ ...base, action: "delete_account" }).success).toBe(false);
    expect(moderateSchema.safeParse({ ...base, reason: "x".repeat(1001) }).success).toBe(false);
    expect(reportSchema.safeParse({ communityId: uuid(), targetType: "channel_message", targetId: uuid(), category: "harassment" }).success).toBe(true);
    expect(reportSchema.safeParse({ communityId: uuid(), targetType: "channel_message", targetId: uuid(), category: "nonsense" }).success).toBe(false);
  });

  it("cleans names without losing words", () => {
    expect(cleanName("  project   help \u0007 ")).toBe("project help");
  });
});

describe("notification text and links", () => {
  const channel = uuid();
  const msg = uuid();

  it("never contains what was written, and links only to our own pages", () => {
    const n = describeNotification({ type: "channel_mention", entity_id: channel, data: { community: "robotics", community_name: "Robotics", channel: "general", message: msg } }, "Asha");
    expect(n.text).toBe("Asha mentioned you in Robotics");
    expect(n.href).toBe(`/communities/robotics/channels/${channel}?m=${msg}`);
  });

  it("refuses a link built from tampered data", () => {
    for (const data of [{ community: "../admin", message: msg }, { community: "https://evil.example", message: msg }, { community: "ok", message: "javascript:alert(1)" }]) {
      const n = describeNotification({ type: "channel_reply", entity_id: channel, data }, "X");
      expect(n.href).not.toMatch(/javascript|evil|\.\./);
      expect(n.href.startsWith("/communities")).toBe(true);
    }
    expect(describeNotification({ type: "channel_announcement", entity_id: "not-a-uuid", data: { community: "ok" } }).href).toBe("/communities");
  });

  it("describes moderation outcomes with the reason only in the detail line", () => {
    const n = describeNotification({ type: "moderation_community_action", data: { name: "Robotics", slug: "robotics", action: "timeout", reason: "Rude replies" } });
    expect(n.text).toBe("You were timed out in Robotics");
    expect(n.detail).toBe("Rude replies");
    expect(n.text).not.toContain("Rude");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser } from "../helpers/supabase.js";

/**
 * Migration 20260142000050: limits the settings pages rely on are enforced by the database as well, for anyone who calls
 * the API directly instead of using the pages.
 */

let a;
beforeAll(async () => {
  a = await createUser("guard-a");
});
afterAll(cleanupUsers);

const achievement = (i) => ({ user_id: a.id, title: `Award number ${i}` });
const experience = (i) => ({ user_id: a.id, kind: "work", title: `Role ${i}`, organization: "Org" });

describe("profile lists have a ceiling", () => {
  it("allows 30 achievements and refuses the 31st, even from parallel requests", async () => {
    const rows = Array.from({ length: 28 }, (_, i) => achievement(i));
    expect((await a.client.from("profile_achievements").insert(rows)).error).toBeNull();
    const results = await Promise.all([a.client.from("profile_achievements").insert(achievement(100)), a.client.from("profile_achievements").insert(achievement(101)), a.client.from("profile_achievements").insert(achievement(102))]);
    expect(results.filter((r) => r.error === null)).toHaveLength(2);
    expect(results.find((r) => r.error)?.error.message).toMatch(/limit_reached/);
    const { count } = await admin.from("profile_achievements").select("id", { count: "exact", head: true }).eq("user_id", a.id);
    expect(count).toBe(30);
  });

  it("allows 20 experiences and refuses the 21st", async () => {
    expect((await a.client.from("profile_experiences").insert(Array.from({ length: 20 }, (_, i) => experience(i)))).error).toBeNull();
    const over = await a.client.from("profile_experiences").insert(experience(99));
    expect(over.error?.message).toMatch(/limit_reached/);
  });

  it("is per member: another member is not affected", async () => {
    const b = await createUser("guard-b");
    expect((await b.client.from("profile_achievements").insert({ user_id: b.id, title: "Mine" })).error).toBeNull();
  });
});

describe("profile fields keep their shape", () => {
  const set = (patch) => a.client.from("profiles").update(patch).eq("id", a.id);

  it("tag items are short and not blank", async () => {
    expect((await set({ skills: ["x".repeat(41)] })).error?.code).toBe("23514");
    expect((await set({ interests: ["   "] })).error?.code).toBe("23514");
    expect((await set({ preferred_roles: [""] })).error?.code).toBe("23514");
    expect((await set({ skills: ["Python", "Public speaking"] })).error).toBeNull();
  });

  it("social links hold only LinkedIn and X addresses over http(s)", async () => {
    expect((await set({ social_links: { linkedin: "javascript:alert(1)" } })).error?.code).toBe("23514");
    expect((await set({ social_links: { myspace: "https://example.com" } })).error?.code).toBe("23514");
    expect((await set({ social_links: { twitter: 5 } })).error?.code).toBe("23514");
    expect((await set({ social_links: { linkedin: `https://example.com/${"a".repeat(300)}` } })).error?.code).toBe("23514");
    expect((await set({ social_links: { linkedin: "https://www.linkedin.com/in/me", twitter: "https://x.com/me" } })).error).toBeNull();
    expect((await set({ social_links: {} })).error).toBeNull();
  });

  it("'My college' visibility needs a college", async () => {
    const nobody = await createUser("guard-nocollege", { collegeId: null });
    const { error } = await nobody.client.from("profiles").update({ visibility: "college" }).eq("id", nobody.id);
    expect(error?.message).toMatch(/college_required/);
  });

  it("removing the last college while 'My college' is chosen falls back to connections only, and does not fail", async () => {
    const x = await createUser("guard-fallback");
    expect((await x.client.from("profiles").update({ visibility: "college" }).eq("id", x.id)).error).toBeNull();
    expect((await admin.from("profiles").update({ college_id: null }).eq("id", x.id)).error).toBeNull();
    const row = (await admin.from("profiles").select("visibility, college_id").eq("id", x.id).single()).data;
    expect(row).toEqual({ visibility: "connections", college_id: null });
  });
});

describe("account-safety notifications cannot be switched off", () => {
  it("keeps the moderation category on, however the row is written", async () => {
    expect((await a.client.from("notification_preferences").insert({ user_id: a.id, category: "moderation", in_app: false, email: false })).error).toBeNull();
    let row = (await admin.from("notification_preferences").select("in_app, email").eq("user_id", a.id).eq("category", "moderation").single()).data;
    expect(row).toEqual({ in_app: true, email: false });
    expect((await a.client.from("notification_preferences").update({ in_app: false }).eq("user_id", a.id).eq("category", "moderation")).error).toBeNull();
    row = (await admin.from("notification_preferences").select("in_app").eq("user_id", a.id).eq("category", "moderation").single()).data;
    expect(row.in_app).toBe(true);
  });

  it("other categories can still be switched off", async () => {
    expect((await a.client.from("notification_preferences").insert({ user_id: a.id, category: "social", in_app: false, email: false })).error).toBeNull();
    const row = (await admin.from("notification_preferences").select("in_app").eq("user_id", a.id).eq("category", "social").single()).data;
    expect(row.in_app).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAlreadyThere } from "@/lib/native/foreground";

// Per-category In app / Push / Email switches, against a fake table; the real storage rules are in tests/integration/notification-controls.test.js.
const db = { rows: [], noPushColumn: false, log: [] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: (columns) => ({
        eq: async () => {
          if (db.noPushColumn && columns.includes("push")) return { data: null, error: { code: "42703", message: 'column "push" does not exist' } };
          return { data: db.rows, error: null };
        },
      }),
      update: (values) => {
        const filters = {};
        const q = { eq: (c, v) => ((filters[c] = v), q), select: async () => {
          if (db.noPushColumn && "push" in values) return { data: null, error: { code: "PGRST204", message: "Could not find the 'push' column" } };
          db.log.push({ op: "update", values, filters });
          const hit = db.rows.find((r) => r.category === filters.category);
          if (hit) Object.assign(hit, values);
          return { data: hit ? [{ category: hit.category }] : [], error: null };
        } };
        return q;
      },
      insert: async (row) => {
        db.log.push({ op: "insert", row });
        db.rows.push(row);
        return { error: null };
      },
    }),
  }),
}));

const { getPreferences, savePreferences } = await import("@/lib/services/notifications");
const byCategory = (list, category) => list.find((p) => p.value === category);

beforeEach(() => {
  Object.assign(db, { rows: [], noPushColumn: false, log: [] });
});

describe("reading the switches", () => {
  it("starts every kind with the bell and the phone on, and email only where it helps", async () => {
    const prefs = await getPreferences("u1");
    expect(byCategory(prefs, "social")).toMatchObject({ in_app: true, push: true, email: false });
    expect(byCategory(prefs, "events")).toMatchObject({ in_app: true, push: true, email: true });
  });

  it("shows what the member chose, per kind", async () => {
    db.rows = [{ category: "social", in_app: true, email: false, push: false }, { category: "messages", in_app: true, email: false, push: true }];
    const prefs = await getPreferences("u1");
    expect(byCategory(prefs, "social").push).toBe(false);
    expect(byCategory(prefs, "messages").push).toBe(true);
  });

  it("shows Offers & invitations as never pushed, and Moderation as always in the bell", async () => {
    db.rows = [{ category: "promotions", in_app: true, email: false, push: true }, { category: "moderation", in_app: false, email: false, push: true }];
    const prefs = await getPreferences("u1");
    expect(byCategory(prefs, "promotions").push).toBe(false);
    expect(byCategory(prefs, "moderation").in_app).toBe(true);
  });

  it("still works before the database has the Push column, with every Push switch on", async () => {
    db.noPushColumn = true;
    db.rows = [{ category: "social", in_app: false, email: true }];
    const prefs = await getPreferences("u1");
    expect(byCategory(prefs, "social")).toMatchObject({ in_app: false, email: true, push: true });
  });
});

describe("saving the switches", () => {
  const save = (prefs) => savePreferences("u1", prefs);

  it("stores all three switches for each kind", async () => {
    const res = await save([{ category: "social", in_app: true, email: false, push: false }]);
    expect(res.ok).toBe(true);
    expect(db.rows).toEqual([{ user_id: "u1", category: "social", in_app: true, email: false, push: false }]);
  });

  it("updates a kind that already has a row, instead of adding another", async () => {
    db.rows = [{ category: "social", in_app: true, email: false, push: true }];
    await save([{ category: "social", in_app: true, email: true, push: false }]);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ email: true, push: false });
  });

  it("leaves Push on when an older form does not send it", async () => {
    await save([{ category: "projects", in_app: true, email: false }]);
    expect(db.rows[0].push).toBe(true);
  });

  it("never stores a push or email switch for Offers & invitations, and never lets the bell go off for Moderation", async () => {
    await save([{ category: "promotions", in_app: true, email: true, push: true }, { category: "moderation", in_app: false, email: false, push: true }]);
    expect(db.rows.find((r) => r.category === "promotions")).toMatchObject({ push: false, email: false });
    expect(db.rows.find((r) => r.category === "moderation").in_app).toBe(true);
  });

  it("ignores a category that does not exist and refuses an empty save", async () => {
    expect((await save([{ category: "nonsense", in_app: true, email: true, push: true }])).ok).toBe(false);
    expect(db.rows).toEqual([]);
  });

  it("still saves the bell and email switches before the database has the Push column", async () => {
    db.noPushColumn = true;
    const res = await save([{ category: "social", in_app: false, email: true, push: false }]);
    expect(res.ok).toBe(true);
    expect(db.rows[0]).not.toHaveProperty("push");
    expect(db.rows[0]).toMatchObject({ in_app: false, email: true });
  });
});

describe("a push that arrives in the open app", () => {
  it("is not shown again when the member is already on the page it is about", () => {
    expect(isAlreadyThere("/messages/abc", "/messages/abc")).toBe(true);
    expect(isAlreadyThere("/messages/abc/", "/messages/abc")).toBe(true);
    expect(isAlreadyThere("/messages/abc", "/messages/abc?m=1#last")).toBe(true);
  });

  it("is shown when they are somewhere else", () => {
    expect(isAlreadyThere("/feed", "/messages/abc")).toBe(false);
    expect(isAlreadyThere("/messages", "/messages/abc")).toBe(false);
    expect(isAlreadyThere("/messages/abc", "/messages/xyz")).toBe(false);
    expect(isAlreadyThere("/", "/notifications")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { rpcError: null, rpcData: null, calls: [], audit: [], user: { id: "actor-1" } };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name, args) => {
      state.calls.push([name, args]);
      return { data: state.rpcData, error: state.rpcError };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: async (name, args) => void state.audit.push([name, args]) }),
}));
vi.mock("@/lib/auth/session", () => ({ getAuthUser: async () => state.user }));
vi.mock("@/lib/settings", () => ({ invalidateSettingsCache: async () => {} }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); }, redirect: (to) => { throw new Error(`redirect:${to}`); } }));

const { mutate, moderateUser, updateUserProfile } = await import("@/lib/services/admin");
const { moderateUserSchema, userProfileEditSchema, userSessionsSchema } = await import("@/lib/validators/admin");

beforeEach(() => {
  Object.assign(state, { rpcError: null, rpcData: null, calls: [], audit: [], user: { id: "actor-1" } });
});

describe("refused privileged operations are audited", () => {
  it.each(["forbidden", "protected_account", "cannot_act_on_self", "cannot_grant_to_self"])("%s leaves a denied.* audit entry with only the code and the target", async (code) => {
    state.rpcError = { message: code, code: "42501" };
    const res = await moderateUser("target-9", "suspend", "a private reason that must not be logged", 3);
    expect(res.ok).toBe(false);
    expect(res.code).toBe(code);
    expect(state.audit).toHaveLength(1);
    const [fn, args] = state.audit[0];
    expect(fn).toBe("write_audit_log");
    expect(args).toMatchObject({ p_actor: "actor-1", p_action: "denied.moderate_user", p_target_id: "target-9", p_metadata: { code } });
    expect(JSON.stringify(args)).not.toContain("private reason");
  });

  it("does not log ordinary validation failures, successes, or anonymous callers", async () => {
    state.rpcError = { message: "reason_required", code: "22023" };
    await moderateUser("t", "warn", "x");
    state.rpcError = null;
    await moderateUser("t", "warn", "a reason");
    state.rpcError = { message: "forbidden", code: "42501" };
    state.user = null;
    await moderateUser("t", "warn", "a reason");
    expect(state.audit).toEqual([]);
  });

  it("never turns a refusal into a crash when the audit write itself fails", async () => {
    state.rpcError = { message: "forbidden", code: "42501" };
    state.user = { id: "a" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await mutate("anything", { p_id: "x" });
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("service calls", () => {
  it("passes the restriction period and maps database refusals to readable messages", async () => {
    await moderateUser("u", "restrict", "why", 14);
    expect(state.calls[0]).toEqual(["moderate_user", { p_user: "u", p_action: "restrict", p_reason: "why", p_days: 14 }]);
    state.rpcError = { message: "invalid_duration", code: "22023" };
    expect((await moderateUser("u", "restrict", "why", 999)).error).toMatch(/1 to 365 days/);
    state.rpcError = { message: 'duplicate key value violates unique constraint "profiles_username_key" username', code: "23505" };
    expect((await updateUserProfile({ userId: "u", username: "taken", reason: "r" })).code).toBe("username_taken");
  });
});

describe("input validation", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("bounds the restriction period and requires a reason", () => {
    expect(moderateUserSchema.safeParse({ userId: id, action: "restrict", reason: "ok reason", days: 30 }).success).toBe(true);
    expect(moderateUserSchema.safeParse({ userId: id, action: "restrict", reason: "ok reason", days: 366 }).success).toBe(false);
    expect(moderateUserSchema.safeParse({ userId: id, action: "restrict", reason: "ok reason", days: 0 }).success).toBe(false);
    expect(moderateUserSchema.safeParse({ userId: id, action: "restrict", reason: "ok", days: 7.5 }).success).toBe(false);
    expect(moderateUserSchema.safeParse({ userId: id, action: "delete", reason: "ok reason" }).success).toBe(false);
  });

  it("allows only the profile fields on the allow-list, needs a change and a reason, and rejects bad usernames", () => {
    const ok = userProfileEditSchema.safeParse({ userId: id, username: "Better_Name", reason: "Offensive handle" });
    expect(ok.success).toBe(true);
    expect(ok.data.username).toBe("better_name");
    expect(userProfileEditSchema.safeParse({ userId: id, reason: "nothing changes" }).success).toBe(false);
    expect(userProfileEditSchema.safeParse({ userId: id, username: "no spaces", reason: "reason" }).success).toBe(false);
    expect(userProfileEditSchema.safeParse({ userId: id, fullName: "x", reason: "r" }).success).toBe(false);
    const withExtra = userProfileEditSchema.safeParse({ userId: id, fullName: "Valid Name", reason: "valid reason", status: "active", college_id: id });
    expect(withExtra.success).toBe(true);
    expect(withExtra.data).not.toHaveProperty("status");
    expect(withExtra.data).not.toHaveProperty("college_id");
    expect(userSessionsSchema.safeParse({ userId: "not-a-uuid", reason: "valid reason" }).success).toBe(false);
  });
});

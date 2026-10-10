import { createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GREENFIELD, admin, cleanupUsers, createUser, grantRoleDirect } from "../helpers/supabase.js";

/** Ramgarh Engineering College: the college row, the private student-ID list and claiming an ID. */
const RGEC = "00000000-0000-4000-8000-0000000000a1";
const hash = (id) => createHmac("sha256", "test-secret").update(`student-id:${RGEC}:${id}`).digest("hex");
const tag = randomBytes(3).toString("hex").toUpperCase();
const ID = (n) => `T${tag}${n}`;

let staff, otherStaff, s1, s2, alum, faculty;
const rpc = (u, fn, args) => u.client.rpc(fn, args);
const claim = (user, id, college = RGEC) => admin.rpc("claim_student_id", { p_user: user.id, p_college: college, p_hash: hash(id) });
const status = async (u) => (await admin.from("profiles").select("verification_status").eq("id", u.id).single()).data.verification_status;

beforeAll(async () => {
  staff = await createUser("rg-staff", { collegeId: RGEC });
  otherStaff = await createUser("rg-other", { collegeId: GREENFIELD });
  s1 = await createUser("rg-s1", { collegeId: RGEC });
  s2 = await createUser("rg-s2", { collegeId: RGEC });
  alum = await createUser("rg-alum", { collegeId: RGEC, accountType: "alumni" });
  faculty = await createUser("rg-fac", { collegeId: RGEC, accountType: "faculty" });
  await grantRoleDirect(staff.id, "verification_staff", RGEC);
  await grantRoleDirect(otherStaff.id, "verification_staff", GREENFIELD);
});
afterAll(async () => {
  await admin.from("student_id_roster").delete().eq("college_id", RGEC).like("id_hint", "%");
  await cleanupUsers();
});

describe("the college", () => {
  it("exists, verifies by student ID, and has departments", async () => {
    const { data } = await admin.from("colleges").select("name, short_name, state, verification_mode").eq("id", RGEC).single();
    expect(data).toMatchObject({ name: "Ramgarh Engineering College", short_name: "RGEC", state: "Jharkhand", verification_mode: "student_id" });
    const { data: depts } = await admin.from("departments").select("code").eq("college_id", RGEC);
    expect(depts.length).toBeGreaterThan(0);
  });
});

describe("importing the list", () => {
  it("is limited to staff of that college and stores only hashes", async () => {
    const rows = [1, 2, 3, 4].map((n) => ({ hash: hash(ID(n)), hint: `••${ID(n).slice(-3)}`, year: 2024 }));
    expect((await rpc(s1, "import_student_roster", { p_college: RGEC, p_rows: rows })).error?.message).toMatch(/forbidden/);
    expect((await rpc(otherStaff, "import_student_roster", { p_college: RGEC, p_rows: rows })).error?.message).toMatch(/forbidden/);

    const ok = await rpc(staff, "import_student_roster", { p_college: RGEC, p_rows: rows });
    expect(ok.error).toBeNull();
    expect(ok.data).toMatchObject({ submitted: 4, added: 4, duplicates: 0 });
    expect((await rpc(staff, "import_student_roster", { p_college: RGEC, p_rows: rows })).data).toMatchObject({ added: 0, duplicates: 4 });
    expect((await rpc(staff, "import_student_roster", { p_college: RGEC, p_rows: [] })).error?.message).toMatch(/invalid_rows/);

    // the raw ID is nowhere in the table
    const { data } = await admin.from("student_id_roster").select("*").eq("college_id", RGEC);
    expect(JSON.stringify(data)).not.toContain(ID(1));
    expect(data.every((r) => /^[0-9a-f]{64}$/.test(r.id_hash))).toBe(true);
  });

  it("is invisible to members, who cannot read the table directly", async () => {
    const res = await s1.client.from("student_id_roster").select("id_hash");
    expect(res.data ?? []).toEqual([]);
    expect((await rpc(s1, "roster_stats", { p_college: RGEC })).error?.message).toMatch(/forbidden/);
    expect((await rpc(s1, "list_student_roster", { p_college: RGEC })).error?.message).toMatch(/forbidden/);
    expect((await rpc(s1, "claim_student_id", { p_user: s1.id, p_college: RGEC, p_hash: hash(ID(1)) })).error).not.toBeNull(); // service role only
  });
});

describe("claiming an ID", () => {
  it("verifies a student whose ID is on the list, exactly once", async () => {
    expect((await claim(s1, ID(1))).error).toBeNull();
    expect(await status(s1)).toBe("verified");
    expect((await admin.from("notifications").select("type").eq("user_id", s1.id).eq("type", "moderation_verification")).data).toHaveLength(1);
    expect((await admin.from("college_verifications").select("method, status").eq("user_id", s1.id).eq("status", "approved")).data[0].method).toBe("student_id");
    expect((await claim(s1, ID(1))).error).toBeNull(); // claiming your own ID again is harmless

    const stolen = await claim(s2, ID(1));
    expect(stolen.error?.message).toMatch(/already_claimed/);
    expect(await status(s2)).toBe("unverified");
  });

  it("rejects unknown IDs and a different college", async () => {
    expect((await claim(s2, "NOT-ON-THE-LIST-999")).error?.message).toMatch(/not_found/);
    expect((await claim(s2, ID(2), GREENFIELD)).error?.message).toMatch(/wrong_college/);
  });

  it("allows one ID per member, lets alumni verify, and keeps faculty on manual review", async () => {
    expect((await claim(s1, ID(2))).error?.message).toMatch(/already_verified/);
    expect((await claim(alum, ID(2))).error).toBeNull();
    expect(await status(alum)).toBe("verified");
    expect((await claim(faculty, ID(3))).error?.message).toMatch(/account_type_not_supported/);
  });
});

describe("managing entries", () => {
  it("shows stats and the list to staff, with the linked member", async () => {
    const stats = (await rpc(staff, "roster_stats", { p_college: RGEC })).data;
    expect(stats.claimed).toBeGreaterThanOrEqual(2);
    const list = (await rpc(staff, "list_student_roster", { p_college: RGEC, p_status: "claimed" })).data;
    expect(list.some((e) => e.username === s1.username && e.status === "claimed")).toBe(true);
    expect((await rpc(otherStaff, "roster_stats", { p_college: RGEC })).error?.message).toMatch(/forbidden/);
  });

  it("releases an ID so its real owner can claim it, and revokes IDs that are no longer valid", async () => {
    const entries = (await rpc(staff, "list_student_roster", { p_college: RGEC, p_status: "claimed", p_q: s1.username })).data;
    const entry = entries.find((e) => e.claimed_by === s1.id);
    expect((await rpc(staff, "manage_roster_entry", { p_id: entry.id, p_action: "release", p_reason: null })).error?.message).toMatch(/reason_required/);
    expect((await rpc(s2, "manage_roster_entry", { p_id: entry.id, p_action: "release", p_reason: "mine" })).error?.message).toMatch(/forbidden/);

    expect((await rpc(staff, "manage_roster_entry", { p_id: entry.id, p_action: "release", p_reason: "Claimed by the wrong person" })).error).toBeNull();
    expect(await status(s1)).toBe("unverified");
    expect((await claim(s2, ID(1))).error).toBeNull(); // the real owner can now claim it
    expect(await status(s2)).toBe("verified");

    expect((await rpc(staff, "manage_roster_entry", { p_id: entry.id, p_action: "revoke", p_reason: "Left the college" })).error).toBeNull();
    expect(await status(s2)).toBe("unverified");
    expect((await claim(s1, ID(1))).error?.message).toMatch(/not_found/);
    expect((await rpc(staff, "manage_roster_entry", { p_id: entry.id, p_action: "restore", p_reason: "Revoked by mistake" })).error).toBeNull();
    expect((await claim(s1, ID(1))).error).toBeNull();
    expect((await admin.from("audit_logs").select("action").eq("actor_id", staff.id)).data.map((a) => a.action)).toEqual(expect.arrayContaining(["roster.imported", "roster.release", "roster.revoke", "roster.restore"]));
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser } from "../helpers/supabase.js";

/** orphan_files(): public images that never became anyone's picture are found; the ones in use are not. */

let owner;
const rows = {};
const key = (purpose) => `${purpose}/${owner.id}/${crypto.randomUUID()}.webp`;
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

async function addFile(name, { purpose = "avatar", status = "ready", age = 3 } = {}) {
  const { data, error } = await admin
    .from("files")
    .insert({ owner_id: owner.id, bucket: "public", storage_key: key(purpose), purpose, mime_type: "image/webp", size_bytes: 10, original_name: "x.webp", status, created_at: daysAgo(age) })
    .select("id, storage_key")
    .single();
  if (error) throw error;
  rows[name] = data;
}
const orphans = async () => new Set(((await admin.rpc("orphan_files", { p_limit: 200 })).data ?? []).map((f) => f.id));

beforeAll(async () => {
  owner = await createUser("orphan-img");
  await addFile("avatarInUse");
  await addFile("coverInUse", { purpose: "cover" });
  await addFile("avatarAbandoned");
  await addFile("coverAbandoned", { purpose: "cover" });
  await addFile("avatarRecent", { age: 0 });
  await addFile("badge", { purpose: "orbit_badge" });
  await addFile("avatarReplaced", { status: "deleted" });
  const { error } = await admin.from("profiles").update({ avatar_key: rows.avatarInUse.storage_key, cover_key: rows.coverInUse.storage_key }).eq("id", owner.id);
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("profiles").update({ avatar_key: null, cover_key: null }).eq("id", owner.id);
  await admin.from("files").delete().eq("owner_id", owner.id);
  await cleanupUsers();
});

describe("orphan_files: public images", () => {
  it("finds an avatar and a cover that no profile uses once they are a day old", async () => {
    const found = await orphans();
    expect(found.has(rows.avatarAbandoned.id)).toBe(true);
    expect(found.has(rows.coverAbandoned.id)).toBe(true);
  });

  it("leaves alone a picture that is in use", async () => {
    const found = await orphans();
    expect(found.has(rows.avatarInUse.id)).toBe(false);
    expect(found.has(rows.coverInUse.id)).toBe(false);
  });

  it("leaves alone one uploaded within the last day (the member may still be saving it)", async () => {
    expect((await orphans()).has(rows.avatarRecent.id)).toBe(false);
  });

  it("does not touch badge pictures or files already marked deleted", async () => {
    const found = await orphans();
    expect(found.has(rows.badge.id)).toBe(false);
    expect(found.has(rows.avatarReplaced.id)).toBe(false);
  });

  it("picks up a picture as soon as it stops being used", async () => {
    await admin.from("profiles").update({ avatar_key: null }).eq("id", owner.id);
    expect((await orphans()).has(rows.avatarInUse.id)).toBe(true);
  });
});

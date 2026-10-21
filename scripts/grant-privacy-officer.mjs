// Names a privacy officer in the database that .env.local points at.
//   npm run privacy:grant-officer -- someone@example.com
//   npm run privacy:grant-officer -- someone@example.com --revoke
//
// Privacy officers are the only staff who can open privacy requests, grievances and breach records. Global
// administrators do NOT have these permissions by default, so there is a deliberate step to name a person. Run it for at least
// two people (so nobody approves their own breach notice). The action is written to the audit log with no actor, because it
// is an operator action on the server, not a person acting inside the app.
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");

const email = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "").toLowerCase();
const revoke = process.argv.includes("--revoke");
if (!email) {
  console.error("Usage: npm run privacy:grant-officer -- person@example.com [--revoke]");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

let user;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (data.users.length < 1000) break;
}
if (!user) {
  console.error(`No account has the email ${email}. The person must register first.`);
  process.exit(1);
}

if (revoke) {
  const { error } = await db.from("user_roles").delete().eq("user_id", user.id).eq("role", "privacy_officer");
  if (error) throw error;
  await db.rpc("write_audit_log", { p_actor: null, p_action: "role.revoked", p_target_type: "user", p_target_id: user.id, p_metadata: { role: "privacy_officer", by: "operator script" } });
  console.log(`Removed the privacy officer role from ${email}.`);
} else {
  const { error } = await db.from("user_roles").insert({ user_id: user.id, role: "privacy_officer", college_id: null });
  if (error && error.code !== "23505") throw error;
  if (!error) await db.rpc("write_audit_log", { p_actor: null, p_action: "role.granted", p_target_type: "user", p_target_id: user.id, p_metadata: { role: "privacy_officer", by: "operator script" } });
  console.log(error ? `${email} is already a privacy officer.` : `${email} is now a privacy officer. They can open /admin/privacy.`);
}

const { count } = await db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "privacy_officer");
if ((count ?? 0) < 2) console.warn("Note: fewer than two privacy officers exist. Name a second person so no one approves their own breach notice.");

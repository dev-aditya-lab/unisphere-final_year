// Creates (or resets) a global administrator in the database that .env.local points at.
//   npm run create-admin -- you@example.com "Your Name"
// The generated password is written to .env.local as a comment, never printed.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");

const email = (process.argv[2] ?? "admin@unisphere.local").toLowerCase();
const fullName = process.argv[3] ?? "UniSphere Admin";
const password = `Us-${randomBytes(9).toString("base64url")}-9!`;

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
if (created.error) {
  // Already exists: find it and reset the password.
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = data?.users?.find((u) => u.email === email);
  if (!existing) throw created.error;
  userId = existing.id;
  const { error } = await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) throw error;
} else {
  userId = created.data.user.id;
}

const { data: college } = await db.from("colleges").select("id").eq("is_active", true).order("created_at").limit(1).maybeSingle();
const { error: profileError } = await db.from("profiles").update({ onboarded_at: new Date().toISOString(), status: "active", ...(college ? { college_id: college.id } : {}) }).eq("id", userId);
if (profileError) throw profileError;

const { error: roleError } = await db.from("user_roles").upsert({ user_id: userId, role: "global_admin", college_id: null }, { onConflict: "user_id,role", ignoreDuplicates: true });
if (roleError && !String(roleError.message).includes("duplicate")) {
  // The unique index is an expression index, so upsert cannot target it: insert and ignore a duplicate.
  const { error } = await db.from("user_roles").insert({ user_id: userId, role: "global_admin", college_id: null });
  if (error && error.code !== "23505") throw error;
}

const { data: profile } = await db.from("profiles").select("username").eq("id", userId).single();
const stamp = new Date().toISOString().slice(0, 10);
// Replace any earlier credentials block, so only the current password is ever left in the file.
const cleaned = readFileSync(".env.local", "utf8").replace(/\n*# --- LOCAL DEV ADMIN[^\n]*\n(?:# (?:Admin console|Email|Password|Username)[^\n]*\n?)*/g, "\n");
writeFileSync(".env.local", cleaned.replace(/\n+$/, "\n"));
appendFileSync(
  ".env.local",
  `\n# --- LOCAL DEV ADMIN (created ${stamp}; local database only, never reuse in production) ---\n# Admin console: http://localhost:3000/admin\n# Email:    ${email}\n# Password: ${password}\n# Username: ${profile.username}\n`,
);
console.log(`Global admin ready: ${email} (credentials added as a comment at the end of .env.local)`);

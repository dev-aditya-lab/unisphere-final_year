import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppSecret } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, dbError } from "@/lib/actions/result";
import { sendEmail } from "@/lib/email";
import { collegeEmailCodeEmail } from "@/lib/email/templates";

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

function hashCode(userId, code) {
  return createHmac("sha256", getAppSecret()).update(`${userId}:${code}`).digest("hex");
}

function safeEqualHex(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Latest verification request + what the user's college supports. */
export async function getVerificationState(profile) {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("college_verifications")
    .select("id, method, status, college_email, email_verified_at, rejection_reason, created_at, reviewed_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let college = null;
  let domains = [];
  if (profile.college_id) {
    const { data: c } = await supabase
      .from("colleges")
      .select("id, name, verification_mode")
      .eq("id", profile.college_id)
      .maybeSingle();
    college = c;
    const { data: d } = await supabase
      .from("college_domains")
      .select("domain, audiences")
      .eq("college_id", profile.college_id);
    domains = (d ?? []).filter((x) => x.audiences.includes(profile.account_type));
  }
  return { latest, college, domains };
}

async function cancelOpenRequests(supabase, userId) {
  await supabase
    .from("college_verifications")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .in("status", ["pending", "needs_info"]);
}

/** Step 1 of email verification: validate the address against the college's domains and email a code. */
export async function startEmailVerification({ profile, name, email }) {
  if (!profile.college_id) return fail("Choose your college in your profile first.", { code: "no_college" });

  const limited = await enforceRateLimit("college-email", profile.id, { limit: 4, windowSec: 3600 });
  if (limited) return limited;

  const supabase = await createClient();
  const domain = email.split("@")[1]?.toLowerCase();
  const { data: match } = await supabase
    .from("college_domains")
    .select("domain, audiences")
    .eq("college_id", profile.college_id)
    .eq("domain", domain)
    .maybeSingle();
  if (!match || !match.audiences.includes(profile.account_type)) {
    return fail(
      "That email address does not belong to your college for your account type. Use your official college email, or request manual review instead.",
      { code: "domain_mismatch" },
    );
  }

  const { data: college } = await supabase.from("colleges").select("name").eq("id", profile.college_id).single();

  await cancelOpenRequests(supabase, profile.id);
  const { error: insertError } = await supabase.from("college_verifications").insert({
    user_id: profile.id,
    college_id: profile.college_id,
    account_type: profile.account_type,
    method: "email_domain",
    college_email: email,
  });
  if (insertError) return dbError(insertError);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const admin = createAdminClient();
  const { data: challenge, error: chError } = await admin
    .from("college_email_challenges")
    .insert({
      user_id: profile.id,
      college_id: profile.college_id,
      email,
      code_hash: hashCode(profile.id, code),
      expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (chError) return fail("Could not start verification. Please try again.", { code: "db_error" });

  const mail = collegeEmailCodeEmail({ name, code, collegeName: college.name, minutes: CODE_TTL_MIN });
  const sent = await sendEmail({ to: email, ...mail, idempotencyKey: `college-code-${challenge.id}` });
  if (!sent.ok) {
    await admin.from("college_email_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);
    console.error("[verification] email send failed:", sent.reason, sent.error);
    return fail("We could not send the verification email. Please try again later or request manual review.", { code: "email_failed" });
  }
  return ok({ email, expiresInMinutes: CODE_TTL_MIN });
}

/** Step 2: check the code. If the college trusts its email domain the member is verified immediately. */
export async function confirmEmailVerification({ profile, code }) {
  const limited = await enforceRateLimit("college-code", profile.id, { limit: 12, windowSec: 3600 });
  if (limited) return limited;

  const admin = createAdminClient();
  const { data: challenge } = await admin
    .from("college_email_challenges")
    .select("id, code_hash, attempts, expires_at, email, college_id")
    .eq("user_id", profile.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge || new Date(challenge.expires_at) < new Date()) {
    return fail("That code has expired. Request a new one.", { code: "expired" });
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await admin.from("college_email_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);
    return fail("Too many incorrect attempts. Request a new code.", { code: "locked" });
  }

  const valid = safeEqualHex(hashCode(profile.id, code), challenge.code_hash);
  if (!valid) {
    await admin.from("college_email_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
    return fail("That code is not correct.", { code: "invalid_code" });
  }

  await admin.from("college_email_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);

  const { data: verification } = await admin
    .from("college_verifications")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .eq("method", "email_domain")
    .in("status", ["pending", "needs_info"])
    .select("id, college_id")
    .maybeSingle();
  if (!verification) return fail("No verification request found. Start again.", { code: "no_request" });

  const { data: college } = await admin.from("colleges").select("verification_mode").eq("id", verification.college_id).single();
  if (college.verification_mode === "email_domain") {
    const { error } = await admin.rpc("finalize_college_verification", {
      p_id: verification.id,
      p_decision: "approved",
      p_reviewer: null,
      p_reason: null,
      p_notes: "auto: college email confirmed",
    });
    if (error) return dbError(error);
    return ok({ status: "verified" });
  }
  // The college wants a human to confirm even with a verified address.
  return ok({ status: "pending_review" });
}

export async function redeemInvite({ code }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_college_invite", { p_code: code });
  if (error) {
    if (error.message?.includes("invalid_invite")) return fail("That invitation code is not valid for your college and account type.", { code: "invalid_invite" });
    return dbError(error);
  }
  return ok({ status: "verified" });
}

export async function submitManualRequest({ profile, info, documentFileId }) {
  if (!profile.college_id) return fail("Choose your college in your profile first.", { code: "no_college" });
  const limited = await enforceRateLimit("college-manual", profile.id, { limit: 5, windowSec: 86400 });
  if (limited) return limited;

  const supabase = await createClient();
  if (documentFileId) {
    const { data: file } = await supabase
      .from("files")
      .select("owner_id, purpose, status")
      .eq("id", documentFileId)
      .maybeSingle();
    if (!file || file.owner_id !== profile.id || file.purpose !== "verification_document" || file.status !== "ready") {
      return fail("The attached document is not valid. Please upload it again.", { code: "invalid_file" });
    }
  }

  await cancelOpenRequests(supabase, profile.id);
  const { error } = await supabase.from("college_verifications").insert({
    user_id: profile.id,
    college_id: profile.college_id,
    account_type: profile.account_type,
    method: "manual",
    supporting_info: info,
    document_file_id: documentFileId ?? null,
  });
  if (error) return dbError(error);
  return ok();
}

export async function cancelVerification({ profile }) {
  const supabase = await createClient();
  await cancelOpenRequests(supabase, profile.id);
  return ok();
}

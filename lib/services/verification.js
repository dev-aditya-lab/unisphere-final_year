import "server-only";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fail, ok, dbError } from "@/lib/actions/result";

/**
 * Optional verification. UniSphere is open to everyone and nothing requires it. Where a college has given UniSphere
 * its own list of student IDs (lib/services/student-id.js), a member may use their ID to earn a Verified badge.
 * Choosing a college never verifies anyone by itself, and college-email verification was removed on purpose.
 */

/** Latest verification request + what the member's college supports. */
export async function getVerificationState(profile) {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("college_verifications")
    .select("id, method, status, rejection_reason, created_at, reviewed_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let college = null;
  if (profile.college_id) {
    const { data: c } = await supabase.from("colleges").select("id, name, verification_mode, listing_status").eq("id", profile.college_id).maybeSingle();
    college = c;
  }
  return { latest, college };
}

async function cancelOpenRequests(supabase, userId) {
  await supabase
    .from("college_verifications")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .in("status", ["pending", "needs_info"]);
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

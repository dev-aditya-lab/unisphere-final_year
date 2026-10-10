"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { dbError, fail, ok, parseInput } from "@/lib/actions/result";
import { enforceRateLimit } from "@/lib/rate-limit";

const deletionSchema = z.object({ reason: z.string().trim().max(500).optional() });

/** Starts the 14-day account deletion process (an administrator completes it; cancellable meanwhile). */
export async function requestAccountDeletionAction(input) {
  const { profile } = await requireProfile();
  const { data, failure } = parseInput(deletionSchema, input ?? {});
  if (failure) return failure;
  const limited = await enforceRateLimit("deletion", profile.id, { limit: 3, windowSec: 86400 });
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase
    .from("account_deletion_requests")
    .insert({ user_id: profile.id, reason: data.reason || null });
  if (error) {
    if (error.code === "23505") return fail("You already have a pending deletion request.", { code: "duplicate" });
    return dbError(error);
  }
  revalidatePath("/settings/security");
  return ok({ message: "Deletion requested. Your account will be removed after the 14-day grace period unless you cancel." });
}

export async function cancelAccountDeletionAction() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("account_deletion_requests")
    .update({ status: "cancelled" })
    .eq("user_id", profile.id)
    .eq("status", "pending");
  if (error) return dbError(error);
  revalidatePath("/settings/security");
  return ok({ message: "Deletion request cancelled." });
}

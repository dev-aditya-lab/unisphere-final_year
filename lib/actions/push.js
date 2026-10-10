"use server";

import { requireProfile } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendTestPush } from "@/lib/services/push";

export async function sendTestPushAction() {
  const { user } = await requireProfile();
  const limited = await enforceRateLimit("push-test", user.id, { limit: 5, windowSec: 600 });
  if (limited) return limited;
  return sendTestPush(user.id);
}

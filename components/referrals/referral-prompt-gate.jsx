import { ReferralPrompt } from "@/components/referrals/referral-prompt";
import { getPromptCheck } from "@/lib/services/referrals";

/**
 * Mounts the reminder only when the server says one is due for this member. One cheap database read per full page load, inside
 * <Suspense>, so it never delays the page; if it fails, no reminder is shown (never a made-up one).
 */
export async function ReferralPromptGate() {
  const check = await getPromptCheck();
  if (check.error || !check.data?.show) return null;
  return <ReferralPrompt />;
}

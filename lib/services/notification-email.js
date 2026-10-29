import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFlagEnabled } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { notificationEmail } from "@/lib/email/templates";
import { ACADEMY_BRAND, academySender } from "@/lib/email/academy";
import { describeNotification } from "@/lib/notification-text";

/**
 * Email queue consumer. Notifications are created with email_status='pending' only when the member's
 * preferences ask for email. This worker (run by /api/cron/tick):
 *   - waits a short grace period so people who open the app first are not emailed at all
 *   - batches everything pending for one person into ONE email (a digest when there are several)
 *   - uses an idempotency key so a retry can never send the same batch twice
 *   - records sent / failed honestly, with bounded retries
 * It only runs when something calls the tick endpoint (the worker script or a scheduler).
 */
export async function processNotificationEmails({ limit = 100 } = {}) {
  const stats = { claimed: 0, emails: 0, sent: 0, failed: 0, skipped: 0 };
  const admin = createAdminClient();
  const emailsEnabled = await isFlagEnabled("email_notifications");

  const { data: claimed, error } = await admin.rpc("claim_notification_emails", { p_limit: limit, p_min_age_sec: 90 });
  if (error) {
    console.error("[notification-email] claim failed:", error.message);
    return stats;
  }
  stats.claimed = claimed.length;

  const byUser = new Map();
  for (const n of claimed) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);

  for (const [userId, items] of byUser) {
    const ids = items.map((n) => n.id);
    const mark = (patch) => admin.from("notifications").update(patch).in("id", ids);

    // Already read in the app? No email needed.
    const unread = items.filter((n) => !n.read_at);
    if (!emailsEnabled || unread.length === 0) {
      await mark({ email_status: "skipped" });
      stats.skipped += items.length;
      continue;
    }

    const { data: userRes } = await admin.auth.admin.getUserById(userId);
    const email = userRes?.user?.email;
    const { data: profile } = await admin.from("profiles").select("full_name, status").eq("id", userId).maybeSingle();
    if (!email || !profile || !["active", "restricted"].includes(profile.status)) {
      await mark({ email_status: "skipped" });
      stats.skipped += items.length;
      continue;
    }

    const actorIds = [...new Set(unread.map((n) => n.actor_id).filter(Boolean))];
    const { data: actors } = actorIds.length ? await admin.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
    const names = new Map((actors ?? []).map((a) => [a.id, a.full_name]));
    const lines = unread.map((n) => describeNotification(n, names.get(n.actor_id)));

    // A batch made only of Academy notifications comes from the Academy sender, with the Academy name on it.
    const academyOnly = unread.every((n) => n.category === "academy");
    const mail = academyOnly
      ? notificationEmail({ name: profile.full_name, lines, brand: ACADEMY_BRAND, openLabel: "Open UniSphere Academy", openPath: "/academy/dashboard" })
      : notificationEmail({ name: profile.full_name, lines });
    const batchKey = `notif-${createHash("sha256").update(ids.slice().sort().join(",")).digest("hex").slice(0, 32)}`;
    const res = await sendEmail({ to: email, ...mail, idempotencyKey: batchKey, ...(academyOnly ? { from: academySender() } : {}) });
    stats.emails += 1;

    if (res.ok) {
      await mark({ email_status: "sent", emailed_at: new Date().toISOString(), email_error: null });
      stats.sent += items.length;
    } else {
      const giveUp = items.every((n) => n.email_attempts >= 3);
      await mark({ email_status: giveUp ? "failed" : "pending", email_error: String(res.error ?? res.reason).slice(0, 300) });
      if (giveUp) stats.failed += items.length;
    }
  }
  return stats;
}

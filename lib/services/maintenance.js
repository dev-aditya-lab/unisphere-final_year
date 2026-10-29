import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegrations } from "@/lib/env";
import { deleteObject } from "@/lib/storage/r2";
import { autoIssueCertificates } from "@/lib/services/academy-certificates";
import { isFlagEnabled } from "@/lib/settings";
import { processDueDeletions } from "@/lib/services/account-deletion";

/**
 * Periodic housekeeping run by the worker tick:
 *  - event reminders (24h and 1h before start), each sent at most once per person
 *  - removal of abandoned / never-finished uploads (storage object + metadata)
 *  - erasure of accounts whose 14-day deletion grace period has ended
 *  - privacy retention: old closed requests, support mail and logs are removed or anonymised (docs/DPDP_RETENTION.md)
 */

function whenLabel(startsAt, kind) {
  if (kind === "1h") return "in about an hour";
  return `tomorrow at ${new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(startsAt))} IST`;
}

export async function sendEventReminders() {
  if (!(await isFlagEnabled("events"))) return { skipped: "events disabled" };
  const admin = createAdminClient();
  const stats = { reminders24h: 0, reminders1h: 0 };
  for (const kind of ["24h", "1h"]) {
    const { data, error } = await admin.rpc("claim_event_reminders", { p_kind: kind });
    if (error) {
      console.error("[maintenance] reminders failed:", error.message);
      continue;
    }
    for (const r of data ?? []) {
      await admin.rpc("notify", {
        p_user: r.user_id,
        p_type: "event_reminder",
        p_actor: null,
        p_entity_type: "event",
        p_entity_id: r.event_id,
        p_data: { slug: r.slug, title: r.title, when: whenLabel(r.starts_at, kind) },
        p_dedupe: `event-remind:${r.event_id}:${kind}`,
      });
    }
    stats[`reminders${kind}`] = data?.length ?? 0;
  }
  return stats;
}

export async function cleanupOrphanFiles() {
  if (!getIntegrations().r2) return { skipped: "storage not configured" };
  const admin = createAdminClient();
  const { data: files, error } = await admin.rpc("orphan_files", { p_limit: 50 });
  if (error) {
    console.error("[maintenance] orphan query failed:", error.message);
    return { error: error.message };
  }
  let removed = 0;
  for (const f of files ?? []) {
    try {
      await deleteObject({ visibility: f.bucket, key: f.storage_key });
    } catch (err) {
      // Object may already be gone; anything else is retried on the next tick.
      if (err?.$metadata?.httpStatusCode && err.$metadata.httpStatusCode !== 404) continue;
    }
    await admin.from("files").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("id", f.id);
    removed += 1;
  }
  return { found: files?.length ?? 0, removed };
}

/**
 * Announcement channels: every member who has not muted the channel is notified, in batches and not in the sender's request.
 * Retrying is safe (notifications de-duplicate per message and person). Closed community reports lose their copy of the reported
 * text once the retention period has passed (the outcome stays).
 */
async function communityHousekeeping() {
  const db = createAdminClient();
  const announced = await db.rpc("process_channel_announcements", { p_limit: 20 });
  if (announced.error) throw new Error(announced.error.message);
  const purged = await db.rpc("purge_community_report_evidence");
  if (purged.error) throw new Error(purged.error.message);
  return { announcements: Number(announced.data ?? 0), evidencePurged: Number(purged.data ?? 0) };
}

/** Members whose timed restriction or suspension has ended are reinstated (told, and logged like a staff reinstatement). */
async function expireRestrictions() {
  const { data, error } = await createAdminClient().rpc("expire_restrictions");
  if (error) throw new Error(error.message);
  return { reinstated: Number(data ?? 0) };
}

/** Orbit seasons whose last day has passed are finalised (top 10 snapshots and badges, each awarded once). */
async function finalizeOrbitSeasons() {
  const { data, error } = await createAdminClient().rpc("orbit_finalize_due_seasons");
  if (error) throw new Error(error.message);
  return { finalized: Number(data ?? 0) };
}

/** Applies the retention windows (anonymises old closed privacy requests, clears old support mail and logs). Self-throttled to every 6 hours. */
async function applyPrivacyRetention() {
  const { data, error } = await createAdminClient().rpc("run_privacy_retention", { p_force: false });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * UniSphere Academy housekeeping: live-class and deadline reminders (each sent once), classes marked finished, recordings removed
 * when their time is up, access periods that have ended, and unpaid orders that were held too long (their coupon is given back).
 */
export async function academyHousekeeping() {
  const admin = createAdminClient();
  const [reminders, expired, sessions] = await Promise.all([admin.rpc("academy_send_reminders"), admin.rpc("academy_expire_orders"), admin.rpc("academy_advance_sessions")]);
  if (reminders.error) console.error("[maintenance] academy reminders failed:", reminders.error.message);
  if (sessions.error) console.error("[maintenance] academy sessions failed:", sessions.error.message);
  // Certificates are issued as soon as a student qualifies; a failure here must not stop the rest of the housekeeping.
  const certificates = await autoIssueCertificates({ limit: 5 }).catch((err) => ({ error: String(err?.message ?? "error").slice(0, 120) }));
  return { reminders: reminders.data ?? null, expiredOrders: expired.data ?? 0, sessions: sessions.data ?? null, certificates };
}

export async function runMaintenanceTasks() {
  return {
    eventReminders: await sendEventReminders(),
    academy: await academyHousekeeping().catch((err) => ({ error: String(err.message).slice(0, 160) })),
    orphanFiles: await cleanupOrphanFiles(),
    accountDeletions: await processDueDeletions(),
    restrictions: await expireRestrictions(),
    communities: await communityHousekeeping().catch((err) => ({ error: String(err.message).slice(0, 160) })),
    orbitSeasons: await finalizeOrbitSeasons(),
    privacyRetention: await applyPrivacyRetention().catch((err) => ({ error: String(err.message).slice(0, 160) })),
  };
}

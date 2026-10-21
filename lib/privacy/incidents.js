import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/actions/result";
import { sendEmail } from "@/lib/email";
import { breachNoticeEmail } from "@/lib/email/templates";

/**
 * Personal data breach handling (migration 0046). Every read and write goes through the signed-in privacy officer's own
 * session, so the database is what authorises it. The only service-role steps are the ones a privacy officer cannot do
 * themselves: resolving usernames to ids, and delivering the notices to the affected people.
 */

const ERRORS = {
  forbidden: "You do not have permission to do that.",
  not_found: "That incident no longer exists.",
  invalid_state: "That is not possible in the incident's current state.",
  invalid_field: "That field cannot be changed.",
  invalid_value: "That value is not allowed.",
  invalid_rows: "Add between 1 and 5000 members.",
  reason_required: "Please say why.",
  nothing_sent: "Nothing has been sent yet. Send a notice to the Board or to affected members first.",
  already_sent: "That notice was already sent.",
  cannot_review_own_request: "You drafted this notice, so another privacy officer has to approve it.",
};

function incidentError(error) {
  const msg = String(error?.message ?? "");
  if (msg.includes("incident_facts_missing")) {
    return fail(`The notice cannot be approved yet. Missing: ${msg.split("incident_facts_missing:")[1]?.trim() || "required facts"}.`, { code: "incident_facts_missing" });
  }
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  if (!key) console.error("[incident]", msg);
  return fail(key ? ERRORS[key] : "Something went wrong. Please try again.", { code: key ?? "db_error" });
}

export async function listIncidents() {
  const { data } = await (await createClient()).from("privacy_incidents").select("id, reference, title, status, severity, detected_at, aware_at, board_initial_at, board_detailed_at, principals_notified_at, created_at").order("created_at", { ascending: false }).limit(200);
  return data ?? [];
}

export async function getIncident(id) {
  const supabase = await createClient();
  const [incident, events, affected, notices] = await Promise.all([
    supabase.from("privacy_incidents").select("*").eq("id", id).maybeSingle(),
    supabase.from("privacy_incident_events").select("id, actor_id, kind, body, created_at").eq("incident_id", id).order("id", { ascending: true }),
    supabase.from("privacy_incident_affected").select("user_id, notified_at").eq("incident_id", id),
    supabase.from("privacy_incident_notices").select("*").eq("incident_id", id),
  ]);
  if (!incident.data) return null;
  return { incident: incident.data, events: events.data ?? [], affected: affected.data ?? [], notices: notices.data ?? [] };
}

export async function createIncident(d) {
  const { data, error } = await (await createClient()).rpc("create_privacy_incident", {
    p_title: d.title, p_severity: d.severity, p_detected_at: new Date(d.detectedAt).toISOString(), p_description: d.description, p_systems: d.systems, p_categories: d.categories,
  });
  return error ? incidentError(error) : ok({ id: data.id, reference: data.reference });
}

export async function patchIncident(id, patch) {
  const clean = { ...patch };
  for (const k of ["occurred_at", "aware_at"]) if (clean[k] !== undefined && clean[k] !== "") clean[k] = new Date(clean[k]).toISOString();
  const { error } = await (await createClient()).rpc("update_privacy_incident", { p_id: id, p_patch: clean });
  return error ? incidentError(error) : ok({ message: "Saved." });
}

export async function setIncidentStatus(id, to, note) {
  const { error } = await (await createClient()).rpc("set_privacy_incident_status", { p_id: id, p_to: to, p_note: note });
  return error ? incidentError(error) : ok({ message: "Status updated." });
}

export async function addIncidentEvent(id, kind, body) {
  const { error } = await (await createClient()).rpc("add_privacy_incident_event", { p_id: id, p_kind: kind, p_body: body });
  return error ? incidentError(error) : ok({ message: "Added to the timeline." });
}

/** Usernames (one per line or comma-separated) -> accounts. Unknown names are reported, not silently skipped. */
export async function addAffectedByUsername(id, text) {
  const names = [...new Set(String(text).toLowerCase().split(/[\s,;]+/).map((n) => n.replace(/^@/, "")).filter(Boolean))].slice(0, 5000);
  if (!names.length) return fail("Enter at least one username.");
  const db = createAdminClient();
  const found = [];
  for (let i = 0; i < names.length; i += 200) {
    const { data } = await db.from("profiles").select("id, username").in("username", names.slice(i, i + 200));
    found.push(...(data ?? []));
  }
  const known = new Set(found.map((p) => p.username));
  const unknown = names.filter((n) => !known.has(n));
  if (!found.length) return fail(`No account matched: ${unknown.slice(0, 10).join(", ")}.`);
  const { data, error } = await (await createClient()).rpc("add_privacy_incident_affected", { p_id: id, p_user_ids: found.map((p) => p.id) });
  if (error) return incidentError(error);
  return ok({ message: `${data} added.${unknown.length ? ` Not found: ${unknown.slice(0, 10).join(", ")}${unknown.length > 10 ? "…" : ""}.` : ""}` });
}

export async function saveNotice(id, audience, subject, body) {
  const { error } = await (await createClient()).rpc("save_privacy_incident_notice", { p_id: id, p_audience: audience, p_subject: subject, p_body: body });
  return error ? incidentError(error) : ok({ message: "Draft saved." });
}

export async function approveNotice(noticeId) {
  const { error } = await (await createClient()).rpc("approve_privacy_incident_notice", { p_notice_id: noticeId });
  return error ? incidentError(error) : ok({ message: "Approved." });
}

/** For the Board notices: a person submitted the report through the Board's own channel and records it here. */
export async function markBoardNoticeSent(noticeId, reference) {
  const { error } = await (await createClient()).rpc("mark_privacy_incident_notice_sent", { p_notice_id: noticeId, p_reference: reference || null, p_user_ids: null });
  return error ? incidentError(error) : ok({ message: "Recorded as submitted." });
}

const BATCH = 200;

/**
 * Delivers an APPROVED notice to affected members who have not had it yet: an in-app notification (written straight to
 * the member's notifications, so their notification preferences cannot suppress a breach notice) and an email to the
 * address they registered. Members are marked as notified one by one as delivery succeeds, so a retry never repeats a
 * delivery. The notice is marked sent only when everyone has it.
 */
export async function sendPrincipalNotice(noticeId) {
  const supabase = await createClient();
  const { data: notice } = await supabase.from("privacy_incident_notices").select("*").eq("id", noticeId).maybeSingle();
  if (!notice || notice.audience !== "principals") return fail("That notice was not found.");
  if (notice.status !== "approved") return fail("The notice must be approved before it is sent.");
  const { data: pending } = await supabase.from("privacy_incident_affected").select("user_id").eq("incident_id", notice.incident_id).is("notified_at", null).limit(BATCH);
  if (!pending?.length) return fail("Everyone on the list has already been notified.");

  const db = createAdminClient();
  let sent = 0;
  let failed = 0;
  const snippet = notice.body.slice(0, 200);
  for (const { user_id } of pending) {
    const { data: u } = await db.auth.admin.getUserById(user_id);
    const email = u?.user?.email;
    const { data: profile } = await db.from("profiles").select("full_name").eq("id", user_id).maybeSingle();
    let delivered = false;
    const { error: nErr } = await db.from("notifications").insert({
      user_id, type: "moderation_privacy_incident", category: "moderation", entity_type: "privacy_incident", email_status: "none",
      data: { subject: notice.subject, snippet },
      dedupe_key: `incident:${notice.id}`,
    });
    if (!nErr || nErr.code === "23505") delivered = true;
    if (email) {
      const mail = breachNoticeEmail({ name: profile?.full_name?.split(" ")[0], subject: notice.subject, body: notice.body });
      const res = await sendEmail({ to: email, ...mail, idempotencyKey: `breach:${notice.id}:${user_id}` });
      delivered = delivered || res.ok;
      if (!res.ok && !delivered) console.error("[incident] email failed for a member:", res.reason);
    }
    if (delivered) {
      await db.from("privacy_incident_affected").update({ notified_at: new Date().toISOString() }).eq("incident_id", notice.incident_id).eq("user_id", user_id);
      sent += 1;
    } else failed += 1;
  }
  const { count: remaining } = await db.from("privacy_incident_affected").select("user_id", { count: "exact", head: true }).eq("incident_id", notice.incident_id).is("notified_at", null);
  if (!remaining) {
    const { error } = await supabase.rpc("mark_privacy_incident_notice_sent", { p_notice_id: noticeId, p_reference: null, p_user_ids: null });
    if (error) return incidentError(error);
  }
  return ok({ message: `Notified ${sent}${failed ? `, ${failed} could not be reached (retry to try again)` : ""}.${remaining ? ` ${remaining} still to notify: send again to continue.` : " Everyone on the list has been notified."}`, remaining: remaining ?? 0 });
}

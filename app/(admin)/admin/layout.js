import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getMyPermissions, requireProfile } from "@/lib/auth/session";
import { isStaffPermissionSet, visibleAdminNav } from "@/lib/admin/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: { default: "Admin console", template: "%s · Admin · UniSphere" }, robots: { index: false, follow: false } };

const ROLE_LABELS = {
  global_admin: "Global admin", college_admin: "College admin", moderator: "Moderator",
  verification_staff: "Verification", support_agent: "Support", privacy_officer: "Privacy officer",
  academy_admin: "Academy admin", course_manager: "Course manager", finance_manager: "Academy finance", academy_mentor: "Mentor", academy_support: "Academy support",
};

/** Waiting-item counts for the sidebar. Each query runs through the member's own session, so scope is enforced by the database. */
async function queueCounts(names) {
  const supabase = await createClient();
  const counts = {};
  const jobs = [];
  if (names.has("reports.view")) jobs.push(supabase.rpc("list_reports", { p_status: "open", p_limit: 1 }).then(({ data }) => { counts.reports = Number(data?.[0]?.total_count ?? 0); }));
  if (names.has("reports.view")) jobs.push(supabase.rpc("admin_escalated_community_reports", { p_status: "open" }).then(({ data }) => { counts.communityReports = data?.length ?? 0; }));
  if (names.has("appeals.review")) jobs.push(supabase.rpc("list_appeals", { p_status: "pending", p_limit: 1 }).then(({ data }) => { counts.appeals = Number(data?.[0]?.total_count ?? 0); }));
  if (names.has("contact.manage")) jobs.push(supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new").then(({ count }) => { counts.support = count ?? 0; }));
  if (names.has("users.delete")) jobs.push(supabase.rpc("admin_list_deletions", { p_status: "pending" }).then(({ data }) => { counts.deletions = data?.length ?? 0; }));
  if (names.has("feedback.manage")) jobs.push(supabase.rpc("admin_list_feedback", { p_status: "new", p_limit: 1 }).then(({ data }) => { counts.feedback = Number(data?.[0]?.total_count ?? 0); }));
  if (names.has("referrals.view")) jobs.push(supabase.rpc("referral_admin_list", { p_status: "flagged", p_limit: 1 }).then(({ data }) => { counts.referrals = Number(data?.[0]?.total_count ?? 0); }));
  if (names.has("privacy.requests")) jobs.push(supabase.rpc("privacy_request_counts").then(({ data }) => { counts.privacyRequests = Number(data?.open ?? 0); }));
  if (names.has("academy.assignments.review")) jobs.push(supabase.rpc("academy_review_queue", { p_status: "submitted", p_limit: 1 }).then(({ data }) => { counts.academyGrading = Number(data?.[0]?.total_count ?? 0); }));
  await Promise.all(jobs);
  return counts;
}

// A separate layout from the member app: only staff get in, everyone else is sent to /forbidden.
export default async function AdminLayout({ children }) {
  const { profile } = await requireProfile();
  const perms = await getMyPermissions();
  const names = new Set(perms.map((p) => p.permission));
  if (!isStaffPermissionSet(names)) redirect("/forbidden");
  const items = visibleAdminNav(names);
  const counts = await queueCounts(names);
  const roles = [...new Set(perms.map((p) => p.role))].map((r) => ROLE_LABELS[r] ?? r).join(" · ");
  return (
    <AdminShell profile={profile} items={items} counts={counts} roleLabels={roles}>
      {children}
    </AdminShell>
  );
}

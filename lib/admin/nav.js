/**
 * Admin console navigation. An item shows when the member holds ANY of its permissions somewhere.
 * This only decides what to link to; every page and every database call re-checks the permission for the
 * specific college of the record being touched.
 */
export const ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: "LayoutDashboard", group: "review", exact: true },
  { href: "/admin/reports", label: "Reports", icon: "Flag", group: "review", perms: ["reports.view"], count: "reports" },
  { href: "/admin/appeals", label: "Appeals", icon: "Scale", group: "review", perms: ["appeals.review"], count: "appeals" },
  { href: "/admin/verification", label: "Verification", icon: "BadgeCheck", group: "review", perms: ["verification.review"], count: "verifications" },
  { href: "/admin/blue-tick", label: "Blue tick", icon: "ShieldCheck", group: "review", perms: ["bluetick.review"] },
  { href: "/admin/roster", label: "Student IDs", icon: "IdCard", group: "review", perms: ["roster.manage"] },
  { href: "/admin/feedback", label: "Feedback", icon: "MessageSquareHeart", group: "review", perms: ["feedback.manage"], count: "feedback" },
  { href: "/admin/support", label: "Support inbox", icon: "Inbox", group: "review", perms: ["contact.manage"], count: "support" },
  { href: "/admin/deletions", label: "Account deletion", icon: "UserX", group: "review", perms: ["users.delete"], count: "deletions" },

  { href: "/admin/users", label: "Members", icon: "Users", group: "community", perms: ["users.view"] },
  { href: "/admin/roles", label: "Staff & roles", icon: "KeyRound", group: "community", perms: ["roles.manage", "roles.manage_limited"] },
  { href: "/admin/posts", label: "Posts", icon: "FileText", group: "community", perms: ["reports.view"] },
  { href: "/admin/communities", label: "Communities", icon: "UsersRound", group: "community", perms: ["communities.manage"] },
  { href: "/admin/events", label: "Events", icon: "CalendarDays", group: "community", perms: ["events.manage"] },
  { href: "/admin/announcements", label: "Announcements", icon: "Megaphone", group: "community", perms: ["announcements.manage"] },
  { href: "/admin/colleges", label: "Colleges", icon: "Landmark", group: "community", perms: ["college.manage", "colleges.manage", "colleges.moderate"] },

  { href: "/admin/releases", label: "Releases", icon: "Rocket", group: "system", perms: ["releases.manage"] },
  { href: "/admin/payments", label: "Payments", icon: "IndianRupee", group: "system", perms: ["payments.view"] },
  { href: "/admin/analytics", label: "Analytics", icon: "ChartColumn", group: "system", perms: ["analytics.view"] },
  { href: "/admin/audit", label: "Audit log", icon: "ScrollText", group: "system", perms: ["audit.view"] },
  { href: "/admin/orbits", label: "Orbits", icon: "Orbit", group: "system", perms: ["orbits.manage", "orbits.ledger"] },
  { href: "/admin/ai", label: "AI status", icon: "Sparkles", group: "system", perms: ["ai.view"] },
  { href: "/admin/settings", label: "Settings & flags", icon: "SlidersHorizontal", group: "system", perms: ["settings.view"] },
];

export const ADMIN_GROUPS = [
  { id: "review", label: "Review queues" },
  { id: "community", label: "Community" },
  { id: "system", label: "Insights & system" },
];

/** Items visible to a member holding `permissionNames` (a Set of permission strings). */
export function visibleAdminNav(permissionNames) {
  return ADMIN_NAV.filter((i) => !i.perms || i.perms.some((p) => permissionNames.has(p)));
}

/** True when the member holds any staff permission at all. */
export function isStaffPermissionSet(permissionNames) {
  return ADMIN_NAV.some((i) => i.perms && i.perms.some((p) => permissionNames.has(p)));
}

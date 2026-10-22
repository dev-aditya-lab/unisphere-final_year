import { BadgeCheck, Bell, Database, Lock, ShieldCheck, UserRound } from "lucide-react";

/**
 * The settings areas, in the order they are listed everywhere (the sidebar, the phone menu and the hub page).
 * `group` only organises the list; each item is its own page.
 */
export const SETTINGS_SECTIONS = [
  { group: "Account", href: "/settings/profile", label: "Profile", description: "Photos, name, bio, schools, skills and links", icon: UserRound },
  { group: "Account", href: "/settings/security", label: "Security", description: "Password, signed-in devices and account deletion", icon: Lock },
  { group: "Privacy & data", href: "/settings/privacy", label: "Privacy", description: "Who can see you, optional uses of your data, Orbits", icon: ShieldCheck },
  { group: "Privacy & data", href: "/privacy-requests", label: "Data & requests", description: "Download, correct or erase your data; make a request", icon: Database },
  { group: "Preferences", href: "/settings/notifications", label: "Notifications", description: "This device, push, and what reaches you by email", icon: Bell },
  { group: "Membership", href: "/settings/blue-tick", label: "Blue tick", description: "An optional identity badge", icon: BadgeCheck },
];

export const SETTINGS_GROUPS = [...new Set(SETTINGS_SECTIONS.map((s) => s.group))];

export const isSectionActive = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

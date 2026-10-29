import { BookOpen, ChartColumn, IndianRupee, Inbox, KeyRound, LayoutDashboard, Megaphone, Orbit, Rocket, Scale, ScrollText, SlidersHorizontal, Tags, UserX } from "@/components/icons/lucide-compat";
import { BadgeCheck, BellRing, CalendarDays, FileText, Flag, GraduationCap, Gift, Landmark, Trophy, MessageSquareHeart, ShieldAlert, ShieldCheck, Sparkles, Users, UsersRound } from "@/components/icons/lucide-compat";

/** Icon components by the names used in lib/admin/nav.js (shared by the sidebar, the page finder and the overview). */
export const ADMIN_ICONS = { BadgeCheck, GraduationCap, Trophy, ShieldAlert, BellRing, BookOpen, CalendarDays, ChartColumn, FileText, Flag, Gift, IndianRupee, ShieldCheck, Inbox, KeyRound, Landmark, LayoutDashboard, Megaphone, MessageSquareHeart, Orbit, Rocket, Scale, ScrollText, SlidersHorizontal, Sparkles, Tags, UserX, Users, UsersRound };

export function adminIcon(name) {
  return ADMIN_ICONS[name] ?? LayoutDashboard;
}

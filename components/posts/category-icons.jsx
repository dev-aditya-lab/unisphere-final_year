import { LayoutGrid } from "lucide-react";
import { BriefcaseBusiness, CalendarDays, CircleHelp, FolderKanban, GraduationCap, Lightbulb, MessageCircle, Trophy } from "@/components/icons/lucide-compat";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

// Lucide icon for each `icon` name in lib/content/post-meta.js. A category added there without an entry here falls back
// to the general icon rather than rendering nothing.
const ICONS = { MessageCircle, FolderKanban, Lightbulb, CircleHelp, BriefcaseBusiness, Trophy, CalendarDays, GraduationCap };

/** The icon for a post category value ("projects", "ideas", ...). Pass `null` for the "All" filter. */
export function CategoryIcon({ value, ...props }) {
  const Icon = value === null || value === undefined ? LayoutGrid : (ICONS[CATEGORY_BY_VALUE[value]?.icon] ?? MessageCircle);
  return <Icon {...props} />;
}

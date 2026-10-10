import { Briefcase, CalendarDays, FolderKanban, GraduationCap, HelpCircle, Lightbulb, MessageSquare, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

const ICONS = { MessageSquare, FolderKanban, Lightbulb, HelpCircle, Briefcase, Trophy, CalendarDays, GraduationCap };

export function CategoryBadge({ category, className }) {
  const meta = CATEGORY_BY_VALUE[category] ?? CATEGORY_BY_VALUE.general;
  const Icon = ICONS[meta.icon] ?? MessageSquare;
  return (
    <Badge variant={meta.variant} className={className}>
      <Icon aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

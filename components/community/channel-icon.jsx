import { BookOpen, CircleHelp, FolderKanban, Lock, Megaphone } from "@/components/icons/lucide-compat";
import { Hash } from "lucide-react";

const ICONS = { text: Hash, announcements: Megaphone, qna: CircleHelp, resources: BookOpen, project: FolderKanban, staff: Lock };

/** The small picture that tells channel types apart. Decorative: the name and type are always in the text next to it. */
export function ChannelIcon({ type, className }) {
  const Icon = ICONS[type] ?? Hash;
  return <Icon className={className} aria-hidden="true" />;
}

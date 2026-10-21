import { AppIcon } from "@/components/icons/app-icon";

// The nav data (lib/nav.js) names each entry's icon by its concept; this is where that name meets the UniSphere icon family.
const NAV_GLYPH = {
  Home: "home",
  Compass: "compass",
  Orbit: "orbit",
  Lightbulb: "bulb",
  FolderKanban: "folder",
  Users: "users",
  CalendarDays: "calendar",
  Briefcase: "briefcase",
  Landmark: "landmark",
  GraduationCap: "cap",
  Link2: "link",
  MessageCircle: "chat",
  Bell: "bell",
  Bookmark: "bookmark",
  MessageSquareHeart: "feedback",
  Settings: "gear",
};

/** The navigation icon for a `NAV_ITEMS` entry. `active` marks the current destination (full colour, lifted); the rest are softly idle. */
export function NavIcon({ name, active = false, size = "sm", className }) {
  return <AppIcon name={NAV_GLYPH[name] ?? "home"} size={size} state={active ? "active" : "idle"} className={className} />;
}

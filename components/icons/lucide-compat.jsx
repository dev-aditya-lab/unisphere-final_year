import { AppIcon } from "@/components/icons/app-icon";

/**
 * The UniSphere icons behind the names the interface already uses for its icons. Each export is a component with the same call
 * shape as the line icon it replaces (`<Users className="size-4" aria-hidden="true" />`), so a screen moves to the new family by
 * changing its import, and sizing keeps working through Tailwind classes. Like the icons they replace they are single-colour and
 * follow the text colour; `strokeWidth` is honoured and `fill` and the other line-icon props are ignored.
 *
 * Utility glyphs (close, check, chevrons, arrows, plus, spinners) stay `lucide-react` strokes: they are control chrome, not
 * product concepts, and the same stroke weight and corner style keeps them in one family with these.
 */

const SIZE_PATTERNS = [
  [/(?:^|\s)size-\[(\d+(?:\.\d+)?)px\](?:\s|$)/, 1],
  [/(?:^|\s)size-(\d+(?:\.\d+)?)(?:\s|$)/, 4],
  [/(?:^|\s)h-(\d+(?:\.\d+)?)(?:\s|$)/, 4],
];

/** Pixel size from a Tailwind size class on the icon (bitmap reward art needs it; the vector glyphs just follow the class). */
export function sizeFromClass(className) {
  if (!className) return undefined;
  for (const [re, unit] of SIZE_PATTERNS) {
    const hit = re.exec(className);
    if (hit) return Math.round(Number(hit[1]) * unit);
  }
  return undefined;
}

function make(name, display) {
  function Icon({ className, size, strokeWidth, "aria-label": label, style }) {
    const px = typeof size === "number" ? size : sizeFromClass(className);
    return <AppIcon name={name} size={px} label={label} strokeWidth={strokeWidth} className={className} style={style} />;
  }
  Icon.displayName = display;
  return Icon;
}

export const Users = make("users", "Users");
export const UsersRound = make("users", "UsersRound");
export const User = make("user", "User");
export const UserPlus = make("user-plus", "UserPlus");
export const UserCheck = make("user-check", "UserCheck");
export const UserRoundCheck = make("user-check", "UserRoundCheck");
export const GraduationCap = make("cap", "GraduationCap");
export const Landmark = make("landmark", "Landmark");
export const Building2 = make("landmark", "Building2");
export const Lightbulb = make("bulb", "Lightbulb");
export const FolderKanban = make("folder", "FolderKanban");
export const CalendarDays = make("calendar", "CalendarDays");
export const CalendarPlus = make("calendar", "CalendarPlus");
export const Briefcase = make("briefcase", "Briefcase");
export const BriefcaseBusiness = make("briefcase", "BriefcaseBusiness");
export const Compass = make("compass", "Compass");
export const MessageCircle = make("chat", "MessageCircle");
export const MessagesSquare = make("chat", "MessagesSquare");
export const MessageSquareQuote = make("chat", "MessageSquareQuote");
export const MessageSquareHeart = make("feedback", "MessageSquareHeart");
export const Bell = make("bell", "Bell");
export const BellRing = make("bell", "BellRing");
export const Bookmark = make("bookmark", "Bookmark");
export const Heart = make("heart", "Heart");
export const Send = make("send", "Send");
export const Search = make("search", "Search");
export const SearchX = make("search", "SearchX");
export const Settings = make("gear", "Settings");
export const Settings2 = make("gear", "Settings2");
export const ShieldCheck = make("shield-check", "ShieldCheck");
export const Shield = make("shield", "Shield");
export const ShieldAlert = make("shield", "ShieldAlert");
export const ShieldBan = make("shield", "ShieldBan");
export const ShieldOff = make("shield", "ShieldOff");
export const Lock = make("lock", "Lock");
export const Link2 = make("link", "Link2");
export const Sparkles = make("sparkle", "Sparkles");
export const Wand2 = make("sparkle", "Wand2");
export const Star = make("star", "Star");
export const Flag = make("flag", "Flag");
export const MapPin = make("pin", "MapPin");
export const Pin = make("pin", "Pin");
export const Clock = make("clock", "Clock");
export const CheckCircle2 = make("check", "CheckCircle2");
export const CircleAlert = make("alert", "CircleAlert");
export const AlertCircle = make("alert", "AlertCircle");
export const TriangleAlert = make("alert", "TriangleAlert");
export const Info = make("info", "Info");
export const Mail = make("mail", "Mail");
export const MailCheck = make("mail", "MailCheck");
export const ImagePlus = make("image", "ImagePlus");
export const FileText = make("file", "FileText");
export const NotebookPen = make("file", "NotebookPen");
export const StickyNote = make("file", "StickyNote");
export const Trash2 = make("trash", "Trash2");
export const Pencil = make("pencil", "Pencil");
export const PenLine = make("pencil", "PenLine");
export const CircleHelp = make("help", "CircleHelp");
export const Trophy = make("trophy", "Trophy");
export const Globe = make("globe", "Globe");
export const BadgeCheck = make("badge-check", "BadgeCheck");
export const TrendingUp = make("trending-up", "TrendingUp");
export const Orbit = make("orbit", "Orbit");
export const BookOpen = make("book", "BookOpen");
export const ChartColumn = make("chart", "ChartColumn");
export const IndianRupee = make("coin", "IndianRupee");
export const Inbox = make("inbox", "Inbox");
export const KeyRound = make("key", "KeyRound");
export const LayoutDashboard = make("grid", "LayoutDashboard");
export const Megaphone = make("megaphone", "Megaphone");
export const Rocket = make("rocket", "Rocket");
export const Scale = make("scale", "Scale");
export const Tags = make("tag", "Tags");
export const SlidersHorizontal = make("sliders", "SlidersHorizontal");
export const ScrollText = make("file", "ScrollText");
export const Newspaper = make("file", "Newspaper");
export const Handshake = make("link", "Handshake");
export const Gift = make("gift", "Gift");
export const UserX = make("user-x", "UserX");

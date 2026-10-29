import { MediaImage } from "@/components/media-image";
import { cn } from "@/lib/utils";

// A drawn cover for a course without its own picture: near-black, a fine grid and the subject's symbol. No colour, no stock photos.
const GLYPH = { WD: "</>", PY: "{ }", UIUX: "◐", DS: "∑", MD: "▯", CS: "→" };

export function CourseCover({ course, className, sizes = 640 }) {
  const glyph = GLYPH[course.category?.code_prefix] ?? "◇";
  return (
    <div className={cn("ac-cover", className)}>
      {course.cover_key ? (
        <MediaImage mediaKey={course.cover_key} width={sizes} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <svg viewBox="0 0 320 180" className="size-full" role="img" aria-label={course.category?.name ?? "Course"} preserveAspectRatio="xMidYMid slice">
          <rect width="320" height="180" fill="#101010" />
          {Array.from({ length: 9 }, (_, i) => <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="180" stroke="#fff" strokeOpacity="0.06" />)}
          {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 45} x2="320" y2={i * 45} stroke="#fff" strokeOpacity="0.06" />)}
          <text x="26" y="112" fill="#f5f5f7" fontSize="64" fontWeight="700" letterSpacing="-2" style={{ fontFamily: "var(--font-academy-display), ui-sans-serif, sans-serif" }}>{glyph}</text>
          <text x="26" y="150" fill="#86868b" fontSize="11" fontWeight="600" letterSpacing="2">{(course.category?.name ?? "ACADEMY").toUpperCase()}</text>
        </svg>
      )}
    </div>
  );
}

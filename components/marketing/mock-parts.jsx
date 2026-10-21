import { Bookmark, Heart, MessageCircle, Search, Sparkles, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the landing page's product mock-ups. They are faithful to the real interface (same tokens,
 * same content types, same labels) but they are static markup with invented placeholder people, and every
 * composition that uses them says "Example". No real member, count or statistic appears in them.
 */

export function MockWindow({ title = "unisphere", children, className }) {
  return (
    <div className={cn("surface-raised overflow-hidden", className)}>
      <div className="bg-sunken flex items-center gap-3 border-b px-4 py-2.5" aria-hidden="true">
        <span className="flex gap-1.5">
          <span className="bg-rose size-2.5 rounded-full" />
          <span className="bg-sun size-2.5 rounded-full" />
          <span className="bg-teal size-2.5 rounded-full" />
        </span>
        <span className="bg-card text-muted-foreground mx-auto max-w-[16rem] flex-1 truncate rounded-md border px-3 py-0.5 text-center text-[11px] font-medium">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function Avatar({ initials, tone = "tone-plum", size = "size-9" }) {
  return (
    <span aria-hidden="true" className={cn("tone-chip flex shrink-0 items-center justify-center rounded-full text-xs font-bold", tone, size)}>
      {initials}
    </span>
  );
}

export function TypeChip({ children, tone }) {
  return <span className={cn("tone-chip rounded-md px-2 py-0.5 text-xs font-semibold", tone)}>{children}</span>;
}

export function MockPost({ initials, name, meta, category, tone, children, stats, className }) {
  return (
    <article className={cn("surface tone-stripe p-4", tone, className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar initials={initials} tone={tone} />
          <div className="leading-tight">
            <p className="flex items-center gap-1 text-sm font-bold">
              {name}
            </p>
            <p className="text-muted-foreground text-xs">{meta}</p>
          </div>
        </div>
        <TypeChip tone={tone}>{category}</TypeChip>
      </div>
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
      {stats && (
        <div className="text-muted-foreground mt-3 flex items-center gap-4 border-t pt-2.5 text-xs">
          <span className="flex items-center gap-1"><Heart className="size-3.5" aria-hidden="true" /> {stats[0]}</span>
          <span className="flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden="true" /> {stats[1]}</span>
          <Bookmark className="ml-auto size-3.5" aria-hidden="true" />
        </div>
      )}
    </article>
  );
}

export function MockSearch({ children }) {
  return (
    <div className="surface-sunken flex items-start gap-2.5 p-3">
      <Search className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="text-sm">{children}</p>
    </div>
  );
}

export function AiNote({ label = "AI suggestion, not a fact", children, className }) {
  return (
    <div className={cn("border-teal-text/40 rounded-xl border border-dashed p-3 text-xs", className)}>
      <p className="text-teal-text flex items-center gap-1.5 font-bold">
        <Sparkles className="size-3.5" aria-hidden="true" /> {label}
      </p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

export function RoleRow({ role, skills }) {
  return (
    <li className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3">
      <div>
        <p className="text-sm font-bold">{role}</p>
        <p className="mt-1 flex flex-wrap gap-1">
          {skills.map((s) => (
            <span key={s} className="bg-sunken text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium">{s}</span>
          ))}
        </p>
      </div>
      <span className="text-blue-text flex shrink-0 items-center gap-1 text-xs font-bold"><UserPlus className="size-3.5" aria-hidden="true" /> Request to join</span>
    </li>
  );
}

import { Megaphone, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/format";

/** Official college announcements. Visually separate from member posts so nobody mistakes one for the other. */
export function AnnouncementsBanner({ items }) {
  if (!items?.length) return null;
  return (
    <section aria-label="Official announcements" className="space-y-2">
      {items.map((a) => (
        <article key={a.id} className="border-primary/20 bg-primary-soft rounded-2xl border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default"><Megaphone /> Official announcement</Badge>
            {a.pinned && <Badge variant="mono"><Pin /> Pinned</Badge>}
            <time dateTime={a.published_at} suppressHydrationWarning className="text-muted-foreground ml-auto text-xs">{timeAgo(a.published_at)}</time>
          </div>
          <h2 className="font-heading mt-2 text-base font-bold">{a.title}</h2>
          <p className="mt-1 text-sm whitespace-pre-wrap">{a.body}</p>
        </article>
      ))}
    </section>
  );
}

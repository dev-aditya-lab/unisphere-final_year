import { MessageCircle } from "@/components/icons/lucide-compat";
import { Skeleton } from "@/components/ui/skeleton";
import { Immersive } from "@/components/shell/immersive";

/**
 * What /messages shows from the first byte, before the server has checked the member and sent the inbox. It has the same
 * frame as the real screen (components/messages/messages-app.jsx), so nothing moves when the real one replaces it.
 */
export function MessagesSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading messages"
      className="chat-frame bg-card grid grid-cols-1 overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]"
    >
      <Immersive mode="inbox" />
      <section aria-hidden="true" className="flex min-h-0 flex-col border-r">
        <p className="font-heading px-4 pt-4 pb-2 text-2xl font-extrabold">Messages</p>
        <ul className="space-y-1 p-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <span className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-hidden="true" className="text-muted-foreground bg-sunken flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 p-8 text-center max-md:hidden">
        <MessageCircle className="size-8" />
      </section>
    </div>
  );
}

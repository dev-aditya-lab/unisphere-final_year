import { MessageCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What /messages shows from the first byte, before the server has checked the member and sent the inbox. It has the same
 * frame as the real screen (components/messages/messages-app.jsx), so nothing moves when the real one replaces it.
 */
export function MessagesSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading messages"
      className="surface grid h-[calc(100dvh-9.5rem)] min-h-[22rem] grid-cols-1 overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)] lg:h-[calc(100dvh-8rem)] xl:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <section aria-hidden="true" className="flex min-h-0 flex-col border-r">
        <p className="font-heading px-4 pt-3 pb-1 text-lg font-bold">Messages</p>
        <ul className="space-y-1 p-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 py-1.5">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <span className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-hidden="true" className="text-muted-foreground flex min-h-0 min-w-0 flex-col items-center justify-center gap-2 p-8 text-center max-md:hidden">
        <MessageCircle className="size-8" />
      </section>
    </div>
  );
}

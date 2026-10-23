import { Skeleton } from "@/components/ui/skeleton";

export default function ChannelLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading the channel">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Skeleton className="size-5 rounded" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex-1 space-y-5 overflow-hidden p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-4 w-full max-w-md" />
              {i % 2 === 0 && <Skeleton className="h-4 w-2/3 max-w-sm" />}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

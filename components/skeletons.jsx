import { cn } from "@/lib/utils";

/** Placeholder shapes shown by loading.js while a page streams in. Still (no shimmer) for reduced motion. */
export function Bar({ className }) {
  return <div className={cn("skeleton h-3 w-full", className)} />;
}

export function PostSkeleton() {
  return (
    <div className="surface p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="skeleton size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Bar className="w-1/3" />
          <Bar className="h-2.5 w-1/5" />
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        <Bar className="h-4 w-2/3" />
        <Bar />
        <Bar className="w-5/6" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 3 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="skeleton h-28 rounded-2xl" aria-hidden="true" />
      <div className="skeleton h-10 w-72 max-w-full rounded-xl" aria-hidden="true" />
      {Array.from({ length: count }, (_, i) => (
        <PostSkeleton key={i} />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div aria-hidden="true" className="space-y-3">
        <Bar className="h-3 w-24" />
        <Bar className="h-8 w-2/3 max-w-md" />
        <Bar className="h-3 w-1/2 max-w-sm" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="surface space-y-3 p-5">
            <Bar className="h-4 w-1/2" />
            <Bar />
            <Bar className="w-4/5" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

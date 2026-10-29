import { Skeleton } from "@/components/ui/skeleton";

/** One plain loading screen for the private Academy areas (a route's loading.js renders it). Public pages deliberately have none, so a missing course still answers 404. */
export function SkeletonPage({ cards = 6 }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
      </div>
    </div>
  );
}

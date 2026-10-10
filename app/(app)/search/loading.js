import { PageSkeleton } from "@/components/skeletons";

// Only on routes with no `notFound()` descendants: a streamed page cannot change its HTTP status to 404.
export default function Loading() {
  return <PageSkeleton />;
}

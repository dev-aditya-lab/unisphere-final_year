import { DetailSkeleton } from "@/components/skeletons";

// Shown at once when a profile, post, project, event or community is opened, while the page streams in.
// Trade-off: a streamed page cannot change its HTTP status, so a missing record shows the "not found" page with a
// 200 status. These pages are for signed-in members only and are not indexed, so only the status code differs.
export default function Loading() {
  return <DetailSkeleton />;
}

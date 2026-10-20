import { PageSkeleton } from "@/components/skeletons";

// Lives in the `(list)` group so it covers only the list page: the detail and edit routes beside it call `notFound()`,
// and a streamed page cannot change its HTTP status to 404.
export default function Loading() {
  return <PageSkeleton />;
}

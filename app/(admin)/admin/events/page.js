import { ContentList } from "@/components/admin/content-list";

export const metadata = { title: "Events" };

export default function AdminEventsPage({ searchParams }) {
  return <ContentList kind="event" searchParams={searchParams} />;
}

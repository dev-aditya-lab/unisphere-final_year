import { ContentList } from "@/components/admin/content-list";

export const metadata = { title: "Communities" };

export default function AdminCommunitiesPage({ searchParams }) {
  return <ContentList kind="community" searchParams={searchParams} />;
}

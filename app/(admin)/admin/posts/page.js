import { ContentList } from "@/components/admin/content-list";

export const metadata = { title: "Posts" };

export default function AdminPostsPage({ searchParams }) {
  return <ContentList kind="post" searchParams={searchParams} />;
}

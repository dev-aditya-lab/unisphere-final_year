import { notFound, redirect } from "next/navigation";
import { PostPageContent, postMetadata } from "@/components/posts/post-page";
import { getAuthUser } from "@/lib/auth/session";
import { getPostBySlug } from "@/lib/services/posts";
import { isValidSlug } from "@/lib/slug";

export async function generateMetadata({ params }) {
  const { postSlug } = await params;
  if (!isValidSlug(postSlug)) return postMetadata(null);
  return postMetadata(await getPostBySlug(postSlug), `/posts/${postSlug}`);
}

export default async function PostPage({ params }) {
  const { postSlug } = await params;
  if (!isValidSlug(postSlug)) notFound();
  const post = await getPostBySlug(postSlug);
  if (!post) notFound();
  if (post.category === "ideas" && !post.repost_of_id) redirect(`/ideas/${post.slug}`);
  const user = await getAuthUser();
  return <PostPageContent post={post} viewerId={user?.id ?? null} />;
}

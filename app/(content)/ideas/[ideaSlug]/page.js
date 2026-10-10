import { notFound, redirect } from "next/navigation";
import { PostPageContent, postMetadata } from "@/components/posts/post-page";
import { getAuthUser } from "@/lib/auth/session";
import { getPostBySlug } from "@/lib/services/posts";
import { isValidSlug } from "@/lib/slug";

export async function generateMetadata({ params }) {
  const { ideaSlug } = await params;
  if (!isValidSlug(ideaSlug)) return postMetadata(null);
  return postMetadata(await getPostBySlug(ideaSlug), `/ideas/${ideaSlug}`);
}

export default async function IdeaPage({ params }) {
  const { ideaSlug } = await params;
  if (!isValidSlug(ideaSlug)) notFound();
  const post = await getPostBySlug(ideaSlug);
  if (!post) notFound();
  if (post.category !== "ideas") redirect(`/posts/${post.slug}`);
  const user = await getAuthUser();
  return <PostPageContent post={post} viewerId={user?.id ?? null} section={{ href: "/ideas", label: "Ideas" }} />;
}

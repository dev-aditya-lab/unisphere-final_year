import { notFound } from "next/navigation";
import { z } from "zod";
import { ThreadSeed } from "@/components/messages/seeds";
import { requireProfile } from "@/lib/auth/session";
import { getConversationHeader, getThreadPage } from "@/lib/services/messages";

export const metadata = { title: "Conversation", robots: { index: false, follow: false } };

/**
 * A direct load of a conversation (a link, a notification, a reload). The member's own row level security decides
 * whether it exists for them: not a member and not found look the same (404). The first page is rendered here so
 * the thread is on screen without waiting for the client to ask; switching conversations inside the app never
 * comes through this route.
 */
export default async function ConversationPage({ params }) {
  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) notFound();
  const { user } = await requireProfile();
  const [header, page] = await Promise.all([getConversationHeader(conversationId, user.id), getThreadPage(conversationId)]);
  if (!header) notFound();
  return <ThreadSeed conversationId={conversationId} header={header} items={page.items} hasMore={page.hasMore} />;
}

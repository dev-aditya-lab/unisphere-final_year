import { notFound } from "next/navigation";
import { z } from "zod";
import { Thread } from "@/components/messages/thread";
import { requireProfile } from "@/lib/auth/session";
import { getConversation, getMessages } from "@/lib/services/messages";

export const metadata = { title: "Conversation", robots: { index: false, follow: false } };

export default async function ConversationPage({ params }) {
  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) notFound();
  const { user } = await requireProfile();
  const conversation = await getConversation(conversationId, user.id);
  if (!conversation) notFound(); // not a member (RLS returns nothing) or does not exist
  const page = await getMessages(conversationId);
  return (
    <section data-open="true" className="min-h-0">
      <Thread conversation={conversation} viewerId={user.id} initialMessages={page.items} initialCursor={page.nextCursor} />
    </section>
  );
}

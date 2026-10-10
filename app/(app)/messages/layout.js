import { notFound } from "next/navigation";
import { ConversationList } from "@/components/messages/conversation-list";
import { requireProfile } from "@/lib/auth/session";
import { listConversations } from "@/lib/services/messages";
import { isFlagEnabled } from "@/lib/settings";

export const metadata = { title: "Messages", robots: { index: false, follow: false } };

/** Two-pane inbox on desktop; on mobile the list and the open thread take turns. */
export default async function MessagesLayout({ children }) {
  if (!(await isFlagEnabled("messaging"))) notFound();
  const { user } = await requireProfile();
  const conversations = await listConversations(user.id);
  return (
    <div className="surface grid grid-cols-1 h-[calc(100dvh-9.5rem)] min-h-[28rem] overflow-hidden md:grid-cols-[20rem_minmax(0,1fr)] lg:h-[calc(100dvh-8rem)]">
      <section aria-label="Inbox" className="min-h-0 overflow-y-auto border-r max-md:[&:has(+[data-open=true])]:hidden">
        <h1 className="font-heading border-b p-3 text-lg font-bold">Messages</h1>
        <ConversationList conversations={conversations} userId={user.id} />
      </section>
      {children}
    </div>
  );
}

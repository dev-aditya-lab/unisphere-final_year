import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MessagesApp } from "@/components/messages/messages-app";
import { InboxSeed } from "@/components/messages/seeds";
import { requireProfile } from "@/lib/auth/session";
import { getInbox } from "@/lib/services/messages";
import { isFlagEnabled } from "@/lib/settings";

export const metadata = { title: "Messages", robots: { index: false, follow: false } };

/**
 * The messaging area is one client application: the inbox and the open conversation render from the engine
 * (components/messages), which keeps them on the device and updates them incrementally. The server's job here is
 * to authorise and to hand over a first answer. The inbox streams in after the shell, so the page does not wait
 * for it, and nothing in this tree re-renders when a message arrives.
 */
export default async function MessagesLayout({ children }) {
  if (!(await isFlagEnabled("messaging"))) notFound();
  const { user } = await requireProfile();
  return (
    <MessagesApp viewerId={user.id}>
      <Suspense fallback={null}>
        <InboxData userId={user.id} />
      </Suspense>
      {children}
    </MessagesApp>
  );
}

async function InboxData({ userId }) {
  let conversations;
  try {
    conversations = await getInbox(userId);
  } catch {
    return null; // the client asks again through /api/messages/inbox and shows its own error state
  }
  return <InboxSeed conversations={conversations} />;
}

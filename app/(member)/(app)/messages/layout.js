import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MessagesApp } from "@/components/messages/messages-app";
import { MessagesSkeleton } from "@/components/messages/messages-skeleton";
import { InboxSeed } from "@/components/messages/seeds";
import { requireProfile } from "@/lib/auth/session";
import { getInbox } from "@/lib/services/messages";
import { isFlagEnabled } from "@/lib/settings";

export const metadata = { title: "Messages", robots: { index: false, follow: false } };

/**
 * The messaging area is one client application: the inbox and the open conversation render from the engine
 * (components/messages), which keeps them on the device and updates them incrementally. The server's job here is
 * to authorise and to hand over a first answer.
 *
 * This layout itself waits for nothing: the checks (the feature flag, the signed-in member) run inside a Suspense
 * boundary, so a tap on Messages shows the screen's frame at once instead of nothing until the server has answered.
 * That also lets the link prefetch (see lib/nav.js). The cost is that a request for a switched-off feature streams
 * a page that says "not found" with status 200, like the member pages in (content).
 */
export default function MessagesLayout({ children }) {
  return (
    <Suspense fallback={<MessagesSkeleton />}>
      <MessagesGate>{children}</MessagesGate>
    </Suspense>
  );
}

async function MessagesGate({ children }) {
  const [enabled, { user }] = await Promise.all([isFlagEnabled("messaging"), requireProfile()]);
  if (!enabled) notFound();
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

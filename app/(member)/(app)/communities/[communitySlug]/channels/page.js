import { Hash } from "lucide-react";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { getWorkspace } from "@/lib/services/community-workspace";
import { requireProfile } from "@/lib/auth/session";

export const metadata = { title: "Channels", robots: { index: false, follow: false } };

/** Shown beside the channel list on a computer when no channel is open. (On a phone the list itself is the screen.) */
export default async function ChannelsHome({ params }) {
  const { communitySlug } = await params;
  const { user } = await requireProfile();
  const workspace = await getWorkspace(communitySlug, user.id);
  const community = workspace?.community;
  if (!community) return null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-8 text-center">
      <Hash className="text-muted-foreground size-8" aria-hidden="true" />
      <h1 className="font-heading text-xl font-bold">Welcome to {community.name}</h1>
      <p className="text-muted-foreground max-w-md text-sm">Pick a channel on the left to read and join the conversation.</p>
      {community.rules && (
        <section className="bg-muted/50 mt-2 max-w-md rounded-xl border p-4 text-left" aria-label="Community rules">
          <h2 className="mb-1 text-sm font-semibold">Community rules</h2>
          <ChatMarkdown text={community.rules} />
        </section>
      )}
    </div>
  );
}

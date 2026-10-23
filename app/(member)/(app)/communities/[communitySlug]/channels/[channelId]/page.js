import { notFound } from "next/navigation";
import { z } from "zod";
import { ChannelView } from "@/components/community/channel-view";
import { getCurrentProfile, requireProfile } from "@/lib/auth/session";
import { getAiUiState } from "@/lib/ai/ui-state";
import { getChannel, getChannelPage, getWorkspace } from "@/lib/services/community-workspace";

export const metadata = { title: "Channel", robots: { index: false, follow: false } };

/**
 * A direct load of a channel (a link, a notification, a reload). A channel the member cannot read and one that does not exist look
 * the same (404). The first page of messages is rendered here so the conversation is on screen without waiting for the browser to
 * ask; from then on it moves with the live connection.
 */
export default async function ChannelPage({ params }) {
  const { communitySlug, channelId } = await params;
  if (!z.uuid().safeParse(channelId).success) notFound();
  const { user } = await requireProfile();
  const [channel, page, workspace] = await Promise.all([getChannel(channelId, user.id), getChannelPage(channelId, { limit: 40 }), getWorkspace(communitySlug, user.id)]);
  // the address must agree with the channel: a channel of another community under this community's address does not exist
  if (!channel || !workspace || workspace.community.id !== channel.community_id) notFound();
  // The button is offered only when AI is on for the platform and this member agreed to it; the server checks again when it is pressed.
  const profile = await getCurrentProfile();
  const ai = profile ? await getAiUiState(profile) : null;
  return <ChannelView key={channelId} channel={channel} seed={page} slug={communitySlug} aiAvailable={Boolean(ai?.assist)} />;
}

import { communityGuard, json, notFound, unavailable, uuid } from "@/lib/api/community";
import { getPinned } from "@/lib/services/community-workspace";

export const dynamic = "force-dynamic";

/** The pinned messages of a channel (row level security: a channel you cannot read has none for you). */
export async function GET(request, { params }) {
  const { response } = await communityGuard(request);
  if (response) return response;
  const { channelId } = await params;
  if (!uuid.safeParse(channelId).success) return notFound();
  try {
    return json({ ok: true, ...(await getPinned(channelId)) });
  } catch {
    return unavailable();
  }
}

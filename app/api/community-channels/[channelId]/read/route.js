import { communityGuard, failed, json, notFound, unavailable, uuid } from "@/lib/api/community";
import { markRead } from "@/lib/services/community-workspace";

export const dynamic = "force-dynamic";

/** Marks the channel read up to now and clears its mention notifications. */
export async function POST(request, { params }) {
  const { response } = await communityGuard(request, { write: true });
  if (response) return response;
  const { channelId } = await params;
  if (!uuid.safeParse(channelId).success) return notFound();
  try {
    const res = await markRead(channelId);
    return res.ok ? json({ ok: true }) : failed(res);
  } catch {
    return unavailable();
  }
}

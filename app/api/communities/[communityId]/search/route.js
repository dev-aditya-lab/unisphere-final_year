import { communityGuard, failed, json, notFound, unavailable, uuid } from "@/lib/api/community";
import { searchMessages } from "@/lib/services/community-workspace";

export const dynamic = "force-dynamic";

/** Message search inside one community. Only channels the caller can read are searched: row level security does that, not this route. */
export async function GET(request, { params }) {
  const { response } = await communityGuard(request, { limit: { scope: "chan-search", limit: 30, windowSec: 60 } });
  if (response) return response;
  const { communityId } = await params;
  if (!uuid.safeParse(communityId).success) return notFound();
  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") ?? "").trim().slice(0, 100);
  const channel = searchParams.get("channel");
  if (q.length < 2 || (channel && !uuid.safeParse(channel).success)) return json({ ok: false, error: "Type at least 2 characters.", code: "validation" }, 400);
  try {
    const res = await searchMessages(communityId, q, { channelId: channel });
    return res.ok ? json({ ok: true, results: res.results, people: res.people }) : failed(res);
  } catch {
    return unavailable();
  }
}

import { communityGuard, idList, json, notFound, unavailable, uuid } from "@/lib/api/community";
import { getChannel, loadPeople } from "@/lib/services/community-workspace";

export const dynamic = "force-dynamic";

/**
 * Names for message authors the browser has not seen yet (a message arrived live from someone new). Answered only for a
 * channel the caller can see, and only as much as the profile rules already allow: a person who keeps their profile
 * private comes back as "UniSphere member".
 */
export async function GET(request, { params }) {
  const { response } = await communityGuard(request);
  if (response) return response;
  const { channelId } = await params;
  if (!uuid.safeParse(channelId).success) return notFound();
  const ids = idList.safeParse(new URL(request.url).searchParams.get("ids") ?? "");
  if (!ids.success) return json({ ok: false, error: "Invalid request.", code: "validation" }, 400);
  try {
    if (!(await getChannel(channelId))) return notFound();
    return json({ ok: true, people: await loadPeople(ids.data) });
  } catch {
    return unavailable();
  }
}

import { guard, json, unavailable } from "@/lib/api/messaging";
import { getInbox } from "@/lib/services/messages";

export const dynamic = "force-dynamic";

/** The signed-in member's conversations, newest first: one database round trip. */
export async function GET(request) {
  const { user, response } = await guard(request);
  if (response) return response;
  try {
    return json({ ok: true, conversations: await getInbox(user.id) });
  } catch {
    return unavailable();
  }
}

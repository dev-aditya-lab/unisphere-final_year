import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/actions/result";
import { mutate } from "@/lib/services/admin";
import { audienceForDatabase } from "@/lib/validators/broadcast";

/**
 * Official broadcasts: an administrator notifies a chosen audience. The permission (announcements.manage), the reach (everyone for
 * global staff, only their own colleges for college staff) and the members' own notification switches are all enforced by the database
 * (send_broadcast, migration 0063); this file only prepares the audience and reports the outcome.
 */

/** Community addresses (slugs) to ids, through the administrator's own session, so a community they cannot see cannot be targeted. */
async function resolveCommunities(slugs) {
  if (!slugs.length) return { ids: [], missing: [] };
  const { data } = await (await createClient()).from("communities").select("id, slug").in("slug", slugs).is("deleted_at", null);
  const found = new Map((data ?? []).map((c) => [c.slug, c.id]));
  return { ids: [...found.values()], missing: slugs.filter((s) => !found.has(s)) };
}

export async function previewBroadcast({ audience }) {
  const { ids, missing } = await resolveCommunities(audience.communities);
  if (missing.length) return fail(`These communities were not found: ${missing.join(", ")}.`, { code: "unknown_community" });
  const res = await mutate("broadcast_preview", { p_audience: audienceForDatabase(audience, ids) });
  if (!res.ok) return res;
  return ok({ count: res.data.count, sample: res.data.sample ?? [], global: Boolean(res.data.global) });
}

export async function sendBroadcast({ title, body, href, push, audience }) {
  const { ids, missing } = await resolveCommunities(audience.communities);
  if (missing.length) return fail(`These communities were not found: ${missing.join(", ")}.`, { code: "unknown_community" });
  const res = await mutate("send_broadcast", {
    p_title: title,
    p_body: body,
    p_href: href || null,
    p_audience: audienceForDatabase(audience, ids),
    p_push: push,
  });
  if (!res.ok) return res;
  const { id, targeted, delivered } = res.data;
  return ok({ id, targeted, delivered, message: `Sent to ${delivered} ${delivered === 1 ? "member" : "members"}${delivered < targeted ? ` (${targeted - delivered} turned this kind of notification off)` : ""}.` });
}

/** The broadcasts the administrator may see (their own; global staff see everyone's), newest first. */
export async function listBroadcasts(limit = 30) {
  const { data } = await (await createClient())
    .from("admin_broadcasts")
    .select("id, title, body, href, audience, push, targeted, delivered, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

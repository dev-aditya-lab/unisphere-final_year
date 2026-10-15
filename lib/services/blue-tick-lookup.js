import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Adds `blue_tick` to rows that come from a database function which does not return it (people search, suggestions).
 * One indexed lookup by primary key, through the viewer's own session, so profile visibility still applies.
 */
export async function withBlueTicks(rows, idKey = "id") {
  const ids = [...new Set((rows ?? []).map((r) => r?.[idKey]).filter(Boolean))];
  if (!ids.length) return rows ?? [];
  const { data } = await (await createClient()).from("profiles").select("id").in("id", ids).eq("blue_tick", true);
  const ticked = new Set((data ?? []).map((r) => r.id));
  return rows.map((r) => ({ ...r, blue_tick: ticked.has(r[idKey]) }));
}

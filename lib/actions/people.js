"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { searchPeople } from "@/lib/services/social";

/** Lightweight people lookup for "invite to project" pickers (RLS decides who is visible). */
export async function searchPeopleAction(input) {
  const { user } = await requireProfile();
  const parsed = z.object({ query: z.string().trim().min(2).max(60) }).safeParse(input);
  if (!parsed.success) return { ok: true, people: [] };
  const limited = await enforceRateLimit("people-lookup", user.id, { limit: 60, windowSec: 60 });
  if (limited) return limited;
  const people = await searchPeople({ query: parsed.data.query, limit: 6 });
  return { ok: true, people: people.map((p) => ({ id: p.id, username: p.username, full_name: p.full_name, avatar_key: p.avatar_key, headline: p.headline, verified: p.verified })) };
}

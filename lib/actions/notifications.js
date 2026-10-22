"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { fail, parseInput } from "@/lib/actions/result";
import * as notifications from "@/lib/services/notifications";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-text";
import { cursorSchema } from "@/lib/cursor";

export async function loadNotificationsAction({ cursor, category }) {
  const { user } = await requireProfile();
  const parsed = z
    .object({ cursor: cursorSchema.nullable().optional(), category: z.string().max(30).nullable().optional() })
    .safeParse({ cursor, category });
  if (!parsed.success) return fail("Invalid request.");
  return { ok: true, ...(await notifications.listNotifications({ userId: user.id, cursor: parsed.data.cursor ?? null, category: parsed.data.category ?? null })) };
}

export async function markNotificationReadAction(id) {
  await requireProfile();
  if (!z.uuid().safeParse(id).success) return fail("Invalid request.");
  return notifications.markRead(id);
}

export async function markAllNotificationsReadAction(category = null) {
  await requireProfile();
  const res = await notifications.markAllRead(typeof category === "string" ? category : null);
  if (res.ok) revalidatePath("/notifications");
  return res;
}

const prefsSchema = z.object({
  prefs: z.array(z.object({ category: z.enum(NOTIFICATION_CATEGORIES.map((c) => c.value)), in_app: z.boolean(), email: z.boolean() })).max(20),
});

export async function savePreferencesAction(input) {
  const { user } = await requireProfile();
  const { data, failure } = parseInput(prefsSchema, input);
  if (failure) return failure;
  const res = await notifications.savePreferences(user.id, data.prefs);
  if (res.ok) revalidatePath("/settings/notifications");
  return res;
}

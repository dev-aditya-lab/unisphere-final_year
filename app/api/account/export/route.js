import { NextResponse } from "next/server";
import { getStrictAuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * "Download my data": everything the signed-in member authored or set, as JSON. It runs on the member's own
 * session, so Row Level Security guarantees it can only contain what they are allowed to see; each query is
 * additionally limited to rows they own. Other people's profiles, messages and content are never included.
 */
export async function GET() {
  const user = await getStrictAuthUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });
  const limited = await enforceRateLimit("data-export", user.id, { limit: 3, windowSec: 3600 });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const supabase = await createClient();
  const problems = [];
  const mine = (table, column, select = "*", extra = (q) => q) =>
    extra(supabase.from(table).select(select).eq(column, user.id)).limit(5000).then((r) => {
      if (r.error) problems.push(table);
      return r.data ?? [];
    });

  const [profile, posts, comments, projects, bookmarks, followsOut, prefs, notifPrefs, standing, appeals, deletion, messages, events] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then((r) => r.data),
    mine("posts", "author_id", "id, slug, title, body, category, visibility, status, created_at, edited_at"),
    mine("comments", "author_id", "id, post_id, parent_id, body, status, created_at"),
    mine("projects", "owner_id", "id, slug, name, tagline, problem, solution, status, created_at"),
    mine("bookmarks", "user_id", "post_id, created_at"),
    mine("follows", "follower_id", "following_id, created_at"),
    mine("profile_class_info", "user_id"),
    mine("notification_preferences", "user_id", "category, in_app, email"),
    mine("moderation_actions", "target_user_id", "action, reason, created_at", (q) => q.in("action", ["warn", "remove_content", "restore_content", "restrict", "suspend", "reinstate"])),
    mine("appeals", "user_id", "message, status, review_note, created_at, reviewed_at"),
    mine("account_deletion_requests", "user_id", "status, reason, requested_at, scheduled_for"),
    mine("messages", "sender_id", "conversation_id, body, created_at, status"),
    mine("event_registrations", "user_id", "event_id, status, created_at"),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    note: "This file contains data you created or provided. It does not include other members' content or private information.",
    account: { id: user.id, email: user.email, created_at: user.created_at },
    profile,
    class_info: prefs,
    posts, comments, projects, bookmarks, following: followsOut, event_registrations: events,
    messages_you_sent: messages,
    notification_preferences: notifPrefs,
    moderation: { decisions_about_you: standing, your_appeals: appeals },
    deletion_requests: deletion,
    ...(problems.length ? { incomplete_sections: problems } : {}),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="unisphere-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

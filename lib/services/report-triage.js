import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/actions/result";
import { runAiTask } from "@/lib/ai";
import { getSetting } from "@/lib/settings";

/**
 * AI-assisted triage for a report. It only *suggests* a category and severity to a human moderator; it never
 * changes a report, a member or any content. Honest limits apply: content that was not shared publicly or with the
 * whole college is never sent to the AI provider, and college-visible content is sent only if the platform allows it.
 */
const SENDABLE = new Set(["public"]);

async function postVisibility(type, snapshot) {
  if (type === "post") return snapshot.visibility ?? null;
  if (type === "comment" && snapshot.post_slug) {
    const { data } = await createAdminClient().from("posts").select("visibility").eq("slug", snapshot.post_slug).maybeSingle();
    return data?.visibility ?? null;
  }
  if (type === "user") return "public";
  return null;
}

export async function suggestTriage({ reportId, userId }) {
  const { data: detail, error } = await (await createClient()).rpc("get_report", { p_id: reportId });
  if (error) return fail("You cannot open that report.", { code: "forbidden" });
  const report = detail.report;

  const visibility = await postVisibility(report.target_type, report.snapshot ?? {});
  const allowCollege = visibility === "college" && (await getSetting("ai_share_college_content")) === true;
  if (!SENDABLE.has(visibility) && !allowCollege) {
    return fail("This content is not public, so it is not sent to the AI provider. Please review it yourself.", { code: "private_content" });
  }

  const s = report.snapshot ?? {};
  const content = [s.title, s.body ?? s.bio, s.headline].filter(Boolean).join("\n\n");
  if (!content.trim()) return fail("There is no text to assess.", { code: "no_content" });

  const res = await runAiTask("moderation_assist", { reportCategory: report.category, details: report.details, content }, { userId });
  if (!res.ok) return fail(res.error ?? "AI triage is unavailable right now. You can still review the report yourself.", { code: res.code });

  const suggestion = { ...res.data, model: res.meta.model, at: new Date().toISOString() };
  await createAdminClient().from("reports").update({ ai_suggestion: suggestion }).eq("id", reportId);
  return ok({ suggestion });
}

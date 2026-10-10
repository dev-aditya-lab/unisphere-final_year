import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegrations } from "@/lib/env";
import { embedText, toPgVector } from "@/lib/ai/embeddings";

/**
 * Embedding generation runs as persistent jobs in `ai_jobs`:
 *   - enqueue is idempotent (one live job per entity) so repeated edits do not pile up work
 *   - jobs are claimed with FOR UPDATE SKIP LOCKED, retried with exponential backoff, and given up on
 *     after max_attempts or a permanent provider/config error
 *   - they run opportunistically after the request (`after()`) and in the worker tick
 * Nothing is queued when no embedding provider is configured.
 */

const MAX_TEXT = 2000;

export async function enqueueEmbedding(entityType, entityId) {
  if (!getIntegrations().embeddings) return false;
  const { error } = await createAdminClient().from("ai_jobs").insert({
    type: "embed",
    payload: { entityType, entityId },
    dedupe_key: `embed:${entityType}:${entityId}`,
  });
  // 23505 = a pending job already exists for this entity: exactly what we want.
  return !error || error.code === "23505";
}

/** The text that represents an entity, or null when it must NOT be embedded (private / unavailable). */
async function loadEmbeddingText(admin, entityType, entityId) {
  if (entityType === "post") {
    const { data: p } = await admin.from("posts").select("title, body, visibility, status, repost_of_id").eq("id", entityId).maybeSingle();
    if (!p || p.status !== "published" || !["public", "college"].includes(p.visibility) || p.repost_of_id) return null;
    return `${p.title ?? ""}\n${p.body}`.slice(0, MAX_TEXT);
  }
  if (entityType === "profile") {
    const { data: p } = await admin.from("profiles").select("headline, bio, skills, interests, visibility, status").eq("id", entityId).maybeSingle();
    if (!p || p.status !== "active" || p.visibility === "private") return null;
    return `${p.headline ?? ""}\n${p.bio ?? ""}\nSkills: ${p.skills.join(", ")}\nInterests: ${p.interests.join(", ")}`.slice(0, MAX_TEXT);
  }
  if (entityType === "project") {
    const { data: p } = await admin.from("projects").select("name, tagline, problem, solution, tech_stack, required_skills, visibility, status").eq("id", entityId).maybeSingle();
    if (!p || p.status === "deleted" || p.visibility === "private") return null;
    return `${p.name}\n${p.tagline ?? ""}\n${p.problem ?? ""}\n${p.solution ?? ""}\nTech: ${p.tech_stack.join(", ")}\nSkills: ${p.required_skills.join(", ")}`.slice(0, MAX_TEXT);
  }
  return null;
}

async function processOne(admin, job) {
  const { entityType, entityId } = job.payload;
  const text = await loadEmbeddingText(admin, entityType, entityId);

  if (!text || !text.trim()) {
    await admin.from("embeddings").delete().eq("entity_type", entityType).eq("entity_id", entityId);
    return { done: true, note: "not eligible" };
  }

  const hash = createHash("sha256").update(text).digest("hex");
  const { data: existing } = await admin.from("embeddings").select("content_hash").eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  if (existing?.content_hash === hash) return { done: true, note: "unchanged" };

  const res = await embedText(text, { purpose: "document" });
  if (!res.ok) {
    if (res.code === "not_configured") return { done: true, note: "provider not configured" };
    return { done: false, permanent: res.permanent || res.code === "dimension_mismatch" || res.code === "auth", error: res.code };
  }

  const { error } = await admin.from("embeddings").upsert(
    { entity_type: entityType, entity_id: entityId, embedding: toPgVector(res.vector), content_hash: hash, model: res.model, updated_at: new Date().toISOString() },
    { onConflict: "entity_type,entity_id" },
  );
  if (error) return { done: false, permanent: false, error: error.message };
  return { done: true };
}

/** Claim and run up to `limit` jobs. Returns counts for the worker / admin status page. */
export async function processEmbeddingJobs({ limit = 10 } = {}) {
  if (!getIntegrations().embeddings) return { claimed: 0, done: 0, failed: 0, retried: 0, skipped: "not_configured" };
  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc("claim_ai_jobs", { p_limit: limit, p_type: "embed" });
  if (error) {
    console.error("[ai-jobs] claim failed:", error.message);
    return { claimed: 0, done: 0, failed: 0, retried: 0 };
  }

  const stats = { claimed: jobs.length, done: 0, failed: 0, retried: 0 };
  for (const job of jobs) {
    let outcome;
    try {
      outcome = await processOne(admin, job);
    } catch (err) {
      outcome = { done: false, permanent: false, error: String(err?.message ?? err).slice(0, 200) };
    }
    if (outcome.done) {
      await admin.from("ai_jobs").update({ status: "done", last_error: null, locked_at: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      stats.done += 1;
    } else if (outcome.permanent || job.attempts >= job.max_attempts) {
      await admin.from("ai_jobs").update({ status: "failed", last_error: outcome.error, locked_at: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      stats.failed += 1;
    } else {
      const backoffSec = Math.min(2 ** job.attempts * 30, 3600);
      await admin
        .from("ai_jobs")
        .update({ status: "pending", last_error: outcome.error, locked_at: null, run_at: new Date(Date.now() + backoffSec * 1000).toISOString(), updated_at: new Date().toISOString() })
        .eq("id", job.id);
      stats.retried += 1;
    }
  }
  return stats;
}

/** Fire-and-forget helper for request handlers: queue the entity, then drain a few jobs. */
export async function enqueueAndProcess(entityType, entityId) {
  try {
    if (await enqueueEmbedding(entityType, entityId)) await processEmbeddingJobs({ limit: 3 });
  } catch (err) {
    console.error("[ai-jobs] enqueueAndProcess failed:", err?.message);
  }
}

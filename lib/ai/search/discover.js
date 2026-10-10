import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { enforceRateLimit } from "@/lib/rate-limit";
import { runAiTask } from "@/lib/ai";
import { embedText, embeddingsActive, toPgVector } from "@/lib/ai/embeddings";
import { clip, ruleKeywords } from "@/lib/ai/safety/sanitize";
import { excerpt } from "@/lib/text";
import { CATEGORY_BY_VALUE } from "@/lib/content/post-meta";

/**
 * Idea discovery: find what already exists on the platform that relates to a member's text.
 *
 * Retrieval always comes from real stored content, through the member's own session (Row Level
 * Security applies), and uses:
 *   • PostgreSQL full-text keywords (always)
 *   • pgvector semantic similarity (only when an embedding provider is configured)
 *   • recency and engagement signals (see related_posts() in migration 0008 for the exact formula)
 * AI only (a) broadens the keywords, and (b) explains each result. If AI is unavailable the same
 * results appear with rule-based explanations, and the UI is told which mode produced them.
 */

const SNIPPET = 280;

function wordsOf(phrases) {
  return phrases.flatMap((p) => String(p).toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []);
}

/** May this candidate's text be sent to an external AI provider? Never for restricted visibilities. */
async function aiMaySee(candidate) {
  if (candidate.visibility === "public") return true;
  if (candidate.visibility === "college") return (await getSetting("ai_share_college_content")) !== false;
  return false;
}

function ruleReason(c) {
  const meta = CATEGORY_BY_VALUE[c.category]?.label ?? "Post";
  if (c.shared_terms?.length) return `${meta} that mentions ${c.shared_terms.slice(0, 4).join(", ")}.`;
  return `${meta} with a similar meaning to what you described.`;
}

export async function discoverRelated({ user, text, excludePostId = null, explain = true, limit = 6, supabase = null }) {
  const input = clip(text, 2500);
  if (input.length < 20) return { ok: false, code: "too_short", error: "Write a little more (at least a sentence) so we can look for related work." };

  const limited = await enforceRateLimit("discover", user.id, { limit: 30, windowSec: 600 });
  if (limited) return limited;

  // 1. Keywords: rule-based first, widened by AI concepts when available.
  let keywords = ruleKeywords(input, 10);
  let skillsNeeded = [];
  let aiUsed = false;
  let aiNote = null;
  if (explain) {
    const concepts = await runAiTask("extract_concepts", { text: input }, { userId: user.id });
    if (concepts.ok) {
      keywords = [...new Set([...keywords, ...wordsOf(concepts.data.concepts)])].slice(0, 14);
      skillsNeeded = concepts.data.skillsNeeded;
    } else {
      aiNote = concepts.code;
    }
  }

  // 2. Semantic query vector (only when embeddings are genuinely configured).
  let embeddingParam = null;
  let semantic = false;
  if (await embeddingsActive()) {
    const emb = await embedText(input, { purpose: "query", userId: user.id });
    if (emb.ok) {
      embeddingParam = toPgVector(emb.vector);
      semantic = true;
    }
  }

  // 3. Retrieval through the member's session (RLS decides what is visible).
  const db = supabase ?? (await createClient());
  const [postsRes, peopleRes] = await Promise.all([
    db.rpc("related_posts", { p_keywords: keywords, p_embedding: embeddingParam, p_exclude: excludePostId, p_limit: limit }),
    db.rpc("related_people", { p_keywords: [...keywords, ...wordsOf(skillsNeeded)], p_exclude_self: true, p_limit: 5 }),
  ]);
  if (postsRes.error) console.error("[discover] related_posts failed:", postsRes.error.message);
  if (peopleRes.error) console.error("[discover] related_people failed:", peopleRes.error.message);

  const candidates = (postsRes.data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title || excerpt(p.body, 70),
    snippet: excerpt(p.body, SNIPPET),
    category: p.category,
    visibility: p.visibility,
    author: { id: p.author_id, name: p.author_name, username: p.author_username, avatarKey: p.author_avatar_key },
    createdAt: p.created_at,
    reactions: p.reaction_count,
    comments: p.comment_count,
    score: p.score,
    sharedTerms: p.shared_terms ?? [],
    shared_terms: p.shared_terms ?? [],
    why: ruleReason(p),
    source: "rules",
    differences: null,
    sharedConcepts: [],
  }));

  // 4. Optional AI explanations, only for candidates whose text may be shared with the provider.
  if (explain && candidates.length) {
    const shareable = [];
    for (const c of candidates) if (await aiMaySee(c)) shareable.push(c);
    if (shareable.length) {
      const res = await runAiTask(
        "explain_related",
        { text: input, candidates: shareable.map((c) => ({ id: c.id, title: c.title, snippet: c.snippet })) },
        { userId: user.id },
      );
      if (res.ok) {
        aiUsed = true;
        const byId = new Map(res.data.items.map((i) => [i.id, i]));
        for (const c of candidates) {
          const e = byId.get(c.id);
          if (e) {
            c.why = e.why;
            c.differences = e.difference || null;
            c.sharedConcepts = e.sharedConcepts;
            c.source = "ai";
          }
        }
      } else {
        aiNote = aiNote ?? res.code;
      }
    }
  }

  const people = (peopleRes.data ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    full_name: p.full_name,
    avatar_key: p.avatar_key,
    headline: p.headline,
    account_type: p.account_type,
    verified: p.verified,
    open_to_collaboration: p.open_to_collaboration,
    open_to_mentoring: p.open_to_mentoring,
    // Reasons come only from what the profile itself lists.
    reason: [
      p.matched_skills?.length ? `Lists the skill${p.matched_skills.length > 1 ? "s" : ""}: ${p.matched_skills.slice(0, 3).join(", ")}` : null,
      p.matched_interests?.length ? `Interested in ${p.matched_interests.slice(0, 2).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(". "),
  }));

  return {
    ok: true,
    related: candidates,
    people,
    mode: { semantic, aiExplanations: aiUsed, aiUnavailableReason: aiUsed ? null : aiNote, keywords },
  };
}

/** Improvement directions for an idea, informed by what already exists (explicit user action; smart tier). */
export async function suggestImprovements({ user, text, related = [] }) {
  const res = await runAiTask(
    "idea_improvements",
    { text: clip(text, 2500), related: related.slice(0, 6).map((r) => ({ title: clip(r.title, 120) })) },
    { userId: user.id },
  );
  return res;
}

/**
 * Originality assistant: how does this idea relate to existing work? Neutral by design: shows overlaps
 * and differences and ways to be more distinctive. It never declares anything copied.
 */
export async function checkOriginality({ user, text, excludePostId = null, supabase = null }) {
  const found = await discoverRelated({ user, text, excludePostId, explain: false, limit: 5, supabase });
  if (!found.ok) return found;

  const shareable = [];
  for (const c of found.related) if (await aiMaySee(c)) shareable.push(c);

  let analysis = null;
  let aiNote = null;
  const res = await runAiTask(
    "originality_check",
    { text: clip(text, 3000), candidates: shareable.map((c) => ({ id: c.id, title: c.title, snippet: c.snippet })) },
    { userId: user.id },
  );
  if (res.ok) {
    analysis = res.data;
    const byId = new Map(res.data.items.map((i) => [i.id, i]));
    for (const c of found.related) {
      const a = byId.get(c.id);
      c.overlap = a?.overlap ?? [];
      c.differences = a?.differences?.length ? a.differences.join(" ") : null;
      c.source = a ? "ai" : "rules";
    }
  } else {
    aiNote = res.code;
  }

  return {
    ok: true,
    related: found.related,
    distinctiveAngles: analysis?.distinctiveAngles ?? [],
    suggestions: analysis?.suggestions ?? [],
    mode: { ...found.mode, aiAnalysis: Boolean(analysis), aiUnavailableReason: aiNote },
    note: "Similar ideas are common and are shown for context only. This is not a judgement that anything was copied.",
  };
}

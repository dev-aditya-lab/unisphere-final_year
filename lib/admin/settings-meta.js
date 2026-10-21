import { z } from "zod";

/**
 * How each platform setting is presented and validated. Shared by the admin form (client) and the
 * server action, so the server never trusts the form's own idea of what is valid.
 */
const rateRule = z.object({ limit: z.number().int().min(1).max(10000), windowSec: z.number().int().min(10).max(86400) });

export const SETTING_GROUPS = [
  { id: "general", label: "General", keys: ["platform_name", "platform_tagline", "support_email"] },
  { id: "access", label: "Access & trust", keys: ["registration_open", "maintenance_mode", "maintenance_message"] },
  { id: "uploads", label: "Uploads", keys: ["upload_max_image_mb", "upload_max_attachment_mb", "upload_allowed_image_types"] },
  { id: "ai", label: "AI", keys: ["ai_daily_limit_per_user", "ai_share_college_content"] },
  { id: "limits", label: "Rate limits", keys: ["rate_limits"] },
  { id: "legal", label: "Legal & guidelines text", keys: ["guidelines_md", "terms_md"] },
];

export const SETTING_META = {
  platform_name: { label: "Platform name", kind: "text", schema: z.string().trim().min(2).max(60) },
  platform_tagline: { label: "Tagline", kind: "text", schema: z.string().trim().max(160) },
  support_email: { label: "Public support email", kind: "text", hint: "Shown on the contact page. Leave empty to use the default, hello@unispheres.in.", schema: z.union([z.literal(""), z.email().max(254)]) },
  registration_open: { label: "Open registration", kind: "boolean", hint: "UniSphere is open to everyone. Turn off only to pause new sign-ups (for example during an incident).", schema: z.boolean() },
  maintenance_mode: { label: "Maintenance mode", kind: "boolean", hint: "Only administrators can use the app while this is on.", danger: true, schema: z.boolean() },
  maintenance_message: { label: "Maintenance message", kind: "longtext", schema: z.string().trim().max(300) },
  upload_max_image_mb: { label: "Largest image (MB)", kind: "number", schema: z.number().int().min(1).max(25) },
  upload_max_attachment_mb: { label: "Largest other file (MB)", kind: "number", schema: z.number().int().min(1).max(50) },
  upload_allowed_image_types: { label: "Allowed image types", kind: "json", hint: 'A JSON list, e.g. ["image/jpeg","image/png","image/webp"].', schema: z.array(z.enum(["image/jpeg", "image/png", "image/webp"])).min(1) },
  ai_daily_limit_per_user: { label: "AI requests per member per day", kind: "number", hint: "0 stops all AI features without changing flags.", schema: z.number().int().min(0).max(1000) },
  ai_share_college_content: { label: "Allow college-visible excerpts to reach the AI provider", kind: "boolean", hint: "Private, connections-only and community posts are never sent.", schema: z.boolean() },
  rate_limits: {
    label: "Rate limit policy",
    kind: "json",
    hint: "Per scope: limit requests per windowSec seconds. Scopes: auth, write, search, upload, ai.",
    schema: z.object({ auth: rateRule, write: rateRule, search: rateRule, upload: rateRule, ai: rateRule }),
  },
  guidelines_md: { label: "Community guidelines (Markdown)", kind: "markdown", hint: "Empty uses the built-in text.", schema: z.string().max(50000) },
  privacy_md: { label: "Privacy policy (Markdown)", kind: "markdown", hint: "Empty uses the built-in text.", schema: z.string().max(50000) },
  terms_md: { label: "Terms of service (Markdown)", kind: "markdown", hint: "Empty uses the built-in text.", schema: z.string().max(50000) },
};

export const FLAG_META = {
  ai_features: { group: "AI", label: "AI features (master switch)" },
  ai_idea_discovery: { group: "AI", label: "Idea discovery & originality assistant" },
  ai_post_assistant: { group: "AI", label: "Writing assistant in the composer" },
  ai_matching: { group: "AI", label: "Teammate recommendation explanations" },
  ai_moderation_assist: { group: "AI", label: "AI-suggested report triage" },
  semantic_search: { group: "AI", label: "Semantic search (needs an embeddings provider)" },
  messaging: { group: "Product", label: "Direct messaging" },
  communities: { group: "Product", label: "Communities & clubs" },
  events: { group: "Product", label: "Events & RSVP" },
  opportunities: { group: "Product", label: "Opportunities" },
  alumni_network: { group: "Product", label: "Alumni directory & mentoring" },
  email_notifications: { group: "Product", label: "Notification emails" },
};

import "server-only";
import { z } from "zod";

/**
 * Server-side environment validation.
 *
 * Required values (Supabase) fail fast with a readable message. Optional
 * integrations (Redis, R2, Resend, AI) are validated only for shape and exposed
 * through `integrations` so callers can degrade honestly instead of pretending.
 *
 * NEXT_PUBLIC_* variables are read statically in lib/env-public.js, because
 * Next.js only inlines them when referenced as literal `process.env.X`.
 */

const emptyToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const boolString = z
  .preprocess(emptyToUndefined, z.enum(["true", "false"]).optional())
  .transform((v) => v === "true");
const intString = (def) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()).transform((v) => v ?? def);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndefined, z.url().default("http://localhost:3000")),
  CRON_SECRET: optionalString,
  // Development/test only: scales every rate limit so automated tests are not throttled. Ignored in production.
  RATE_LIMIT_MULTIPLIER: intString(1),
  APP_SECRET: optionalString,

  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10, "Supabase publishable (or anon) key is missing"),
  SUPABASE_SECRET_KEY: z.string().min(10, "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is missing"),

  REDIS_URL: optionalString,

  CLOUDFLARE_ACCOUNT_ID: optionalString,
  CLOUDFLARE_R2_ACCESS_KEY_ID: optionalString,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: optionalString,
  CLOUDFLARE_R2_BUCKET_NAME: optionalString,
  CLOUDFLARE_R2_PUBLIC_BUCKET_NAME: optionalString,
  CLOUDFLARE_R2_PUBLIC_URL: optionalUrl,
  CLOUDFLARE_R2_ENDPOINT: optionalUrl,
  CLOUDFLARE_R2_FORCE_PATH_STYLE: boolString,
  CLOUDFLARE_R2_REGION: z.preprocess(emptyToUndefined, z.string().default("auto")),

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().default("UniSphere <no-reply@example.com>")),
  EMAIL_REPLY_TO: optionalString,
  SMTP_DEV_HOST: z.preprocess(emptyToUndefined, z.string().default("127.0.0.1")),
  SMTP_DEV_PORT: intString(55325),
  EMAIL_DEV_MAILPIT: boolString,

  AI_ENABLED: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("true")).transform((v) => v === "true"),
  GROQ_API_KEY: optionalString,
  GROQ_MODEL_FAST: z.preprocess(emptyToUndefined, z.string().default("qwen/qwen3.8-27b")),
  GROQ_MODEL_SMART: z.preprocess(emptyToUndefined, z.string().default("openai/gpt-oss-120b")),
  GROQ_MODEL_SAFETY: optionalString,
  AI_FALLBACK_BASE_URL: optionalUrl,
  AI_FALLBACK_API_KEY: optionalString,
  AI_FALLBACK_MODEL: optionalString,
  AI_DAILY_LIMIT_PER_USER: intString(30),
  AI_REQUEST_TIMEOUT_MS: intString(20000),

  // Web Push (installed-app notifications). Generate with: npx web-push generate-vapid-keys
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: z.preprocess(emptyToUndefined, z.string().default("mailto:support@example.com")),

  // Razorpay (blue tick purchases). The key id is public by design; the secrets must stay on the server.
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,

  EMBEDDING_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["none", "openai-compatible", "gemini"]).default("none")),
  EMBEDDING_BASE_URL: optionalUrl,
  EMBEDDING_API_KEY: optionalString,
  EMBEDDING_MODEL: optionalString,
  EMBEDDING_DIMENSIONS: intString(768),
});

let cached;

export function getEnv() {
  if (cached) return cached;
  const raw = {
    ...process.env,
    // Accept both current and legacy Supabase key names.
    SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".") || "(env)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example and docs/SETUP.md.`);
  }
  const env = parsed.data;
  if (env.EMBEDDING_PROVIDER !== "none" && (!env.EMBEDDING_API_KEY && env.EMBEDDING_PROVIDER !== "openai-compatible")) {
    // Not fatal: embeddings simply stay inactive. Surfaced via integrations.embeddings.
  }
  cached = env;
  return env;
}

/** Which optional integrations are genuinely usable with the current env. */
export function getIntegrations() {
  const e = getEnv();
  const r2 = Boolean(
    e.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      e.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      e.CLOUDFLARE_R2_BUCKET_NAME &&
      (e.CLOUDFLARE_R2_ENDPOINT || e.CLOUDFLARE_ACCOUNT_ID),
  );
  return {
    redis: Boolean(e.REDIS_URL),
    r2,
    r2Public: Boolean(r2 && e.CLOUDFLARE_R2_PUBLIC_BUCKET_NAME && e.CLOUDFLARE_R2_PUBLIC_URL),
    // Outside production, EMAIL_DEV_MAILPIT=true routes mail to the local Mailpit inbox.
    emailViaMailpit: e.NODE_ENV !== "production" && (e.EMAIL_DEV_MAILPIT || !e.RESEND_API_KEY),
    email: Boolean(e.RESEND_API_KEY) && !(e.NODE_ENV !== "production" && e.EMAIL_DEV_MAILPIT),
    push: Boolean(e.NEXT_PUBLIC_VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY),
    payments: Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET),
    paymentWebhook: Boolean(e.RAZORPAY_WEBHOOK_SECRET),
    groq: Boolean(e.AI_ENABLED && e.GROQ_API_KEY),
    aiFallback: Boolean(e.AI_ENABLED && e.AI_FALLBACK_BASE_URL && e.AI_FALLBACK_API_KEY && e.AI_FALLBACK_MODEL),
    embeddings: Boolean(
      e.EMBEDDING_PROVIDER !== "none" &&
        e.EMBEDDING_MODEL &&
        e.EMBEDDING_API_KEY &&
        (e.EMBEDDING_PROVIDER === "gemini" || e.EMBEDDING_BASE_URL),
    ),
  };
}

/**
 * Secret used to HMAC short-lived codes (e.g. college email verification).
 * In production APP_SECRET must be set; in development a value derived from the
 * Supabase secret key keeps setup friction low.
 */
export function getAppSecret() {
  const e = getEnv();
  if (e.APP_SECRET) return e.APP_SECRET;
  if (e.NODE_ENV === "production") {
    throw new Error("APP_SECRET must be set in production (openssl rand -hex 32).");
  }
  return `dev-derived:${e.SUPABASE_SECRET_KEY}`;
}

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
  // How many reverse proxies sit in front of the app and append to X-Forwarded-For (see lib/rate-limit.js).
  TRUSTED_PROXY_HOPS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(5).default(1)),

  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10, "Supabase publishable (or anon) key is missing"),
  SUPABASE_SECRET_KEY: z.string().min(10, "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is missing"),

  REDIS_URL: optionalString,

  // Optional malware-scanning service for PDFs (see lib/storage/scan.js). Without it uploads are validated, not scanned.
  UPLOAD_SCAN_URL: optionalUrl,
  UPLOAD_SCAN_TOKEN: optionalString,
  UPLOAD_SCAN_TIMEOUT_MS: intString(10000),

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
  // NVIDIA's hosted, OpenAI-compatible API. Used for Daily Challenge question drafts (see lib/ai/providers/nvidia.js).
  NVIDIA_AI_API_KEY: optionalString,
  NVIDIA_AI_MODEL: z.preprocess(emptyToUndefined, z.string().default("openai/gpt-oss-20b")),
  NVIDIA_AI_BASE_URL: z.preprocess(emptyToUndefined, z.url().default("https://integrate.api.nvidia.com/v1")),
  AI_FALLBACK_BASE_URL: optionalUrl,
  AI_FALLBACK_API_KEY: optionalString,
  AI_FALLBACK_MODEL: optionalString,
  AI_DAILY_LIMIT_PER_USER: intString(30),
  AI_REQUEST_TIMEOUT_MS: intString(20000),

  // Web Push (installed-app notifications). Generate with: npx web-push generate-vapid-keys
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: z.preprocess(emptyToUndefined, z.string().default("mailto:support@example.com")),

  // Payments (blue tick purchases) through any gateway that has an adapter in lib/payments/gateways (docs/PAYMENTS.md).
  // PAYMENT_GATEWAY names the adapter; the rest are the generic credentials every adapter receives. All of them are secrets
  // and stay on the server.
  PAYMENT_GATEWAY: optionalString,
  PAYMENT_KEY_ID: optionalString,
  PAYMENT_KEY_SECRET: optionalString,
  PAYMENT_WEBHOOK_SECRET: optionalString,
  PAYMENT_API_BASE_URL: optionalUrl,

  EMBEDDING_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["none", "openai-compatible", "gemini", "nvidia"]).default("none")),
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

/** Embedding settings as the client uses them. The "nvidia" provider reuses NVIDIA_AI_API_KEY and its base URL unless overridden. */
export function getEmbeddingConfig() {
  const e = getEnv();
  const nvidia = e.EMBEDDING_PROVIDER === "nvidia";
  return {
    provider: e.EMBEDDING_PROVIDER,
    baseUrl: e.EMBEDDING_BASE_URL ?? (nvidia ? e.NVIDIA_AI_BASE_URL : undefined),
    apiKey: e.EMBEDDING_API_KEY ?? (nvidia ? e.NVIDIA_AI_API_KEY : undefined),
    model: e.EMBEDDING_MODEL,
    dimensions: e.EMBEDDING_DIMENSIONS,
  };
}

/** Which optional integrations are genuinely usable with the current env. */
export function getIntegrations() {
  const e = getEnv();
  const embedding = getEmbeddingConfig();
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
    groq: Boolean(e.AI_ENABLED && e.GROQ_API_KEY),
    nvidia: Boolean(e.AI_ENABLED && e.NVIDIA_AI_API_KEY),
    aiFallback: Boolean(e.AI_ENABLED && e.AI_FALLBACK_BASE_URL && e.AI_FALLBACK_API_KEY && e.AI_FALLBACK_MODEL),
    embeddings: Boolean(
      embedding.provider !== "none" &&
        embedding.model &&
        embedding.apiKey &&
        (embedding.provider === "gemini" || embedding.baseUrl),
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

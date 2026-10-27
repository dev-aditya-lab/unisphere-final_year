import "server-only";
import { getEnv, getIntegrations } from "@/lib/env";
import { paymentsStatus } from "@/lib/payments/gateway";

/**
 * The outside services that handle personal data for UniSphere, computed from what is actually configured on this
 * deployment, so the notice never lists a service that is switched off or omits one that is on.
 *
 * What is NOT claimed: how long each provider keeps data or whether it trains models on it. Those depend on the
 * provider's own terms and account settings; docs/DPDP_PROCESSORS.md tells the operator what to verify.
 */
export function listProcessors() {
  const i = getIntegrations();
  const e = getEnv();
  const payment = paymentsStatus();
  const embeddingName =
    e.EMBEDDING_PROVIDER === "gemini" ? "Google (Gemini embeddings)" : e.EMBEDDING_PROVIDER === "nvidia" ? "NVIDIA (embeddings)" : "An embeddings provider (OpenAI-compatible)";
  const all = [
    {
      id: "supabase",
      name: "Supabase",
      role: "Database, sign-in and realtime",
      active: true,
      receives: "Everything you give UniSphere: account, profile, content, messages, consent and request records.",
      why: "To store your information and sign you in.",
    },
    {
      id: "hosting",
      name: "The hosting platform",
      role: "Runs the website",
      active: true,
      receives: "Each request to UniSphere, including IP address and browser details, in server logs.",
      why: "To serve the site and keep it available.",
    },
    {
      id: "r2",
      name: "Cloudflare R2",
      role: "File storage",
      active: i.r2,
      receives: "Photos, attachments and, for the blue tick, an identity document until it is reviewed.",
      why: "To store the files you upload. Private files open only through short-lived links.",
    },
    {
      id: "email",
      name: "Resend",
      role: "Transactional email",
      active: i.email,
      receives: "Your email address, name and the text of the email (confirmation, security and notification emails).",
      why: "To send the emails you need or asked for.",
    },
    {
      id: "redis",
      name: "A Redis cache",
      role: "Rate limiting and short-lived cache",
      active: i.redis,
      receives: "Counters keyed by IP address or account id, cached settings, and short-lived cached AI results (keyed by a hash of the request).",
      why: "To slow down abuse and keep the site fast.",
    },
    {
      id: "groq",
      name: "Groq",
      role: "AI model provider",
      active: i.groq,
      consent: "ai_assist",
      receives: "The text you submit to an AI feature (with obvious emails, phone numbers and ID numbers masked), only after you allow AI features.",
      why: "To produce the suggestion, summary or search terms you asked for.",
    },
    {
      id: "ai_fallback",
      name: "A backup AI provider",
      role: "AI model provider (used if the first is unavailable)",
      active: i.aiFallback,
      consent: "ai_assist",
      receives: "The same as above, only when the first provider fails.",
      why: "To keep AI features working.",
    },
    {
      id: "embeddings",
      name: embeddingName,
      role: "Embeddings for related-idea search",
      active: i.embeddings,
      consent: "ai_discovery_index",
      receives:
        "Your public or college-visible posts, projects and profile summary (only after you allow AI indexing), and the text of a search you run while AI features are allowed.",
      why: "To turn text into numbers so related work can be found.",
    },
    {
      id: "nvidia",
      name: "NVIDIA hosted models",
      role: "AI model provider for the Daily Challenge",
      active: i.nvidia,
      receives: "No member data. It drafts the daily quiz questions from UniSphere's own instructions.",
      why: "To write the Daily Challenge.",
    },
    {
      id: "payment_gateway",
      name: payment.label ?? "A payment gateway",
      role: "Payment provider (blue tick only)",
      active: payment.configured,
      receives: "Your name and email address, which UniSphere passes along when you start a payment, and what you enter on the gateway's own payment page. UniSphere receives only the order and payment reference, amount and status.",
      why: "To take the one-time blue tick payment.",
    },
    {
      id: "push",
      name: "Your browser's push service",
      role: "Delivers notifications you switch on",
      active: i.push,
      receives: "A push address your browser creates, and the notification text.",
      why: "To show notifications on your device. You can switch them off in your browser at any time.",
    },
    {
      id: "fcm",
      name: "Google (Firebase Cloud Messaging)",
      role: "Delivers notifications to the Android app",
      active: i.fcm,
      receives: "A token that identifies the UniSphere app on your phone, and the notification text. No message text is included.",
      why: "To show notifications on your phone when you switch them on in the app. You can switch them off in the app or in your phone's settings at any time.",
    },
  ];
  return all.filter((p) => p.active);
}

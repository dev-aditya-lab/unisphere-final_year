import "server-only";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { getEnv, getIntegrations } from "@/lib/env";

let resend;
let smtp;

/**
 * Send a transactional email. Never pretends: the result says exactly what happened.
 *
 *   { ok: true,  provider: 'resend' | 'dev-smtp', id }
 *   { ok: false, reason: 'not_configured' | 'provider_error' | 'invalid', error }
 *
 * - With RESEND_API_KEY: sent through Resend (idempotency key supported).
 * - Outside production with EMAIL_DEV_MAILPIT=true (or no key): delivered to local Mailpit over SMTP.
 * - Without it, in production: fails with reason 'not_configured' (callers record the failure).
 */
export async function sendEmail({ to, subject, html, text, idempotencyKey, replyTo }) {
  const env = getEnv();
  const integrations = getIntegrations();

  if (!to || !subject || !html) {
    return { ok: false, reason: "invalid", error: "Missing recipient, subject or body" };
  }

  if (integrations.email && !integrations.emailViaMailpit) {
    try {
      resend ??= new Resend(env.RESEND_API_KEY);
      const { data, error } = await resend.emails.send(
        {
          from: env.EMAIL_FROM,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          text,
          replyTo: replyTo || env.EMAIL_REPLY_TO || undefined,
        },
        idempotencyKey ? { idempotencyKey } : undefined,
      );
      if (error) return { ok: false, reason: "provider_error", error: error.message || String(error) };
      return { ok: true, provider: "resend", id: data?.id };
    } catch (err) {
      return { ok: false, reason: "provider_error", error: err?.message || "Resend request failed" };
    }
  }

  if (integrations.emailViaMailpit) {
    try {
      smtp ??= nodemailer.createTransport({
        host: env.SMTP_DEV_HOST,
        port: env.SMTP_DEV_PORT,
        secure: false,
        tls: { rejectUnauthorized: false },
        connectionTimeout: 3000,
      });
      const info = await smtp.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
      return { ok: true, provider: "dev-smtp", id: info.messageId };
    } catch (err) {
      return {
        ok: false,
        reason: "not_configured",
        error: `Local Mailpit SMTP (${env.SMTP_DEV_HOST}:${env.SMTP_DEV_PORT}) is unreachable: ${err.message}`,
      };
    }
  }

  return { ok: false, reason: "not_configured", error: "Email delivery is not configured (RESEND_API_KEY missing)." };
}

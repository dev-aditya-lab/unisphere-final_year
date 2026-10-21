import { publicEnv } from "@/lib/env-public";
import { APP_NAME } from "@/lib/constants";
import { privacyContact } from "@/lib/privacy/config";

/** Escape untrusted text before placing it in HTML. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const C = {
  ink: "#1B1812",
  indigo: "#1B1812",
  ivory: "#FBF6EC",
  slate: "#675F52",
  border: "#E4D9C6",
};

/** Branded transactional layout (table-based, inline styles, works in major clients). */
export function renderEmail({ preheader = "", heading, paragraphs = [], cta, code, footnote, transactional = false }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.ink};">${p}</p>`).join("");
  const codeBlock = code
    ? `<div style="margin:8px 0 24px;padding:16px 20px;background:${C.ivory};border:1px solid ${C.border};border-radius:8px;text-align:center;font-family:'SFMono-Regular',Consolas,monospace;font-size:28px;letter-spacing:8px;font-weight:700;color:${C.ink};">${esc(code)}</div>`
    : "";
  const button = cta
    ? `<p style="margin:8px 0 24px;"><a href="${esc(cta.url)}" style="display:inline-block;padding:12px 22px;background:${C.indigo};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">${esc(cta.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:${C.slate};">If the button does not work, paste this link into your browser:<br><span style="word-break:break-all;">${esc(cta.url)}</span></p>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.ivory};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;color:${C.ink};">
        <img src="${publicEnv.appUrl}/logo-mark.png" width="28" height="28" alt="" style="vertical-align:middle;margin-right:8px;border-radius:6px;background:#FBF6EC;">${APP_NAME}
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${C.border};border-radius:12px;padding:32px 28px;font-family:Inter,Arial,sans-serif;">
        <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:${C.ink};">${esc(heading)}</h1>
        ${body}${codeBlock}${button}
        ${footnote ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${C.slate};">${footnote}</p>` : ""}
      </td></tr>
      <tr><td style="padding:20px 4px 0;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.slate};">
        ${transactional
          ? `You are receiving this because this address was used on ${APP_NAME}. If that was not you, you can ignore this email.`
          : `You are receiving this because of activity on your ${APP_NAME} account. <a href="${publicEnv.appUrl}/settings/notifications" style="color:${C.slate};">Manage email preferences</a>.`}
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

  const text = [heading, "", ...paragraphs.map((p) => p.replace(/<[^>]+>/g, "")), code ? `Code: ${code}` : "", cta ? `${cta.label}: ${cta.url}` : ""]
    .filter((l) => l !== undefined)
    .join("\n");
  return { html, text };
}

// ── Concrete templates ───────────────────────────────────────────────────────

/** Sign-up confirmation. Sent by UniSphere (not by Supabase), so it carries our design and our domain. */
export function confirmEmailEmail({ name, url }) {
  return {
    subject: `Confirm your ${APP_NAME} account`,
    ...renderEmail({
      transactional: true,
      preheader: "One tap to finish creating your account.",
      heading: "Confirm your email address",
      paragraphs: [`Hi ${esc(name || "there")},`, `Welcome to ${APP_NAME}. Confirm your email address to finish creating your account. It takes one tap.`],
      cta: { label: "Confirm my email", url },
      footnote: "This link works once and expires in 24 hours. If you did not create an account, ignore this email and nothing will happen.",
    }),
  };
}

/** Password reset link. */
export function resetPasswordEmail({ name, url }) {
  return {
    subject: `Reset your ${APP_NAME} password`,
    ...renderEmail({
      transactional: true,
      preheader: "A link to choose a new password.",
      heading: "Reset your password",
      paragraphs: [`Hi ${esc(name || "there")},`, "Someone asked to reset the password for this account. If that was you, choose a new one with the button below."],
      cta: { label: "Choose a new password", url },
      footnote: "This link works once and expires in an hour. If you did not ask for it, ignore this email: your password stays the same.",
    }),
  };
}

/** Someone tried to sign up with an address that already has an account. Says so without exposing anything. */
export function accountExistsEmail() {
  return {
    subject: `You already have a ${APP_NAME} account`,
    ...renderEmail({
      transactional: true,
      preheader: "Log in, or reset your password if you forgot it.",
      heading: "You already have an account",
      paragraphs: [`Someone just tried to create a ${APP_NAME} account with this email address, but it already has one.`, "If that was you, log in. If you forgot your password, you can reset it."],
      cta: { label: "Log in", url: `${publicEnv.appUrl}/login` },
      footnote: `Forgot your password? Reset it at ${publicEnv.appUrl}/forgot-password. If this was not you, no action is needed.`,
    }),
  };
}


export function securityNoticeEmail({ name, title, detail }) {
  return {
    subject: `${APP_NAME} security notice: ${title}`,
    ...renderEmail({
      preheader: title,
      heading: title,
      paragraphs: [`Hi ${esc(name)},`, esc(detail)],
      cta: { label: "Review account security", url: `${publicEnv.appUrl}/settings/security` },
      footnote: "If this was not you, change your password immediately and sign out of other sessions.",
    }),
  };
}


export function contactReceiptEmail({ name }) {
  return {
    subject: `We received your message – ${APP_NAME}`,
    ...renderEmail({
      preheader: "Thanks for getting in touch.",
      heading: "Thanks for reaching out",
      paragraphs: [`Hi ${esc(name)},`, "We have received your message and will reply by email as soon as we can."],
    }),
  };
}

/** One email for everything pending: a single item reads as a normal notification, several as a digest. */
export function notificationEmail({ name, lines }) {
  const single = lines.length === 1;
  const items = lines.slice(0, 8).map((l) => `<strong>${esc(l.text)}</strong>${l.detail ? `<br><span style="color:#5B667B;">${esc(l.detail)}</span>` : ""}`);
  return {
    subject: single ? lines[0].text.slice(0, 120) : `You have ${lines.length} new notifications on ${APP_NAME}`,
    ...renderEmail({
      preheader: lines[0].text,
      heading: single ? "New on UniSphere" : `${lines.length} new notifications`,
      paragraphs: [`Hi ${esc(name)},`, ...items, lines.length > 8 ? `…and ${lines.length - 8} more.` : ""].filter(Boolean),
      cta: { label: "Open UniSphere", url: `${publicEnv.appUrl}/notifications` },
      footnote: "You can choose which emails you get in Settings → Notifications.",
    }),
  };
}

// ── Privacy ──────────────────────────────────────────────────────────────────

/** Receipt / update for a privacy request or grievance. Carries the reference, never the substance of the request. */
export function privacyRequestEmail({ heading, reference, lines, cta }) {
  return {
    subject: `${APP_NAME} privacy: ${heading} (${reference})`,
    ...renderEmail({
      transactional: true,
      preheader: heading,
      heading,
      paragraphs: [`Reference: <strong>${esc(reference)}</strong>`, ...lines.map((l) => esc(l))],
      cta,
      footnote: "You are receiving this because of a privacy request made with this email address.",
    }),
  };
}

/** Sent when an account has really been erased. The address is used once, for this, and is not kept. */
export function accountErasedEmail({ name, retained = [], reference }) {
  const kept = retained.length
    ? [`These records were kept, for the reasons given: ${retained.map((r) => esc(r)).join("; ")}.`]
    : ["Nothing was kept beyond an anonymous record that the erasure happened."];
  return {
    subject: `Your ${APP_NAME} account and data were erased`,
    ...renderEmail({
      transactional: true,
      preheader: "Your deletion request is complete.",
      heading: "Your account was erased",
      paragraphs: [`Hi ${esc(name || "there")},`, `As you asked, your ${APP_NAME} account and the data you owned were erased${reference ? ` (request ${esc(reference)})` : ""}.`, ...kept, "This is the last email we will send to this address about it."],
    }),
  };
}

/** Reminder that an erasure is scheduled, sent when it is requested. */
export function accountErasureScheduledEmail({ name, when }) {
  return {
    subject: `Your ${APP_NAME} account will be erased on ${when}`,
    ...renderEmail({
      transactional: true,
      preheader: "You can still change your mind.",
      heading: "Your deletion is scheduled",
      paragraphs: [`Hi ${esc(name || "there")},`, `You asked us to delete your ${APP_NAME} account. It will be erased on ${esc(when)}. Until then you can cancel and nothing changes.`],
      cta: { label: "Review or cancel", url: `${publicEnv.appUrl}/delete-account` },
      footnote: "If you did not ask for this, cancel it now and change your password.",
    }),
  };
}

/** A personal data breach notice to an affected member (Rule 7(1)). The body is written and approved by a person. */
export function breachNoticeEmail({ name, subject, body }) {
  return {
    subject,
    ...renderEmail({
      transactional: true,
      preheader: "An important notice about your personal data.",
      heading: subject,
      paragraphs: [`Hi ${esc(name || "there")},`, ...String(body).split(/\n{2,}/).map((p) => esc(p).replace(/\n/g, "<br>"))],
      footnote: `This notice is sent because of a security incident that involved your information. Questions: ${esc(privacyContact.name)}, ${esc(privacyContact.email)}.`,
    }),
  };
}

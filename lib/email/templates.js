import { publicEnv } from "@/lib/env-public";
import { APP_NAME } from "@/lib/constants";

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
  ink: "#17243A",
  indigo: "#3546A8",
  ivory: "#F7F5EF",
  slate: "#5B667B",
  border: "#E3E6ED",
};

/** Branded transactional layout (table-based, inline styles, works in major clients). */
export function renderEmail({ preheader = "", heading, paragraphs = [], cta, code, footnote }) {
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
      <tr><td style="padding:0 0 20px;font-family:Manrope,Arial,sans-serif;font-size:20px;font-weight:800;color:${C.ink};">
        <img src="${publicEnv.appUrl}/logo-mark.png" width="28" height="28" alt="" style="vertical-align:middle;margin-right:8px;border-radius:6px;background:#F7F5EF;">${APP_NAME}
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${C.border};border-radius:12px;padding:32px 28px;font-family:Inter,Arial,sans-serif;">
        <h1 style="margin:0 0 16px;font-family:Manrope,Arial,sans-serif;font-size:22px;line-height:1.3;color:${C.ink};">${esc(heading)}</h1>
        ${body}${codeBlock}${button}
        ${footnote ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${C.slate};">${footnote}</p>` : ""}
      </td></tr>
      <tr><td style="padding:20px 4px 0;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.slate};">
        You are receiving this because of activity on your ${APP_NAME} account.
        <a href="${publicEnv.appUrl}/settings/notifications" style="color:${C.slate};">Manage email preferences</a>.
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

export function collegeEmailCodeEmail({ name, code, collegeName, minutes = 15 }) {
  return {
    subject: `${code} is your ${APP_NAME} verification code`,
    ...renderEmail({
      preheader: `Use this code to verify your ${collegeName} email.`,
      heading: "Verify your college email",
      paragraphs: [
        `Hi ${esc(name)},`,
        `Enter this code on UniSphere to confirm you have access to your ${esc(collegeName)} email address. It expires in ${minutes} minutes.`,
      ],
      code,
      footnote: "If you did not request this, you can safely ignore this email. Nobody can verify your college without this code.",
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

export function verificationDecisionEmail({ name, approved, reason }) {
  return {
    subject: approved ? "Your college verification was approved" : "Update on your college verification",
    ...renderEmail({
      preheader: approved ? "You now have a verified badge." : "We need a little more information.",
      heading: approved ? "You are verified" : "Verification not approved",
      paragraphs: approved
        ? [`Hi ${esc(name)},`, "Your college membership has been verified. A verified badge now appears on your profile."]
        : [`Hi ${esc(name)},`, `A reviewer could not approve your request. ${reason ? `Reason: ${esc(reason)}` : ""}`, "You can submit a new request with more details at any time."],
      cta: { label: approved ? "Open UniSphere" : "Try again", url: `${publicEnv.appUrl}/settings/verification` },
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

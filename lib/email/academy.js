import { publicEnv } from "@/lib/env-public";
import { getEnv } from "@/lib/env";
import { formatMoney } from "@/lib/academy/money";
import { esc, renderEmail } from "@/lib/email/templates";

/** The name printed in the mail header and footer. The sender address itself is ACADEMY_EMAIL_FROM. */
export const ACADEMY_BRAND = "UniSphere Academy";

/** Where an Academy mail comes from: `UniSphere Academy <no-reply@system.unispheres.in>` unless the owner set another. */
export const academySender = () => getEnv().ACADEMY_EMAIL_FROM;

const PREFS = "/settings/notifications";

/** Payment receipt, sent once when an order is first recorded as paid. Every figure comes from the stored order, not the browser. */
export function academyReceiptEmail({ name, order, title }) {
  const money = (minor) => formatMoney(minor, { withZero: true });
  const rows = [["Course", esc(title)], ["Order", esc(order.order_no)], ["Price", money(order.list_minor)]];
  const off = Number(order.sale_discount_minor) + Number(order.coupon_discount_minor);
  if (off > 0) rows.push([order.coupon_code ? `Discount (${esc(order.coupon_code)})` : "Discount", `− ${money(off)}`]);
  if (order.tax_mode === "exclusive" && Number(order.tax_minor) > 0) rows.push(["Tax", money(order.tax_minor)]);
  rows.push(["Paid", `<strong>${money(order.total_minor)}</strong>`]);
  if (order.tax_mode === "inclusive" && Number(order.tax_minor) > 0) rows.push(["Includes tax", money(order.tax_minor)]);
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#5B667B;">${k}</td><td style="padding:6px 0;text-align:right;">${v}</td></tr>`)
    .join("")}</table>`;
  const unesc = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const plain = rows.map(([k, v]) => unesc(`${k}: ${String(v).replace(/<[^>]+>/g, "")}`));
  const common = {
    transactional: true,
    brand: ACADEMY_BRAND,
    prefsPath: PREFS,
    preheader: `Your payment for ${title} was received.`,
    heading: "Payment received",
    cta: { label: "Start learning", url: `${publicEnv.appUrl}/academy/my-learning` },
    footnote: "Keep this email as your receipt. Refunds follow the Refund Policy on our website.",
  };
  const intro = [`Hi ${esc(name || "there")},`, "Thank you. You are enrolled, and your course is ready to start."];
  const html = renderEmail({ ...common, paragraphs: [...intro, table] }).html;
  // The plain-text part is built from the same rows, not from the HTML table with its tags stripped.
  const text = renderEmail({ ...common, paragraphs: [...intro, ...plain] }).text;
  return { subject: `Receipt for ${title} (${order.order_no})`.slice(0, 150), html, text };
}

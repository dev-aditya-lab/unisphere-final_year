// Money for the Academy. Every amount is an integer in minor units (paise); nothing here uses floating point to decide a price.
// The database is the only place a price is worked out (see docs/ACADEMY.md); this file only shows amounts and reads typed ones.

/** Is `iso` less than `days` days ago? (Lives here, not in a page, because it reads the clock.) */
export const withinDays = (iso, days) => Boolean(iso) && Date.now() - new Date(iso).getTime() < Number(days) * 86_400_000;

/** 12345 -> "₹123.45", 12300 -> "₹123". Accepts a number or a numeric string (the database returns bigint as a string sometimes). */
export function formatMoney(minor, { withZero = false, currency = "INR" } = {}) {
  const n = Number(minor);
  if (!Number.isFinite(n)) return "—";
  const whole = n % 100 === 0 && !withZero;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n / 100);
}

/** "999" or "999.50" typed by an administrator -> paise, or null if it is not a valid amount (0 is valid: free). */
export function toMinor(input, { max = 100_000_000 } = {}) {
  const text = String(input ?? "").trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  // Built from the digits, not from Number(text) * 100, so 19.99 can never become 1998.9999999.
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return minor <= max ? minor : null;
}

/** 12300 -> "123", 12345 -> "123.45" (for a text field). */
export const minorToInput = (minor) => {
  const n = Number(minor);
  if (!Number.isFinite(n)) return "";
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
};

/** Basis points: 1800 -> "18%", 1825 -> "18.25%". */
export const formatBps = (bps) => {
  const n = Number(bps);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 100).toFixed(n % 100 === 0 ? 0 : 2).replace(/\.00$/, "")}%`;
};

/** "18" or "18.25" typed as a percent -> basis points (1800, 1825), or null. */
export function percentToBps(input) {
  const text = String(input ?? "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return bps >= 1 && bps <= 10000 ? bps : null;
}

/**
 * The lines a buyer sees before paying, from a quote returned by the database. Only presents it; adds nothing up itself
 * except to label which lines are shown.
 */
export function quoteLines(q) {
  if (!q?.ok) return [];
  const lines = [{ key: "list", label: "Course price", minor: q.list_minor }];
  if (q.sale) lines.push({ key: "sale", label: q.sale.label, minor: -q.sale.discount_minor, note: q.sale.ends_at ? `until ${new Date(q.sale.ends_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}` : null });
  if (q.coupon) lines.push({ key: "coupon", label: `Coupon ${q.coupon.code}`, minor: -q.coupon.discount_minor });
  if (q.tax?.mode === "exclusive" && q.tax.minor > 0) lines.push({ key: "tax", label: `${q.tax.label} (${formatBps(q.tax.rate_bps)})`, minor: q.tax.minor });
  return lines;
}

/** "Includes ₹152.54 GST (18%)" when tax is inside the price, else null. */
export function inclusiveTaxNote(q) {
  if (q?.tax?.mode !== "inclusive" || !(q.tax.minor > 0)) return null;
  return `Includes ${formatMoney(q.tax.minor, { withZero: true })} ${q.tax.label} (${formatBps(q.tax.rate_bps)})`;
}

/** What a catalogue card shows for one course, from academy_catalog_prices(). */
export function priceSummary(p) {
  if (!p) return { label: "Price unavailable", free: false };
  if (p.sold_out) return { label: "Sold out", soldOut: true };
  if (p.free) return { label: "Free", free: true };
  return {
    label: formatMoney(p.total_minor),
    was: p.sale ? formatMoney(p.list_minor) : null,
    saleLabel: p.sale?.label ?? null,
    saleEnds: p.sale?.ends_at ?? null,
    taxNote: p.tax?.mode === "exclusive" && p.tax.minor > 0 ? `+ ${p.tax.label}` : p.tax?.mode === "inclusive" && p.tax.minor > 0 ? `incl. ${p.tax.label}` : null,
    seatsLeft: p.seats_left ?? null,
  };
}

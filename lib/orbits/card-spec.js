// What an Orbit Card says, built from real, already-authorised data (pure: no I/O, easy to test). The renderer draws
// exactly these strings, so a card can never contain a rank, name or number that did not come from the caller's data.
import { PERIODS, SCOPES } from "@/lib/orbits/icons";

const ORD = (n) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th"}`;
};

/**
 * @param {object} input
 *   kind: 'rank' | 'achievement' | 'streak' | 'balance'
 *   name: display name; username: handle (the caller decides whether to include either, per privacy)
 *   rank, scope, period, score, title, description, icon, days, balance
 * @returns {{headline:string, sub:string, badge:{name?:string, rank?:number}, who:string|null, handle:string|null, footer:string, shareText:string}}
 */
export function buildCardSpec({ kind, name = null, username = null, rank = null, scope = null, period = null, score = null, title = null, icon = "award", days = null, balance = null, url = null }) {
  const who = name || null;
  const handle = username ? `@${username}` : null;
  const scopeLabel = SCOPES.find((s) => s.value === scope)?.label;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;
  let headline;
  let sub;
  let badge;
  if (kind === "rank") {
    // A live position, not an earned badge: it says where the member stands now, and that a week or month is still running.
    const word = scope === "college" ? "college" : scope === "connections" ? "connections" : "global";
    const running = period === "weekly" || period === "monthly";
    headline = `${ORD(rank)} on the ${word} leaderboard`;
    sub = [periodLabel ? `${periodLabel}${running ? " so far" : ""}` : null, score != null ? `${score.toLocaleString("en-IN")} Orbits` : null].filter(Boolean).join(" · ");
    badge = { rank: rank >= 1 && rank <= 10 ? rank : undefined, name: rank > 10 ? "award" : undefined };
  } else if (kind === "streak") {
    headline = `${days}-day Orbit Streak`;
    sub = "Contributed every day";
    badge = { name: "flame" };
  } else if (kind === "balance") {
    headline = `${Number(balance).toLocaleString("en-IN")} Orbits earned`;
    sub = "Orbit Balance";
    badge = { name: "orbit" };
  } else {
    headline = title;
    sub = [scopeLabel && rank ? `${ORD(rank)} · ${scopeLabel}` : null, periodLabel].filter(Boolean).join(" · ") || "Orbit Badge";
    badge = { name: icon, rank: kind === "achievement" && rank >= 1 && rank <= 10 ? rank : undefined };
  }
  const shareText = kind === "rank"
    ? `${who ? `${who} is` : "I'm"} ${headline} on UniSphere (${sub})`
    : [`${who ? `${who} earned` : "I earned"} ${headline} on UniSphere`, sub !== "Orbit Badge" ? `(${sub})` : null].filter(Boolean).join(" ");
  return { headline, sub, badge, who, handle, footer: url ? url.replace(/^https?:\/\//, "") : "UniSphere · Orbits", shareText: url ? `${shareText} ${url}` : shareText };
}

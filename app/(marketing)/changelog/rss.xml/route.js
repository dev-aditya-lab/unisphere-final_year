import { publicEnv } from "@/lib/env-public";
import { RELEASE_KINDS } from "@/lib/feedback-meta";
import { listReleases } from "@/lib/services/feedback";

export const revalidate = 300;

const esc = (s) => String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const label = (k) => RELEASE_KINDS.find((x) => x.value === k)?.label ?? k;

export async function GET() {
  const releases = await listReleases();
  const base = publicEnv.appUrl;
  const items = releases.map((r) => {
    const body = `<p>${esc(r.summary ?? "")}</p><ul>${r.items.map((i) => `<li><strong>${esc(label(i.kind))}:</strong> ${esc(i.text)}</li>`).join("")}</ul>`;
    return `<item><title>${esc(`v${r.version}: ${r.title}`)}</title><link>${base}/changelog#v${esc(r.version)}</link><guid isPermaLink="true">${base}/changelog#v${esc(r.version)}</guid><pubDate>${new Date(r.published_at).toUTCString()}</pubDate><description>${esc(body)}</description></item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>UniSphere changelog</title><link>${base}/changelog</link><description>What is new in UniSphere, the campus network of Ramgarh Engineering College.</description><language>en-in</language>${items.join("")}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

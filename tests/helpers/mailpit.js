// Tiny Mailpit client used by tests to read the emails the app/Supabase "sent".
const BASE = process.env.MAILPIT_URL || "http://127.0.0.1:55324";

export async function waitForEmail(to, { subjectIncludes, timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (res.ok) {
      const { messages } = await res.json();
      const hit = (messages ?? []).find((m) => !subjectIncludes || m.Subject.includes(subjectIncludes));
      if (hit) {
        const full = await (await fetch(`${BASE}/api/v1/message/${hit.ID}`)).json();
        return { subject: full.Subject, html: full.HTML, text: full.Text };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} (${subjectIncludes ?? "any"}) within ${timeoutMs}ms`);
}

/** First link in an email body whose URL contains `fragment`. */
export function extractLink(body, fragment) {
  const urls = [...String(body).matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0].replace(/&amp;/g, "&"));
  const url = urls.find((u) => u.includes(fragment));
  if (!url) throw new Error(`No link containing ${fragment} found`);
  return url;
}

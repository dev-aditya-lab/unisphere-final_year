// Video lessons play from a short list of providers, never from an address typed into a page.
// A lesson stores (provider, ref). The player builds the embed address here, so only these two hosts can ever be framed
// (and lib/security/csp.js lets exactly these two hosts into frame-src, on Academy pages only). Self-hosted video files are not
// offered: the page policy would block an arbitrary host, and an open list would defeat it.

export const VIDEO_PROVIDERS = {
  youtube: { label: "YouTube", host: "https://www.youtube-nocookie.com" },
  vimeo: { label: "Vimeo", host: "https://player.vimeo.com" },
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

/** A pasted YouTube or Vimeo link (or just the video id) -> { provider, ref }, or null. */
export function parseVideoInput(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  if (YT_ID.test(text)) return { provider: "youtube", ref: text };
  if (VIMEO_ID.test(text)) return { provider: "vimeo", ref: text };
  let u;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return YT_ID.test(id) ? { provider: "youtube", ref: id } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    return id && YT_ID.test(id) ? { provider: "youtube", ref: id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/(?:\/video)?\/(\d{6,12})/)?.[1];
    return id ? { provider: "vimeo", ref: id } : null;
  }
  return null;
}

/** What the player renders: the embed address for a valid (provider, ref) pair; null if the pair is not valid. */
export function videoSource(provider, ref) {
  if (provider === "youtube" && YT_ID.test(ref ?? "")) return { type: "iframe", src: `${VIDEO_PROVIDERS.youtube.host}/embed/${ref}?rel=0&modestbranding=1` };
  if (provider === "vimeo" && VIMEO_ID.test(ref ?? "")) return { type: "iframe", src: `${VIDEO_PROVIDERS.vimeo.host}/video/${ref}?dnt=1` };
  return null;
}

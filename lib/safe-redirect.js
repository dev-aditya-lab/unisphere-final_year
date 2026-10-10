/**
 * Only allow same-origin relative paths as post-auth redirect targets.
 * Rejects absolute URLs, protocol-relative URLs ("//evil.com"), backslash tricks
 * and anything containing control characters.
 */
export function safeNext(next, fallback = "/") {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://placeholder.local");
    if (url.origin !== "http://placeholder.local") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

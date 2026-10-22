import "server-only";
import { getEnv } from "@/lib/env";

/**
 * Malware / document scanning boundary for uploads that can carry active content (PDFs). Images never reach this: they
 * are decoded and re-checked by `inspectImage`.
 *
 * No scanning engine ships with UniSphere. When `UPLOAD_SCAN_URL` is set, the file is POSTed to that service
 * (`Content-Type: application/octet-stream`) and it must answer JSON `{ "clean": true | false }` within the timeout;
 * anything else counts as NOT clean, so a broken scanner can never wave a file through. Without it, the result says
 * `scanned: false` and callers must not describe the file as scanned. See docs/SECURITY.md.
 *
 * @returns {Promise<{ scanned: boolean, clean: boolean }>}
 */
export async function scanUpload(bytes, { fetchImpl = fetch } = {}) {
  const { UPLOAD_SCAN_URL, UPLOAD_SCAN_TOKEN, UPLOAD_SCAN_TIMEOUT_MS } = getEnv();
  if (!UPLOAD_SCAN_URL) return { scanned: false, clean: true };
  try {
    const res = await fetchImpl(UPLOAD_SCAN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", ...(UPLOAD_SCAN_TOKEN ? { Authorization: `Bearer ${UPLOAD_SCAN_TOKEN}` } : {}) },
      body: bytes,
      signal: AbortSignal.timeout(UPLOAD_SCAN_TIMEOUT_MS),
    });
    if (!res.ok) return { scanned: false, clean: false };
    const body = await res.json();
    return { scanned: true, clean: body?.clean === true };
  } catch {
    return { scanned: false, clean: false };
  }
}

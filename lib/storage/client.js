"use client";

/**
 * Upload a file through the app (/api/upload) with progress reporting.
 * Resolves to { ok: true, fileId, key } or { ok: false, error, aborted? }. Pass `signal` to make it cancellable:
 * aborting stops the transfer and resolves { ok: false, aborted: true } (never rejects).
 */
export function uploadFileWithProgress(file, purpose, onProgress, { signal } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, aborted: true, error: "Cancelled." });
    const body = new FormData();
    body.append("purpose", purpose);
    body.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = (value) => {
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onabort = () => done({ ok: false, aborted: true, error: "Cancelled." });
    xhr.onerror = () => done({ ok: false, error: "Network error. Check your connection and try again." });
    xhr.onload = () => {
      const res = xhr.response;
      if (res && typeof res === "object") done(res);
      else done({ ok: false, error: "Unexpected response from the server." });
    };
    xhr.send(body);
  });
}

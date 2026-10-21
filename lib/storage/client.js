"use client";

// Uploads that are running right now, by what they are: the same picked file, for the same purpose. A double-click on
// "choose", a re-render that starts the effect twice, or a retry while the first try is still going joins the running
// upload instead of storing the same bytes again. Entries are removed the moment an upload ends, so a later, deliberate
// upload of the same file (after it was removed, or failed) always starts fresh.
const inFlight = new Map();

const identity = (file, purpose) => [purpose, file.name, file.size, file.lastModified, file.type].join("|");

/**
 * Upload a file through the app (/api/upload) with progress reporting.
 * Resolves to { ok: true, fileId, key } or { ok: false, error, aborted? }. Pass `signal` to make it cancellable:
 * aborting stops the transfer and resolves { ok: false, aborted: true } (never rejects).
 * Asking again for a file that is already uploading shares that upload (each caller still gets progress and can cancel
 * its own wait; the transfer stops only when the caller that started it cancels).
 */
export function uploadFileWithProgress(file, purpose, onProgress, { signal } = {}) {
  const id = identity(file, purpose);
  const running = inFlight.get(id);
  if (running && !running.signal?.aborted) {
    if (onProgress) running.listeners.add(onProgress);
    return waitFor(running.promise, signal, () => running.listeners.delete(onProgress));
  }

  const entry = { signal, listeners: new Set(onProgress ? [onProgress] : []), promise: null };
  entry.promise = send(file, purpose, (pct) => entry.listeners.forEach((fn) => fn(pct)), signal).finally(() => {
    if (inFlight.get(id) === entry) inFlight.delete(id);
  });
  inFlight.set(id, entry);
  return entry.promise;
}

/** A caller that joined a running upload can stop waiting without stopping it. */
function waitFor(promise, signal, leave) {
  if (!signal) return promise;
  return new Promise((resolve) => {
    const cancelled = { ok: false, aborted: true, error: "Cancelled." };
    if (signal.aborted) {
      leave();
      return resolve(cancelled);
    }
    const onAbort = () => {
      leave();
      resolve(cancelled);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    });
  });
}

function send(file, purpose, onProgress, signal) {
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
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
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

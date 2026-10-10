"use client";

/**
 * Upload a file through the app (/api/upload) with progress reporting.
 * Resolves to { ok: true, fileId, key } or { ok: false, error }.
 */
export function uploadFileWithProgress(file, purpose, onProgress) {
  return new Promise((resolve) => {
    const body = new FormData();
    body.append("purpose", purpose);
    body.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error. Check your connection and try again." });
    xhr.onload = () => {
      const res = xhr.response;
      if (res && typeof res === "object") resolve(res);
      else resolve({ ok: false, error: "Unexpected response from the server." });
    };
    xhr.send(body);
  });
}

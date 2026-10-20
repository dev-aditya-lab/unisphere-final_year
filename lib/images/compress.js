"use client";

import { compressImage, wantsCompression } from "@/lib/images/compress-core";

let worker = null;
let workerBroken = false;
let nextId = 1;
const waiting = new Map();

function getWorker() {
  if (workerBroken || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./compress.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (event) => {
        const { id, blob, changed } = event.data;
        waiting.get(id)?.({ blob, changed });
        waiting.delete(id);
      };
      worker.onerror = () => {
        // A worker that cannot start (CSP, old browser): finish what is waiting on the main thread and stop trying.
        workerBroken = true;
        worker = null;
        waiting.forEach((resolve) => resolve(null));
        waiting.clear();
      };
    } catch {
      workerBroken = true;
      return null;
    }
  }
  return worker;
}

const mainThreadEnv = {
  createCanvas: (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  },
  encode: (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)),
};

function viaWorker(file) {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    w.postMessage({ id, blob: file });
  });
}

/**
 * Returns a File that is ready to upload: the original when compression is unnecessary, unsupported, not worth it,
 * or switched off (`original: true`, the member asked for full quality).
 * @returns {Promise<{ file: File, changed: boolean, before: number, after: number }>}
 */
export async function prepareImageForChat(file, { original = false } = {}) {
  const same = { file, changed: false, before: file.size, after: file.size };
  if (original || !wantsCompression(file)) return same;
  let result = await viaWorker(file);
  if (!result) result = await compressImage(file, mainThreadEnv).catch(() => null);
  if (!result?.changed) return same;
  const out = new File([result.blob], file.name.replace(/\.[^.]+$/, "") + extFor(result.blob.type), { type: result.blob.type, lastModified: Date.now() });
  return { file: out, changed: true, before: file.size, after: out.size };
}

function extFor(type) {
  return type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg";
}

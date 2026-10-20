// Web Worker: compresses one image off the main thread. Message in: { id, blob }. Message out: { id, blob, changed }.
import { compressImage } from "./compress-core";

const env = {
  createCanvas: (w, h) => new OffscreenCanvas(w, h),
  encode: (canvas, type, quality) => canvas.convertToBlob({ type, quality }),
};

self.onmessage = async (event) => {
  const { id, blob } = event.data;
  try {
    const result = await compressImage(blob, env);
    self.postMessage({ id, blob: result.blob, changed: result.changed });
  } catch {
    self.postMessage({ id, blob, changed: false });
  }
};

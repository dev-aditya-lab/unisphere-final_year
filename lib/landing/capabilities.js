/** Media queries the landing page's motion branches on. Pinned "hold" sections need room; everything respects reduced motion. */
export const MQ = {
  motion: "(prefers-reduced-motion: no-preference)",
  pins: "(min-width: 1024px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)",
  finePointer: "(hover: hover) and (pointer: fine)",
};

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the sheryjs enhancements (custom cursor, magnetic buttons, letter-by-letter labels, hover pictures, the WebGL
 * image effect) should run. They are a desktop nicety: they need a mouse, motion allowed, a wide screen and a device and
 * connection that can spare the extra download (about 125 KB of three.js, gzipped), so phones, data-saver mode, slow links and low
 * memory devices get the page without them and lose nothing but the polish.
 */
export function sheryCapabilities() {
  if (typeof window === "undefined") return { ok: false };
  const match = (query) => window.matchMedia(query).matches;
  if (!match(MQ.motion) || !match(MQ.finePointer) || window.innerWidth < 1024) return { ok: false };
  const connection = navigator.connection;
  if (connection && (connection.saveData || ["slow-2g", "2g", "3g"].includes(connection.effectiveType))) return { ok: false };
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return { ok: false };
  return { ok: true, webgl: hasWebGL() };
}

/**
 * Whether the hero's 3D planet may run: motion allowed, a screen wide enough for the hero to have room for it, WebGL available, and a
 * device and connection that can spare it (no data-saver, nothing slower than 4G, at least 4 GB where the browser says). Everyone
 * else keeps the still planet picture in the same place, which is the same artwork.
 */
export function heroSceneCapabilities() {
  if (typeof window === "undefined") return { ok: false };
  if (!window.matchMedia(MQ.motion).matches || window.innerWidth < 900) return { ok: false };
  const connection = navigator.connection;
  if (connection && (connection.saveData || ["slow-2g", "2g", "3g"].includes(connection.effectiveType))) return { ok: false };
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return { ok: false };
  return { ok: hasWebGL() };
}

// A random identifier for one submission of a write (a post, a comment, a message). The server stores it with the row
// and refuses a second row with the same key, so a retry of a write whose response was lost cannot create a duplicate.

export function newOpId() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  // randomUUID needs a secure context; fall back to getRandomValues (still a version 4 UUID).
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Returns a function that gives the key to send for the current content. Resubmitting the same content (a retry)
 * reuses the key; changing the content, or calling `reset()` after a success, starts a new one.
 */
export function createOpTracker() {
  let current = null;
  return {
    keyFor(signature) {
      if (!current || current.signature !== signature) current = { signature, id: newOpId() };
      return current.id;
    },
    reset() {
      current = null;
    },
  };
}

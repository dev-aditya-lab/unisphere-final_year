import { z } from "zod";

/**
 * Keyset-pagination cursors are interpolated into PostgREST `.or(...)` filter strings, where a `,` or `)` changes the
 * meaning of the filter. They must therefore be a timestamp and a UUID and nothing else. PostgREST timestamps carry
 * microseconds, so the exact string is kept (never round-tripped through Date).
 */
export const CURSOR_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

export const cursorSchema = z.object({ ts: z.string().regex(CURSOR_TS), id: z.uuid() });

/** A well-formed `{ ts, id }`, or null for anything else (so a tampered link simply shows the first page). */
export function safeCursor(value) {
  const parsed = cursorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

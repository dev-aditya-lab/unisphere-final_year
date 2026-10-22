import { describe, expect, it } from "vitest";
import { safeCursor } from "@/lib/cursor";

const id = "7f9c2c1e-3b0a-4e44-9d0e-1a2b3c4d5e6f";

describe("pagination cursors (PostgREST filter injection)", () => {
  it("accepts the timestamps PostgREST returns, microseconds included", () => {
    expect(safeCursor({ ts: "2026-10-21T10:15:30.123456+00:00", id })).toEqual({ ts: "2026-10-21T10:15:30.123456+00:00", id });
    expect(safeCursor({ ts: "2026-10-21T10:15:30Z", id })).not.toBeNull();
  });

  it.each([
    "2026-10-21T10:15:30Z,user_id.neq.00000000-0000-0000-0000-000000000000",
    "2026-10-21T10:15:30Z),status.eq.deleted,and(id.gt.0",
    "x",
    "",
    "2026-10-21",
    ["2026-10-21T10:15:30Z"],
    undefined,
  ])("refuses a tampered timestamp %j", (ts) => expect(safeCursor({ ts, id })).toBeNull());

  it("refuses a tampered id", () => {
    expect(safeCursor({ ts: "2026-10-21T10:15:30Z", id: `${id},status.eq.deleted` })).toBeNull();
    expect(safeCursor({ ts: "2026-10-21T10:15:30Z", id: "1" })).toBeNull();
  });

  it("returns null for a missing cursor", () => {
    expect(safeCursor(null)).toBeNull();
    expect(safeCursor(undefined)).toBeNull();
  });
});

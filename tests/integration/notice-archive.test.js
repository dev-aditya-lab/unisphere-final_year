import { describe, expect, it } from "vitest";
import { admin } from "../helpers/supabase.js";
import { ensureNoticePublished } from "@/lib/privacy/consent";
import { CURRENT_NOTICE } from "@/lib/privacy/registry";
import { noticeFingerprint } from "@/lib/privacy/fingerprint";

/**
 * The privacy notice the build shows must exist in the immutable archive, with the content hash the code computes. The app does
 * this itself the first time anyone records a consent; this test does it on purpose, so a new database (or a new notice version)
 * is ready before the browser tests sign people in. Running it twice changes nothing.
 */
describe("the current privacy notice is archived", () => {
  it("publishes once, never changes, and matches the content the build computes", async () => {
    await ensureNoticePublished();
    const { data } = await admin.from("privacy_notice_versions").select("version, content_hash, reconsent_purposes").eq("version", CURRENT_NOTICE.version).single();
    expect(data.content_hash).toBe(noticeFingerprint());
    expect(data.reconsent_purposes).toEqual(CURRENT_NOTICE.reconsentPurposes);
    // idempotent: the same content again is accepted and reports it already exists
    const again = await admin.rpc("publish_privacy_notice", {
      p_version: CURRENT_NOTICE.version, p_effective_at: CURRENT_NOTICE.effectiveAt, p_hash: noticeFingerprint(), p_purposes: [], p_document: {}, p_reconsent: [], p_summary: "x",
    });
    expect(again.data).toBe("exists");
  });
});

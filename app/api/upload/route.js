import { NextResponse } from "next/server";
import { getAuthUser, hasPermission } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { uploadFile } from "@/lib/storage/uploads";
import { MAX_UPLOAD_BODY_BYTES, UPLOAD_PURPOSES } from "@/lib/storage/policy";
import { hasConsent } from "@/lib/privacy/consent";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Authenticated multipart upload: fields `purpose` and `file`. */
export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please log in." }, { status: 401 });

  // Refuse an oversized body from its headers, before reading any of it. A body with no declared length (chunked) is
  // still bounded by the framework's own buffer limit (experimental.proxyClientMaxBodySize, next.config.mjs).
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "That file is too large.", code: "too_large" }, { status: 413 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });
  }
  const purpose = String(form.get("purpose") ?? "");
  const file = form.get("file");
  if (!UPLOAD_PURPOSES[purpose] || !(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });
  }

  // Some purposes (badge pictures) are for staff only; the database refuses the row as well, this gives a clear answer first.
  const needs = UPLOAD_PURPOSES[purpose].permission;
  if (needs && !(await hasPermission(needs))) return NextResponse.json({ ok: false, error: "You do not have permission to upload this." }, { status: 403 });

  // An identity document is only accepted after the member agreed to reviewers opening it (purpose identity_verification).
  if (purpose === "verification_document" && !(await hasConsent(user.id, "identity_verification"))) {
    return NextResponse.json({ ok: false, error: "Please agree to the document review first." }, { status: 403 });
  }

  const result = await uploadFile({ user, purpose, file });
  const status = result.ok ? 200 : result.code === "rate_limited" ? 429 : result.code === "storage_unconfigured" ? 503 : 400;
  return NextResponse.json(result, { status });
}

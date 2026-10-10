import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { uploadFile } from "@/lib/storage/uploads";
import { UPLOAD_PURPOSES } from "@/lib/storage/policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Authenticated multipart upload: fields `purpose` and `file`. */
export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please log in." }, { status: 401 });

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

  const result = await uploadFile({ user, purpose, file });
  const status = result.ok ? 200 : result.code === "rate_limited" ? 429 : result.code === "storage_unconfigured" ? 503 : 400;
  return NextResponse.json(result, { status });
}

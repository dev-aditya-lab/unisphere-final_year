import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { getTemplatePdf } from "@/lib/services/academy-certificates";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** The uploaded template PDF, for the template editor's preview. The version is read through the caller's session: only template and certificate staff can. */
export async function GET(_request, { params }) {
  const { versionId } = await params;
  const user = await getAuthUser();
  if (!user || !z.uuid().safeParse(versionId).success) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  const limit = await rateLimit({ key: `acad-tpl-pdf:${user.id}`, limit: 120, windowSec: 600 });
  if (!limit.ok) return new NextResponse("Too many requests", { status: 429, headers: NO_STORE });
  let bytes;
  try {
    bytes = await getTemplatePdf(versionId);
  } catch {
    return new NextResponse("Storage unavailable", { status: 503, headers: NO_STORE });
  }
  if (!bytes) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  return new NextResponse(bytes, { headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="template.pdf"', "X-Content-Type-Options": "nosniff" } });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { getCertificatePdf } from "@/lib/services/academy-certificates";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * A certificate's PDF for its holder (while it is valid) or for certificate staff. The row is read through the caller's own session,
 * so Row Level Security decides who may see it; the file is streamed from private storage and never has a public address.
 */
export async function GET(_request, { params }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user || !z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  const limit = await rateLimit({ key: `acad-cert-pdf:${user.id}`, limit: 60, windowSec: 600 });
  if (!limit.ok) return new NextResponse("Too many requests", { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.resetSec) } });
  let file;
  try {
    file = await getCertificatePdf(id);
  } catch {
    return new NextResponse("Storage unavailable", { status: 503, headers: NO_STORE });
  }
  if (!file) return new NextResponse("Not found", { status: 404, headers: NO_STORE });
  return new NextResponse(file.bytes, {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file.certificateId}.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

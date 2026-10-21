import { NextResponse } from "next/server";
import { z } from "zod";
import { getReadableFile } from "@/lib/storage/uploads";

export const dynamic = "force-dynamic";

// How long the member's browser may reuse this answer for an image. Shorter than the signed URL's guaranteed life
// (five minutes), so a cached redirect never points at an expired URL.
const IMAGE_REDIRECT_CACHE = "private, max-age=120";
const NO_CACHE = "private, no-store";

/**
 * Authorised access to private files. Row Level Security on `files` decides who may
 * read a record (owner, or a viewer of the post / conversation it is attached to);
 * we then redirect to a short-lived signed URL. The object itself is never public, and nothing here may be kept by a
 * shared cache (`private`): the answer depends on who is asking.
 */
export async function GET(_request, { params }) {
  const { fileId } = await params;
  if (!z.uuid().safeParse(fileId).success) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": NO_CACHE } });
  }
  let file;
  try {
    file = await getReadableFile(fileId);
  } catch {
    return new NextResponse("Storage unavailable", { status: 503, headers: { "Cache-Control": NO_CACHE } });
  }
  if (!file) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": NO_CACHE } });
  return NextResponse.redirect(file.url, {
    status: 302,
    headers: { "Cache-Control": file.keepable ? IMAGE_REDIRECT_CACHE : NO_CACHE, "Referrer-Policy": "no-referrer", Vary: "Cookie" },
  });
}

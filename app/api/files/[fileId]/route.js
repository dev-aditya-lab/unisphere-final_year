import { NextResponse } from "next/server";
import { z } from "zod";
import { getReadableFileUrl } from "@/lib/storage/uploads";

export const dynamic = "force-dynamic";

/**
 * Authorised access to private files. Row Level Security on `files` decides who may
 * read a record (owner, or a viewer of the post / conversation it is attached to);
 * we then redirect to a short-lived signed URL. The object itself is never public.
 */
export async function GET(_request, { params }) {
  const { fileId } = await params;
  if (!z.uuid().safeParse(fileId).success) {
    return new NextResponse("Not found", { status: 404 });
  }
  let url;
  try {
    url = await getReadableFileUrl(fileId);
  } catch {
    return new NextResponse("Storage unavailable", { status: 503 });
  }
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=60", "Referrer-Policy": "no-referrer" },
  });
}

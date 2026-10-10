import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignDownload } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

// Only these purposes are public; the key shape is validated before touching storage.
const KEY_PATTERN =
  /^(avatar|cover|project_asset|community_image|event_banner)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Serves intentionally-public images (avatars, covers, banners) when no public bucket
 * is configured. Row Level Security on `files` only exposes those purposes, so private
 * attachments can never be reached through this route.
 */
export async function GET(_request, { params }) {
  const { key: parts } = await params;
  const key = Array.isArray(parts) ? parts.join("/") : "";
  if (!KEY_PATTERN.test(key)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: file } = await supabase
    .from("files")
    .select("bucket, storage_key, mime_type, status")
    .eq("storage_key", key)
    .maybeSingle();
  if (!file || file.status !== "ready") return new NextResponse("Not found", { status: 404 });

  try {
    const url = await presignDownload({
      visibility: file.bucket,
      key: file.storage_key,
      expiresIn: 600,
      contentType: file.mime_type,
    });
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=300" },
    });
  } catch {
    return new NextResponse("Storage unavailable", { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignDownload } from "@/lib/storage/r2";
import { CACHE_CONTROL, PUBLIC_SIGNING } from "@/lib/storage/cache";

export const dynamic = "force-dynamic";

// Only these purposes are public; the key shape is validated before touching storage.
const KEY_PATTERN =
  /^(avatar|cover|project_asset|community_image|event_banner|orbit_badge)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

// A canvas cannot read an image that comes from another domain (it would be tainted and could not be saved), and this
// route normally redirects to one. `?proxy=1` streams the same public image from this domain instead (the Orbit Card uses it).
const PROXY_MAX_BYTES = 8 * 1024 * 1024;

// The bytes at a key never change (a replacement gets a new key), so an answer may be reused for an hour, and for a
// day more while it is refreshed. The signed URL it points to is stable for a day (see PUBLIC_SIGNING), which keeps the
// target in the browser's cache; the redirect is cached for less than the URL is guaranteed to work.
const REDIRECT_CACHE = "public, max-age=3600, stale-while-revalidate=3600";
const PROXY_CACHE = "public, max-age=3600, stale-while-revalidate=86400";
// A key that does not exist (or is not ready) is answered from cache for a minute, so a broken link does not reach the
// database on every render.
const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

/**
 * Serves intentionally-public images (avatars, covers, banners) when no public bucket
 * is configured. Row Level Security on `files` only exposes those purposes, so private
 * attachments can never be reached through this route.
 */
export async function GET(request, { params }) {
  const { key: parts } = await params;
  const key = Array.isArray(parts) ? parts.join("/") : "";
  if (!KEY_PATTERN.test(key)) return notFound();

  const supabase = await createClient();
  const { data: file } = await supabase
    .from("files")
    .select("bucket, storage_key, mime_type, status")
    .eq("storage_key", key)
    .maybeSingle();
  if (!file || file.status !== "ready") return notFound();

  try {
    const url = await presignDownload({
      visibility: file.bucket,
      key: file.storage_key,
      contentType: file.mime_type,
      cacheControl: CACHE_CONTROL.publicImmutable,
      signing: PUBLIC_SIGNING,
    });
    if (new URL(request.url).searchParams.get("proxy") === "1") {
      const upstream = await fetch(url, { cache: "no-store" });
      const size = Number(upstream.headers.get("content-length") ?? 0);
      if (!upstream.ok || !upstream.body || size > PROXY_MAX_BYTES) return notFound();
      const headers = {
        "Content-Type": file.mime_type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": PROXY_CACHE,
      };
      // Pass the validators on so a browser that has the picture can ask "has it changed?" instead of downloading it.
      for (const name of ["etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) headers[name] = value;
      }
      return new NextResponse(upstream.body, { status: 200, headers });
    }
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": REDIRECT_CACHE } });
  } catch {
    return new NextResponse("Storage unavailable", { status: 503 });
  }
}

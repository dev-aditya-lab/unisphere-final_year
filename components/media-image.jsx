"use client";

import { useState } from "react";
import { mediaUrl } from "@/lib/media";

/**
 * A stored public picture (cover, banner). If a resized copy cannot be loaded (for example Cloudflare Image
 * Transformations is switched off or over its limit), it falls back to the stored original instead of showing nothing.
 * Renders nothing when there is no usable key, so the caller's placeholder shows.
 */
export function MediaImage({ mediaKey, width, alt = "", ...props }) {
  const [failedFor, setFailedFor] = useState(null);
  const resized = mediaUrl(mediaKey, { width });
  const original = mediaUrl(mediaKey);
  const src = failedFor === mediaKey ? original : resized;
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => resized !== original && setFailedFor(mediaKey)} {...props} />
  );
}

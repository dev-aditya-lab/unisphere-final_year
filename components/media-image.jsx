"use client";

import { useState } from "react";
import { mediaUrl } from "@/lib/media";

/**
 * A stored public picture (cover, banner, community icon). If a resized copy cannot be loaded (for example Cloudflare Image
 * Transformations is switched off or over its limit), it falls back to the stored original instead of showing nothing.
 * Renders nothing when there is no usable key, so the caller's placeholder shows.
 *
 * Two moments are covered. A picture that fails after the page is interactive raises `onError`. A picture that failed while the
 * page was still loading (the server sends the <img> tag first, and the browser asks for it before React is attached) never
 * raises anything React can hear, so the ref callback looks at the element once it exists: finished loading with no size means
 * it failed. Without this, a resized address that answers 404 left a blank box on a page that arrived from the server.
 */
export function MediaImage({ mediaKey, width, alt = "", ...props }) {
  const [failedFor, setFailedFor] = useState(null);
  const resized = mediaUrl(mediaKey, { width });
  const original = mediaUrl(mediaKey);
  const src = failedFor === mediaKey ? original : resized;
  if (!src) return null;
  const canFallBack = resized !== original && failedFor !== mediaKey;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      ref={(el) => {
        if (el && canFallBack && el.complete && el.naturalWidth === 0) queueMicrotask(() => setFailedFor(mediaKey));
      }}
      onError={() => canFallBack && setFailedFor(mediaKey)}
      {...props}
    />
  );
}

"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  post: "size-11 text-sm",
  lg: "size-14 text-base",
  xl: "size-24 text-2xl",
};

// The width each size is shown at, doubled for sharp screens: a 24 px avatar should not download a 1024 px photo.
const WIDTHS = { xs: 48, sm: 64, md: 96, post: 112, lg: 112, xl: 192 };

// The two illustrated pictures shown for a member who has not uploaded a photo (public/). The profile has no gender field, so a
// member gets one of the two by a fixed hash of their name: the same member always sees the same picture everywhere.
const DEFAULT_AVATARS = ["/male_D_avtar.jpg"];
export function defaultAvatarFor(name) {
  let h = 0;
  for (const ch of String(name ?? "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEFAULT_AVATARS[h % DEFAULT_AVATARS.length];
}

/**
 * Profile photo, or one of the illustrated default pictures when there is none, with an initials fallback (also shown if the picture is missing or fails to load). `avatarKey` is the
 * profiles.avatar_key value. If a resized copy cannot be loaded, the stored original is tried before the initials.
 */
export function UserAvatar({ name, avatarKey, size = "md", className }) {
  const [failedFor, setFailedFor] = useState(null);
  const resized = mediaUrl(avatarKey, { width: WIDTHS[size] });
  const original = mediaUrl(avatarKey);
  const src = avatarKey ? (failedFor === avatarKey ? original : resized) : defaultAvatarFor(name);
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {src && <AvatarImage src={src} alt="" onLoadingStatusChange={(status) => status === "error" && resized !== original && setFailedFor(avatarKey)} />}
      <AvatarFallback className="bg-accent text-accent-foreground font-semibold">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

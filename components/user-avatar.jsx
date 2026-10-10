import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-24 text-2xl",
};

/** Profile photo with an initials fallback. `avatarKey` is the profiles.avatar_key value. */
export function UserAvatar({ name, avatarKey, size = "md", className }) {
  const src = mediaUrl(avatarKey);
  return (
    <Avatar className={cn(SIZES[size], className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="bg-accent text-accent-foreground font-semibold">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

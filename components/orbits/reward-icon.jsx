import Image from "next/image";
import { rewardIconSrc } from "@/lib/orbits/icons";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * One 3D reward illustration from public/icons/reward. The artwork is transparent and is only ever drawn with
 * object-contain at its own aspect ratio, never inside an opaque box, so its edges stay clean. Pass `alt` when the
 * picture carries meaning on its own; without it the image is decorative and hidden from screen readers.
 * `locked` dims it for achievements that are not earned yet (the lock is shown by the caller as text as well).
 * `imageKey` is a badge picture an administrator uploaded to storage; it replaces the built-in artwork, except for a ranking
 * position 1 to 10, whose numbered badge is part of its meaning. It is served as it was uploaded (no resizing), so any transparency is kept.
 */
export function RewardIcon({ name = "award", rank, imageKey, size = 48, alt, locked = false, priority = false, className }) {
  const custom = imageKey && !(rank >= 1 && rank <= 10);
  return (
    <Image
      src={custom ? mediaUrl(imageKey) : rewardIconSrc({ name, rank })}
      unoptimized={Boolean(custom)}
      alt={alt ?? ""}
      aria-hidden={alt ? undefined : true}
      width={size}
      height={size}
      sizes={`${size}px`}
      priority={priority}
      draggable={false}
      className={cn("shrink-0 object-contain select-none", locked && "opacity-40 grayscale", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** A ranking position: the numbered award badge for 1 to 10, a plain number beyond that. */
export function RankBadge({ rank, size = 40 }) {
  if (rank >= 1 && rank <= 10) return <RewardIcon rank={rank} size={size} alt={`Rank ${rank}`} />;
  return (
    <span className="bg-muted text-muted-foreground grid place-items-center rounded-full text-sm font-bold tabular-nums" style={{ width: size, height: size }} aria-label={`Rank ${rank}`}>
      {rank}
    </span>
  );
}

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The UniSphere mark (public/unisphereLogo.png, optimised to /logo-mark.png).
 * Parts of the mark are dark navy, so on dark surfaces it sits on a light tile.
 * Pass `tile` to force the tile (e.g. on an always-dark panel).
 */
export function LogoMark({ className, tile = false, priority = false }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        tile ? "bg-white p-0.5" : "dark:bg-white dark:p-0.5",
        className ?? "size-8",
      )}
    >
      <Image src="/logo-mark.png" alt="" width={256} height={256} priority={priority} className="size-full object-contain" />
    </span>
  );
}

export function Logo({ className, href = "/", showWordmark = true, markClassName, wordmarkClassName, tile = false, priority = false }) {
  const content = (
    <>
      <LogoMark className={markClassName} tile={tile} priority={priority} />
      {showWordmark && <span className={cn("font-heading text-[1.2rem] font-extrabold tracking-tight", wordmarkClassName)}>UniSphere</span>}
    </>
  );
  if (!href) return <span className={cn("inline-flex items-center gap-2", className)}>{content}</span>;
  return (
    <Link href={href} prefetch={false} aria-label="UniSphere home" className={cn("inline-flex items-center gap-2", className)}>
      {content}
    </Link>
  );
}

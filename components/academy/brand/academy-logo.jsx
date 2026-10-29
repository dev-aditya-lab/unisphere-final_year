import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** The Academy uses UniSphere's own mark: it is part of UniSphere, not a separate brand. */
export function AcademyMark({ className, tile = false }) {
  return <LogoMark className={className ?? "size-8"} tile={tile} />;
}

/** The UniSphere mark and name with "Academy" after it. `light="dark"` is for the dark green footer (the mark sits on a light tile). */
export function AcademyLogo({ className, href = "/academy", light = false }) {
  const onDark = light === "dark";
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", onDark ? "text-white" : "text-foreground", className)} aria-label="UniSphere Academy home">
      <LogoMark className="size-8" tile={onDark} />
      <span className="text-[1.05rem] leading-none font-semibold tracking-tight">
        <span className="font-extrabold">UniSphere</span> <span className="opacity-60">Academy</span>
      </span>
    </Link>
  );
}

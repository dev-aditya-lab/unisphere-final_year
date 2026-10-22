"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A link to `/path#part`. On the same page a plain Link only scrolls (no `hashchange`), so a folded section would stay
 * shut; here the hash is set directly, which opens the section that holds the target.
 */
export function JumpLink({ href, children, ...props }) {
  const pathname = usePathname();
  const [path, hash] = href.split("#");
  if (hash && path === pathname) {
    return (
      <a
        href={`#${hash}`}
        onClick={(e) => {
          e.preventDefault();
          if (window.location.hash === `#${hash}`) window.dispatchEvent(new HashChangeEvent("hashchange"));
          else window.location.hash = hash;
        }}
        {...props}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

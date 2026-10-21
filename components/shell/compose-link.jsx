"use client";

import Link from "next/link";
import { requestCompose } from "@/lib/client/compose";

/** A link to the post editor: opens it in place when this page has one, otherwise goes to the feed and opens it there. */
export function ComposeLink({ onClick, ...props }) {
  return (
    <Link
      href="/feed#compose"
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && requestCompose()) e.preventDefault();
      }}
      {...props}
    />
  );
}

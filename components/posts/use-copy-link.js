"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { publicEnv } from "@/lib/env-public";

/** Absolute URL of a post's page (ideas live under /ideas, everything else under /posts). */
export function postUrl(post) {
  return `${publicEnv.appUrl}${post.category === "ideas" ? "/ideas/" : "/posts/"}${post.slug}`;
}

/** Copies a post's link to the clipboard, with a toast and a short-lived `copied` flag for the button's check mark. */
export function useCopyLink(post) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(postUrl(post));
      toast.success("Link copied");
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the link");
    }
  }, [post]);
  return { copied, copy };
}

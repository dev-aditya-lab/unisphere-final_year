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

  // On a phone the system share sheet is the natural "share" (messages, other apps, copy); everywhere else, and if the member
  // dismisses or the sheet is unavailable, the link is copied. Cancelling the sheet is not an error.
  const share = useCallback(async () => {
    const canShare = typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches;
    if (!canShare) return copy();
    try {
      await navigator.share({ title: post.title || `Post by ${post.author_name}`, url: postUrl(post) });
    } catch (err) {
      if (err?.name !== "AbortError") return copy();
    }
  }, [post, copy]);

  return { copied, copy, share };
}

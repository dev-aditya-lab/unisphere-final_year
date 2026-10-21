"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { fireConfetti } from "@/components/motion/confetti";

const KEY = "unisphere:celebrate";

const MESSAGES = {
  onboarded: { title: "You are in. Welcome to UniSphere.", description: "Say hello with your first post, or look around." },
  "first-post": { title: "Your first post is live", description: "Everyone on UniSphere can see it now. Replies will show up in your notifications." },
  "project-published": { title: "Your project is live", description: "Share the link and invite teammates for your open roles." },
};

/**
 * Celebrations are queued by the page that completes a milestone and played by the page that arrives next, so
 * the member lands first and nothing is delayed to make room for an animation.
 */
export function queueCelebration(kind) {
  try {
    sessionStorage.setItem(KEY, kind);
  } catch {
    /* private mode: no celebration, nothing lost */
  }
  // If the app shell is already on screen it plays right away; otherwise the next page's shell picks it up.
  window.dispatchEvent(new Event("unisphere:celebrate"));
}

function play() {
  let kind = null;
  try {
    kind = sessionStorage.getItem(KEY);
    if (kind) sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
  const message = kind && MESSAGES[kind];
  if (!message) return;
  fireConfetti({ x: 0.5, y: 0.3 });
  toast.success(message.title, { description: message.description });
}

/** Mounted once in the app shell. Plays and clears a queued celebration. */
export function CelebrationListener() {
  useEffect(() => {
    play();
    window.addEventListener("unisphere:celebrate", play);
    return () => window.removeEventListener("unisphere:celebrate", play);
  }, []);
  return null;
}

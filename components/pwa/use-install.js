"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useClientValue } from "@/hooks/use-client-value";

/**
 * One shared view of "can this app be installed?". Chromium browsers fire `beforeinstallprompt` once; we keep the
 * event so any button (the banner, the settings page) can open the install dialog. iOS Safari never fires it, so
 * there we show the Add to Home Screen instructions instead.
 */
const store = { event: null, installed: false, listeners: new Set() };
const emit = () => store.listeners.forEach((l) => l());
let wired = false;

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    store.event = e;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    store.event = null;
    store.installed = true;
    emit();
  });
}

const subscribe = (cb) => {
  wire();
  store.listeners.add(cb);
  return () => store.listeners.delete(cb);
};
function readDevice() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const iosSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return `${standalone ? 1 : 0}${ios ? 1 : 0}${iosSafari ? 1 : 0}`;
}

const snapshot = () => (store.installed ? "installed" : store.event ? "prompt" : "none");

export function useInstall() {
  const state = useSyncExternalStore(subscribe, snapshot, () => "none");
  // "standalone,ios,iosSafari" as 0/1 flags; the server render sees "000" so hydration always matches.
  const flags = useClientValue(readDevice, "000");
  const device = { standalone: flags[0] === "1", ios: flags[1] === "1", iosSafari: flags[2] === "1" };

  const install = useCallback(async () => {
    const e = store.event;
    if (!e) return "unavailable";
    e.prompt();
    const { outcome } = await e.userChoice;
    store.event = null;
    emit();
    return outcome;
  }, []);

  return {
    installed: device.standalone || state === "installed",
    canPrompt: state === "prompt",
    needsIosSteps: device.iosSafari && !device.standalone,
    ios: device.ios,
    install,
  };
}

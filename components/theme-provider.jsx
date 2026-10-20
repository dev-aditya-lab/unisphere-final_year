"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * Minimal theme system (light / dark / system).
 * The first paint is handled by an inline script in <head> (see THEME_INIT_SCRIPT), so there
 * is no flash; this provider only keeps the class in sync afterwards. We avoid rendering any
 * <script> from a client component because React 19 warns about that.
 */

const STORAGE_KEY = "unisphere-theme";
const listeners = new Set();

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// The browser chrome (address bar, the installed app's title bar) follows these; keep them in step with the
// chosen theme, which can differ from the operating system's preference.
const CHROME_COLOR = { light: "#F8FAFC", dark: "#0B0F1A" };

function apply(theme) {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? CHROME_COLOR.dark : CHROME_COLOR.light));
}

function subscribe(cb) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const theme = useSyncExternalStore(subscribe, readStored, () => "system");

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: theme just won't persist */
    }
    apply(next);
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/**
 * Whether this page is running inside the Android app. The native shell puts `window.Capacitor` on the page before any script
 * runs (capacitor.config.ts: the app loads the live site), so the website imports nothing from Capacitor to find out: a visitor in an
 * ordinary browser downloads none of it. Each Capacitor plugin is imported on demand, only when this is true.
 */
export const isNativeApp = () => typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;

import { APP_DESCRIPTION } from "@/lib/constants";

// Web app manifest: lets members install UniSphere to their home screen and launch it like an app.
export default function manifest() {
  return {
    id: "/",
    name: "UniSphere: your campus network",
    short_name: "UniSphere",
    description: APP_DESCRIPTION,
    start_url: "/feed?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FBF6EC",
    theme_color: "#FBF6EC",
    lang: "en-IN",
    dir: "ltr",
    categories: ["education", "social", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Feed", short_name: "Feed", url: "/feed?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Messages", short_name: "Messages", url: "/messages?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Notifications", short_name: "Alerts", url: "/notifications?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Events", short_name: "Events", url: "/events?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

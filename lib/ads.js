// Google AdSense configuration: one place that decides whether anything advertising-related may exist on a page.
//
// Three values, all optional, all public by nature (they appear in page source whenever ads are on):
//   NEXT_PUBLIC_ADSENSE_CLIENT_ID  ca-pub-<16 digits>   your AdSense publisher ID
//   NEXT_PUBLIC_ADSENSE_SLOT_ID    <digits>             the ad unit ID of a Display ad unit you created in AdSense
//   NEXT_PUBLIC_ADS_ENABLED        "true"               the explicit switch you flip after Google approves the site
//
// With the client ID alone the site only declares itself to AdSense (a meta tag, and ads.txt), which is what the
// "connect site" step needs. Nothing is loaded and no ad space is reserved until all three are set.
// NEXT_PUBLIC_* values must be read as literal `process.env.NEXT_PUBLIC_X` so the bundler can inline them.

const CLIENT_ID = /^ca-pub-\d{16}$/;
const SLOT_ID = /^\d{6,20}$/;

export function parseAdsConfig({ clientId = "", slotId = "", enabled = "" } = {}) {
  const client = CLIENT_ID.test(String(clientId ?? "").trim()) ? String(clientId).trim() : "";
  const slot = SLOT_ID.test(String(slotId ?? "").trim()) ? String(slotId).trim() : "";
  return {
    clientId: client,
    // The publisher ID as it is written in ads.txt (no "ca-" prefix).
    publisherId: client.replace(/^ca-/, ""),
    slotId: slot,
    enabled: String(enabled ?? "").trim() === "true" && Boolean(client) && Boolean(slot),
  };
}

/** Browser and server code: statically inlined at build time. */
export const ads = parseAdsConfig({
  clientId: process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID,
  slotId: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID,
  enabled: process.env.NEXT_PUBLIC_ADS_ENABLED,
});

/** The exact line Google documents for AdSense in ads.txt (the last field is Google's fixed certification authority ID). */
export function adsTxtLine(publisherId) {
  return `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`;
}

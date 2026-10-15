import { adsTxtLine, parseAdsConfig } from "@/lib/ads";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * /ads.txt: lists who may sell this site's advertising. The line is built from NEXT_PUBLIC_ADSENSE_CLIENT_ID, which
 * is the owner's real publisher ID. Until one is configured the file contains only a comment (a valid ads.txt that
 * authorises nobody), never an invented entry.
 */
export function GET() {
  const { publisherId } = parseAdsConfig({ clientId: process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID });
  const body = publisherId
    ? `${adsTxtLine(publisherId)}\n`
    : "# UniSphere does not currently authorise any advertising sellers.\n# The owner adds the AdSense publisher entry by setting NEXT_PUBLIC_ADSENSE_CLIENT_ID (see docs/ADSENSE.md).\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

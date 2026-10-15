import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ads } from "@/lib/ads";
import { MONETAG_VERIFICATION } from "@/lib/constants";
import { monetag } from "@/lib/monetag";
import { MonetagTag } from "@/components/ads/monetag-tag";
import { getAuthUser } from "@/lib/auth/session";

// The explanatory and legal pages may be found by search engines; everything else in the app may not.
// Verification tags for the ad accounts. Both prove ownership of the site without loading any ad code, and both are
// present only on these public pages (the AdSense one only when a publisher ID is set).
export const metadata = {
  robots: { index: true, follow: true },
  other: {
    ...(ads.clientId ? { "google-adsense-account": ads.clientId } : {}),
    monetag: MONETAG_VERIFICATION,
  },
};

export default async function MarketingLayout({ children }) {
  // The advertising-network tag is for anonymous visitors on public pages only: a signed-in member never gets it.
  const member = monetag.enabled ? await getAuthUser().catch(() => null) : null;
  return (
    <>
      {monetag.enabled && !member && <MonetagTag />}
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}

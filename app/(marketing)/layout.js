import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ads } from "@/lib/ads";
import { MONETAG_VERIFICATION } from "@/lib/constants";

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

export default function MarketingLayout({ children }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}

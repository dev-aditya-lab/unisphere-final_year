import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ads } from "@/lib/ads";

// The explanatory and legal pages may be found by search engines; everything else in the app may not.
// The AdSense account tag lets Google verify ownership of the site without loading any ad code. It is present only
// when a publisher ID is configured, and only on these public pages.
export const metadata = {
  robots: { index: true, follow: true },
  ...(ads.clientId ? { other: { "google-adsense-account": ads.clientId } } : {}),
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

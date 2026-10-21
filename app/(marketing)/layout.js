import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

// The explanatory and legal pages may be found by search engines; everything else in the app may not.
export const metadata = {
  robots: { index: true, follow: true },
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

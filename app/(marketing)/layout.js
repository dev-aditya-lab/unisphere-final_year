import { Outfit } from "next/font/google";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import "./landing.css";

// The public site is set in Outfit, a friendly geometric sans (variable weight), used heavy and tight for headlines. The app itself
// stays in Plus Jakarta Sans. Loaded here so signed-in pages never download it.
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], display: "swap" });

// The explanatory and legal pages may be found by search engines; everything else in the app may not.
export const metadata = {
  robots: { index: true, follow: true },
};

export default function MarketingLayout({ children }) {
  return (
    <div className={`corp-root ${outfit.variable}`}>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}

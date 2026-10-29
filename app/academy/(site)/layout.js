import { AcademyHeader } from "@/components/academy/shell/site-header";
import { AcademyFooter } from "@/components/academy/shell/site-footer";

// The Academy's explanatory pages (home, catalogue, course pages, pricing, policies) may be found by search engines. Certificate
// pages, dashboards, checkout and the console (other groups) never are.
export const metadata = { robots: { index: true, follow: true } };

export default function AcademySiteLayout({ children }) {
  return (
    <>
      <AcademyHeader />
      <main id="main">{children}</main>
      <AcademyFooter />
    </>
  );
}

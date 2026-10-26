import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { contactHref } from "@/lib/content/contact-topics";
import { CONTACT_EMAIL } from "@/lib/constants";

// Every destination below is a real, public page. Nothing here points at a members-only route (a logged-out visitor
// would be bounced to the sign-in page) and nothing points at an external policy.
const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/about", label: "About UniSphere" },
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#communities", label: "College communities" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/faq", label: "Frequently asked questions" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/guidelines", label: "Community guidelines" },
      { href: "/content-policy", label: "Content policy" },
      { href: contactHref("report-content"), label: "Report content" },
      { href: "/accessibility", label: "Accessibility" },
    ],
  },
  {
    title: "Legal and privacy",
    links: [
      { href: "/privacy-centre", label: "Privacy centre" },
      { href: "/privacy-notice", label: "Privacy notice" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/cookies", label: "Cookies and privacy preferences" },
      { href: "/grievance", label: "Privacy grievances" },
      { href: "/privacy-contact", label: "Contact the privacy team" },
      { href: "/terms", label: "Terms of service" },
      { href: "/refund-policy", label: "Refund and cancellation" },
      { href: "/shipping-policy", label: "Shipping and delivery" },
      { href: "/copyright-policy", label: "Copyright policy" },
      { href: "/brand-policy", label: "Brand policy" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/contact", label: "Contact us" },
      { href: contactHref("support"), label: "Get help" },
      { href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL },
      { href: "/register", label: "Create an account" },
      { href: "/login", label: "Log in" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer band pb-safe border-band-line mt-24 border-t">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="max-w-xs sm:col-span-2 lg:col-span-1">
          <Logo wordmarkClassName="font-display text-[1.5rem] font-bold tracking-[-0.04em]" tile />
          <p className="font-display mt-5 text-2xl leading-tight font-semibold tracking-[-0.03em]">One space for every college community.</p>
          <p className="text-band-muted mt-3 text-sm leading-relaxed">
            An independent, free platform where students, alumni, teachers and clubs from any college share projects, find teammates and learn from each other.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-band-muted mb-4 font-sans text-xs font-semibold tracking-[0.14em] uppercase">{col.title}</h2>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("mailto:") ? (
                    <a href={l.href} className="text-band-foreground/80 hover:text-band-foreground text-sm break-all transition-colors">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-band-foreground/80 hover:text-band-foreground text-sm transition-colors">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div aria-hidden="true" data-giant className="giant-word px-4" data-word="UniSphere" />
      <div className="border-band-line border-t">
        <div className="text-band-muted mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-xs sm:px-6">
          <p>&copy; {new Date().getFullYear()} UniSphere. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

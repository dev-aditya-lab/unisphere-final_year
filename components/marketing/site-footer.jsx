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
      { href: "/privacy", label: "Privacy policy" },
      { href: "/cookies", label: "Cookies and privacy preferences" },
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
    <footer className="bg-sunken pb-safe mt-24 border-t">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div className="max-w-xs sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="font-heading mt-4 text-base font-extrabold tracking-tight">One space for every college community.</p>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            An independent, free platform where students, alumni, teachers and clubs from any college share projects, find teammates and learn from each other.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="eyebrow mb-3 font-sans">{col.title}</h2>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("mailto:") ? (
                    <a href={l.href} className="text-muted-foreground hover:text-foreground text-sm font-medium break-all transition-colors">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs sm:px-6">
          <p>&copy; {new Date().getFullYear()} UniSphere. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

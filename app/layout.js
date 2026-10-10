import { headers } from "next/headers";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/components/theme-provider";
import { publicEnv } from "@/lib/env-public";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

// Display: Bricolage Grotesque, a characterful grotesque with ink-trap detail that reads as "student magazine".
// Body: Plus Jakarta Sans, open and friendly with excellent small-size legibility. Both are variable fonts.
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const body = Plus_Jakarta_Sans({ variable: "--font-body", subsets: ["latin"], display: "swap" });

export const metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME}: ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME}: ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME}: ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
  },
  // A closed network: nothing is indexed unless a page explicitly opts in ((marketing) does).
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
  appleWebApp: { capable: true, title: "UniSphere", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF6EC" },
    { media: "(prefers-color-scheme: dark)", color: "#14120F" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and home indicator; the layout uses env(safe-area-inset-*) to stay clear of them.
  viewportFit: "cover",
};

export default async function RootLayout({ children }) {
  // The nonce set by proxy.js lets the strict Content-Security-Policy allow our one inline theme script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${display.variable} ${body.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

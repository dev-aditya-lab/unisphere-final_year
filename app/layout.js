import { headers } from "next/headers";
import { Inter, Manrope, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { THEME_INIT_SCRIPT } from "@/components/theme-provider";
import { publicEnv } from "@/lib/env-public";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

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
    { media: "(prefers-color-scheme: light)", color: "#F7F5EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1626" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  // The nonce set by proxy.js lets the strict Content-Security-Policy allow our one inline theme script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${manrope.variable} ${geistMono.variable}`}
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

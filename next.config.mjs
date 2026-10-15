/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
    ],
  },
  // Common names for pages that already exist. Permanent, and resolved before the auth proxy runs.
  async redirects() {
    return [
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/privacy-preferences", destination: "/cookies", permanent: true },
      { source: "/cookie-policy", destination: "/cookies", permanent: true },
      { source: "/community-guidelines", destination: "/guidelines", permanent: true },
      { source: "/guest-controls", destination: "/cookies", permanent: true },
      { source: "/user-agreement", destination: "/terms", permanent: true },
      { source: "/copyright", destination: "/copyright-policy", permanent: true },
      { source: "/terms-of-service", destination: "/terms", permanent: true },
    ];
  },
  async headers() {
    const prod = process.env.NODE_ENV === "production";
    return [
      {
        // Everything: the Content-Security-Policy itself is set per request in proxy.js (it needs a nonce).
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com"), usb=(), interest-cohort=()' },
          ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
      },
      {
        // Fully isolated from other windows everywhere except the one page where a member pays.
        source: "/:path((?!settings/blue-tick$).*)",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }],
      },
      {
        // Razorpay Checkout opens the bank's authentication page in a popup and talks back to this page. A strict
        // `same-origin` policy cuts that link and leaves the popup blank, so this page (and only this page) keeps it.
        source: "/settings/blue-tick",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }],
      },
      {
        // The service worker must always be re-checked, or a bad release could stay installed on devices.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;

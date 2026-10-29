// The one host next/image may fetch from: this site's own media domain (NEXT_PUBLIC_MEDIA_URL), exactly, not a wildcard
// over every R2 account. Anything else would let the image optimiser be pointed at other people's buckets.
const mediaHost = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_MEDIA_URL || "");
    return { protocol: u.protocol.replace(":", ""), hostname: u.hostname, ...(u.port ? { port: u.port } : {}) };
  } catch {
    return null;
  }
})();

// Render's free plan has 512 MB of memory. By default Next starts one build worker per CPU core it can see (47 on Render's build machines),
// and each one loads the whole app, which runs the build out of memory right after "Collecting page data". Render sets RENDER=true; set
// LOW_MEMORY_BUILD=1 to get the same careful build anywhere else.
const lowMemoryBuild = process.env.RENDER === "true" || process.env.LOW_MEMORY_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a verification build (CI, a local production check) run beside a development server without sharing `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Next.js buffers a request body for the proxy; keep that ceiling equal to MAX_UPLOAD_BODY_BYTES (lib/storage/policy.js).
  experimental: {
    proxyClientMaxBodySize: "12mb",
    ...(lowMemoryBuild ? { cpus: 1, memoryBasedWorkersCount: true, workerThreads: false, staticGenerationMaxConcurrency: 1 } : {}),
  },
  // sheryjs (landing page image effects) ships its shaders as .glsl files and imports a debug-panel library we never use.
  turbopack: {
    rules: {
      "*.glsl": { loaders: ["./lib/landing/glsl-loader.cjs"], as: "*.js" },
    },
    resolveAlias: {
      controlkit: "./lib/landing/controlkit-stub.js",
    },
  },
  images: {
    remotePatterns: [{ protocol: "http", hostname: "localhost" }, ...(mediaHost ? [mediaHost] : [])],
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
          // Payment happens on the gateway's own page (a full-page redirect), so no page needs a link to a popup window.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
        ],
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

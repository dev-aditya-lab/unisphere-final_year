import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * Digital Asset Links for the Android app (the Capacitor app, or a Trusted Web Activity wrapping this site).
 * Android opens this site's links in the app (App Links), and a Trusted Web Activity hides the browser address bar, only if the
 * app's signing-key fingerprint is listed here.
 * Set ANDROID_PACKAGE_NAME and ANDROID_SHA256_CERT_FINGERPRINTS (comma separated, from Play Console →
 * Setup → App signing). Until both are set this returns an empty list, which is valid and grants nothing.
 */
export function GET() {
  const pkg = (process.env.ANDROID_PACKAGE_NAME ?? "").trim();
  const prints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const body = pkg && prints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}

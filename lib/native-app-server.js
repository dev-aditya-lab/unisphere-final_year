import "server-only";
import { headers } from "next/headers";
import { isNativeAppUserAgent } from "@/lib/native-app";

/** True when the current request comes from the Android app (see lib/native-app.js: a hint for presentation, never for security). */
export async function isNativeAppRequest() {
  return isNativeAppUserAgent((await headers()).get("user-agent"));
}

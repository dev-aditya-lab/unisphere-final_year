import { publicEnv } from "@/lib/env-public";

/** The public page a certificate's QR code opens. Always the configured site address, never a development one baked into code. */
export const verifyUrl = (certificateId, base = publicEnv.appUrl) => `${base}/academy/verify/${encodeURIComponent(String(certificateId))}`;

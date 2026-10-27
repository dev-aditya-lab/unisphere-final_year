import { isNativeApp } from "@/lib/native/client";

/** A light tap under the finger, like a physical key. Does nothing on the website or if the phone has no vibration motor. */
export function tapHaptic() {
  if (!isNativeApp()) return;
  import("@capacitor/haptics").then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {});
}

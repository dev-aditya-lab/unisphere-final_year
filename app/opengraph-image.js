import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "UniSphere: one space for every college community";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogImage({ label: "UniSphere", title: "Your campus. Your people. Your next idea." });
}

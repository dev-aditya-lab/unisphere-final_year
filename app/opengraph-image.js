import { OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "UniSphere: the campus network of Ramgarh Engineering College";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogImage({ label: "RGEC", title: "Your campus. Your people. Your next idea." });
}

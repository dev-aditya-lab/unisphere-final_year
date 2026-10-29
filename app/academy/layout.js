import { Inter } from "next/font/google";
import { MotionFeatures } from "@/components/motion/motion-features";
import "./academy.css";

// Headlines are set in Inter at heavy weights and tight tracking. Body copy stays in the app's own sans. Loaded here so the rest of UniSphere never downloads it.
const display = Inter({ variable: "--font-academy-display", subsets: ["latin"], display: "swap" });

// Everything under /academy is private by default; the public group below opts its explanatory pages in. Certificate pages, dashboards,
// checkout and the console are never indexed.
export const metadata = {
  title: { default: "UniSphere Academy: learn, build, prove it", template: "%s · UniSphere Academy" },
  description: "Practical courses, guided projects and mentor feedback from UniSphere, with certificates anyone can verify.",
  robots: { index: false, follow: false },
};

export default function AcademyLayout({ children }) {
  return (
    <div className={`academy ${display.variable}`}>
      <MotionFeatures>{children}</MotionFeatures>
    </div>
  );
}

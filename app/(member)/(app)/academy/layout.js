import "@/app/academy/academy.css";
import { AcademyTabs } from "@/components/academy/member/academy-tabs";

// The signed-in side of the Academy lives inside the UniSphere app, so the profile, notifications, messages and settings are the
// member's own. This layout only adds the section tabs. The Academy's public look (black and aurora) is not used here.
export const metadata = { robots: { index: false, follow: false } };

export default function AcademyMemberLayout({ children }) {
  return (
    <div className="ac-uni">
      <AcademyTabs />
      {children}
    </div>
  );
}

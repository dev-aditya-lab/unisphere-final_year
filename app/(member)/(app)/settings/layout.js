import { SettingsShell } from "@/components/settings/settings-nav";

export const metadata = { robots: { index: false, follow: false } };

export default function SettingsLayout({ children }) {
  return <SettingsShell>{children}</SettingsShell>;
}

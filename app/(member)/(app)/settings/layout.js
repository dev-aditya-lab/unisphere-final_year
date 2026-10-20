import { PageHeader } from "@/components/shell/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata = { robots: { index: false, follow: false } };

export default function SettingsLayout({ children }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Account" title="Settings" />
      <SettingsNav />
      {children}
    </div>
  );
}

import { SystemPage } from "@/components/system-page";
import { getPublicSettings } from "@/lib/settings";

export const metadata = { title: "Maintenance", robots: { index: false, follow: false } };

export default async function MaintenancePage() {
  const { maintenance_message } = await getPublicSettings();
  return (
    <SystemPage code="Back soon" title="UniSphere is being updated">
      <p>{maintenance_message}</p>
    </SystemPage>
  );
}

import { PrivacyForm } from "@/components/settings/privacy-form";
import { requireProfile } from "@/lib/auth/session";

export const metadata = { title: "Privacy settings" };

export default async function PrivacySettingsPage() {
  const { profile } = await requireProfile();
  return <PrivacyForm profile={profile} />;
}

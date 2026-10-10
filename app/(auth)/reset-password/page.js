import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { FormAlert } from "@/components/forms/form-alert";
import { getAuthUser } from "@/lib/auth/session";

export const metadata = {
  title: "Reset password",
  description: "Choose a new UniSphere password.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  // Only reachable with a valid recovery session created by /auth/confirm.
  const user = await getAuthUser();
  if (!user) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Link expired</h1>
        <FormAlert variant="warning" className="mt-6">
          This password reset link is no longer valid. Request a new one to continue.
        </FormAlert>
        <Link href="/forgot-password" className="text-blue-text mt-6 inline-block text-sm font-semibold hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm />;
}

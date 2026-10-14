import { RegisterForm } from "@/components/auth/register-form";
import { FormAlert } from "@/components/forms/form-alert";
import { getPublicSettings } from "@/lib/settings";
import Link from "next/link";

export const metadata = {
  title: "Create your account",
  description: "Join UniSphere for free. No college, student ID or college email needed.",
  alternates: { canonical: "/register" },
};

export default async function RegisterPage() {
  const settings = await getPublicSettings();
  if (!settings.registration_open) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Registration is closed</h1>
        <FormAlert variant="info" className="mt-6">
          New accounts are not being accepted right now. Please check back soon.
        </FormAlert>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already a member?{" "}
          <Link href="/login" className="text-blue-text font-semibold hover:underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }
  return <RegisterForm />;
}

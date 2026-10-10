import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = {
  title: "Forgot password",
  description: "Request a link to reset your UniSphere password.",
  robots: { index: false, follow: true },
};

export default async function ForgotPasswordPage({ searchParams }) {
  const sp = await searchParams;
  return <ForgotPasswordForm expired={sp.error === "expired_link"} />;
}

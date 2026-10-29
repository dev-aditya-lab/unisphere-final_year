import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/safe-redirect";
import { isNativeAppRequest } from "@/lib/native-app-server";
import { publicEnv } from "@/lib/env-public";

export const metadata = {
  title: "Log in",
  description: "Log in to UniSphere to connect with your campus community.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined, "/feed");
  const flash = sp.reset ? "reset" : typeof sp.error === "string" ? sp.error : null;
  const google = publicEnv.googleSignin && !(await isNativeAppRequest());
  return <LoginForm next={next} flash={flash} google={google} />;
}

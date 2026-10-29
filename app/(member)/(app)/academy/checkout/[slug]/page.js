import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CourseCover } from "@/components/academy/ui/course-cover";
import { CheckoutPanel } from "@/components/academy/commerce/checkout-panel";
import { KINDS } from "@/lib/academy/constants";
import { requireProfile } from "@/lib/auth/session";
import { isNativeAppRequest } from "@/lib/native-app-server";
import { paymentsConfigured } from "@/lib/payments/gateway";
import { createClient } from "@/lib/supabase/server";
import { getAcademySettings, getCourseDetail, quoteFor } from "@/lib/services/academy";

export const metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }) {
  const { user } = await requireProfile();
  const { slug } = await params;
  const detail = await getCourseDetail(slug);
  if (!detail || detail.course.status !== "published") notFound();
  const { course, cohorts } = detail;

  const { data: existing } = await (await createClient()).from("academy_enrollments").select("id").eq("user_id", user.id).eq("course_id", course.id).in("status", ["active", "completed", "suspended"]).maybeSingle();
  if (existing) redirect(`/academy/learn/${course.id}`);

  const [settings, native] = await Promise.all([getAcademySettings(), isNativeAppRequest()]);
  const first = await quoteFor({ courseId: course.id, cohortId: cohorts[0]?.id ?? null, coupon: null });
  const configured = paymentsConfigured();
  const blocker = native ? "Buying a course is not available in the app. Open unispheres.in in your browser to pay."
    : !settings.salesEnabled ? "Paid enrolment has not opened yet."
    : !configured ? "Payments are not set up yet. Please try again later." : null;
  const canPay = !blocker;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="ac-kicker">Checkout</p>
      <h1 className="ac-display mt-3 text-4xl">Confirm your enrolment</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.1fr]">
        <div className="ac-card h-fit overflow-hidden">
          <CourseCover course={course} />
          <div className="space-y-2 p-5">
            <div className="flex items-center gap-2"><span className="ac-chip">{KINDS[course.kind].label}</span><span className="text-muted-foreground font-mono text-xs">{course.code}</span></div>
            <h2 className="ac-display text-2xl">{course.title}</h2>
            {course.short_description && <p className="text-muted-foreground text-sm">{course.short_description}</p>}
            <Link href={`${KINDS[course.kind].path}/${course.slug}`} className="text-primary-text inline-block pt-1 text-sm underline">Back to details</Link>
          </div>
        </div>
        <div className="ac-card p-5 sm:p-6">
          {first.ok ? (
            <CheckoutPanel courseId={course.id} cohorts={cohorts} initialQuote={first.quote} canPay={canPay} blocker={blocker} />
          ) : (
            <div role="alert"><h2 className="ac-display text-2xl">This cannot be bought right now</h2><p className="text-muted-foreground mt-2 text-sm">{first.error}</p><Link href="/academy/courses" className="text-primary-text mt-4 inline-block text-sm underline">Browse other courses</Link></div>
          )}
        </div>
      </div>
    </div>
  );
}

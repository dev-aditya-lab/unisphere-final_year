import Link from "next/link";
import { TrackForm } from "@/components/privacy/grievance-form";

export const metadata = {
  title: "Track a grievance",
  description: "Check the status of a privacy grievance with its reference and tracking code.",
  alternates: { canonical: "/grievance/track" },
  robots: { index: false, follow: true },
};

export default function TrackGrievancePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
      <p className="eyebrow mb-2">Privacy</p>
      <h1 className="text-4xl font-extrabold">Track a grievance</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        Enter the reference and the tracking code we gave you. Signed-in members can follow their grievances in <Link href="/privacy-requests#mine" className="text-blue-text underline">their privacy requests</Link> instead.
      </p>
      <div className="mt-8">
        <TrackForm />
      </div>
    </div>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { FormAlert } from "@/components/forms/form-alert";
import { DeleteAccountForm, CancelDeletionButton } from "@/components/privacy/delete-account-form";
import { fmtDate } from "@/components/privacy/request-status";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Delete my account", robots: { index: false, follow: false } };

const ERASED = [
  "Your profile, photos, bio, colleges, skills and links.",
  "Your posts, comments, reactions, bookmarks, follows and connections.",
  "Projects you own (co-members lose them, so tell them first), and your memberships.",
  "Every file you uploaded, from storage, including message attachments and images.",
  "Your Orbits, streak, answers and badges, and your leaderboard entries.",
  "Your notification settings, push device registrations and consent records.",
  "Anything AI features derived from your content (embeddings), and your sign-in account and email address.",
];

const KEPT = [
  "Payment records for the blue tick, if you bought one: accounting and tax law require them. They keep the order, amount and date, and your username as it was.",
  "Reports other members made about your account, with the content they quoted, for community safety. They are cleared after the retention window in the privacy notice.",
  "Messages you already sent to other people, unless you tick the box below. They stay in the other person's conversation without your name.",
  "An anonymous entry in the audit log, and an anonymous record that this erasure happened (so a restored backup cannot bring your account back).",
  "Backups held by our database provider expire on their own schedule. UniSphere's restore procedure re-applies every recorded erasure before a restored database is put back into service.",
];

export default async function DeleteAccountPage() {
  const { profile } = await requireProfile({ allowIncomplete: true });
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("account_deletion_requests")
    .select("id, status, scheduled_for, privacy_request_id")
    .eq("user_id", profile.id)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  const { data: ref } = pending?.privacy_request_id
    ? await supabase.from("privacy_requests").select("reference").eq("id", pending.privacy_request_id).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Privacy" title="Delete my account" description="Erase your account and the data you own. This is your right, and it is permanent." />

      {pending ? (
        <section className="border-destructive/30 rounded-lg border p-5 sm:p-6" aria-labelledby="scheduled">
          <h2 id="scheduled" className="text-destructive-text text-lg font-bold">
            {pending.status === "processing" ? "Your account is being erased" : "Deletion scheduled"}
          </h2>
          {pending.status === "pending" ? (
            <>
              <p className="text-muted-foreground mt-1 text-sm">
                Your account and data will be erased on <strong>{fmtDate(pending.scheduled_for)}</strong>. Until then it still works and you can change your mind.
                {ref?.reference && <> Reference {ref.reference}.</>}
              </p>
              <div className="mt-4">
                <CancelDeletionButton />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">The erasure has started and can no longer be cancelled. You will get an email when it is complete.</p>
          )}
          <p className="mt-4 text-sm">
            Follow it in <Link href="/privacy-requests" className="text-blue-text underline">your privacy requests</Link>.
          </p>
        </section>
      ) : (
        <>
          <FormAlert variant="warning" title="Read this first">
            You have 14 days after asking to change your mind. After that, erasure is permanent and we cannot recover anything.
          </FormAlert>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <section className="surface p-5" aria-labelledby="erased">
              <h2 id="erased" className="text-base font-bold">What is erased</h2>
              <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
                {ERASED.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </section>
            <section className="surface p-5" aria-labelledby="kept">
              <h2 id="kept" className="text-base font-bold">What is kept, and why</h2>
              <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
                {KEPT.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </section>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            Want a copy first? <Link href="/privacy-requests" className="text-blue-text underline">Download your data</Link>. Only want to stop one thing, such as AI features? <Link href="/settings/privacy" className="text-blue-text underline">Change your privacy choices</Link>. If you hold a staff role, an administrator must remove it before you can delete the account.
          </p>
          <section className="surface mt-6 p-5 sm:p-6" aria-labelledby="confirm">
            <h2 id="confirm" className="text-lg font-bold">Confirm</h2>
            <div className="mt-4">
              <DeleteAccountForm />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

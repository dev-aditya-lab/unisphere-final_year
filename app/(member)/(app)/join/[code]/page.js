import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users } from "@/components/icons/lucide-compat";
import { JoinInvite } from "@/components/community/join-invite";
import { MediaImage } from "@/components/media-image";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { previewInvite } from "@/lib/services/community-workspace";
import { isFlagEnabled } from "@/lib/settings";
import { inviteCode } from "@/lib/validators/community-workspace";

export const metadata = { title: "Join a community", robots: { index: false, follow: false }, referrer: "no-referrer" };

function Invalid({ children }) {
  return (
    <div className="surface mx-auto max-w-md space-y-3 p-6 text-center">
      <h1 className="font-heading text-xl font-bold">This invitation is not valid any more</h1>
      <p className="text-muted-foreground text-sm">{children ?? "It may have expired, been used up, or been withdrawn. Ask the person who sent it for a new one."}</p>
      <Button asChild variant="outline"><Link href="/communities">Browse communities</Link></Button>
    </div>
  );
}

/**
 * An invitation link. Anyone signed in can look at it; what they see is only what is needed to decide (name, picture, size), never
 * why a bad link is bad: a code that never existed, expired, was revoked, ran out, was meant for someone else or belongs to a
 * community they are banned from all look the same. Looking up a code is rate-limited per person and per network address.
 */
export default async function JoinPage({ params }) {
  if (!(await isFlagEnabled("communities"))) notFound();
  const { code: raw } = await params;
  const { user } = await requireProfile();
  const ip = await getClientIp();
  const limited = (await enforceRateLimit("invite-lookup", user.id, { limit: 10, windowSec: 300 })) ?? (await enforceRateLimit("invite-lookup-ip", ip, { limit: 30, windowSec: 300 }));
  if (limited) return <Invalid>{limited.error}</Invalid>;
  const parsed = inviteCode.safeParse(raw);
  if (!parsed.success) return <Invalid />;
  const res = await previewInvite(parsed.data);
  const invite = res.ok ? res.data : null;
  if (!invite?.valid) return <Invalid />;
  if (invite.already_member && invite.slug) redirect(`/communities/${invite.slug}/channels`);
  return (
    <div className="surface mx-auto max-w-md overflow-hidden">
      <div className="bg-muted relative aspect-[3/1]">
        <MediaImage mediaKey={invite.cover_key} width={640} className="size-full object-cover" />
      </div>
      <div className="space-y-4 p-6">
        <div className="relative z-10 -mt-12 flex items-end gap-3">
          <span className="bg-card border-card ring-border grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 text-lg font-bold shadow-sm ring-1">
            {invite.avatar_key ? <MediaImage mediaKey={invite.avatar_key} width={128} className="size-full object-cover" /> : invite.name.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">You have been invited to join</p>
          <h1 className="font-heading text-2xl font-extrabold">{invite.name}</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm"><Users className="size-4" aria-hidden="true" /> {invite.member_count} member{invite.member_count === 1 ? "" : "s"}</p>
        </div>
        {invite.description && <p className="text-sm whitespace-pre-wrap">{invite.description}</p>}
        <JoinInvite code={parsed.data} name={invite.name} />
        <p className="text-muted-foreground text-xs">By joining you agree to follow the community&rsquo;s rules and UniSphere&rsquo;s <Link href="/guidelines" className="underline">community guidelines</Link>. You can leave at any time. Nobody is asked to prove which college they attend.</p>
      </div>
    </div>
  );
}

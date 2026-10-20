import Link from "next/link";
import { Link2, ShieldBan, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { IncomingRequestActions, OutgoingRequestActions, RemoveConnectionButton, UnblockButton } from "@/components/people/connection-actions";
import { PersonCard } from "@/components/people/person-card";
import { QuickConnect } from "@/components/people/quick-connect";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { requireProfile } from "@/lib/auth/session";
import { getBlockedUsers, getConnections, getRequests, getSuggestedPeople } from "@/lib/services/social";
import { cn } from "@/lib/utils";

export const metadata = { title: "Connections", robots: { index: false, follow: false } };

const TABS = [
  { id: "connections", label: "Connections" },
  { id: "requests", label: "Requests" },
  { id: "suggestions", label: "Suggestions" },
  { id: "blocked", label: "Blocked" },
];

export default async function ConnectionsPage({ searchParams }) {
  const { user } = await requireProfile();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab : "connections";

  const [connections, requests, suggestions, blocked] = await Promise.all([
    tab === "connections" ? getConnections(user.id) : [],
    getRequests(user.id),
    tab === "suggestions" ? getSuggestedPeople(12) : [],
    tab === "blocked" ? getBlockedUsers(user.id) : [],
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Network" title="Connections" description="People you are connected with, pending requests and suggestions from your college." />

      <nav aria-label="Connections sections" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/connections?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("relative px-3 py-2.5 text-sm font-medium whitespace-nowrap", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
            {t.id === "requests" && requests.received.length > 0 && (
              <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-[11px] leading-5 font-semibold">{requests.received.length}</span>
            )}
            {tab === t.id && <span aria-hidden="true" className="bg-primary absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
          </Link>
        ))}
      </nav>

      {tab === "connections" &&
        (connections.length === 0 ? (
          <EmptyState icon={Link2} title="No connections yet" action={<Link className="text-blue-text text-sm font-semibold hover:underline" href="/connections?tab=suggestions">See suggestions</Link>}>
            Connect with classmates, seniors and alumni to see their posts and message them.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {connections.map((p) => (
              <li key={p.id}>
                <PersonCard person={p} actions={<RemoveConnectionButton otherId={p.id} name={p.full_name} />} />
              </li>
            ))}
          </ul>
        ))}

      {tab === "requests" && (
        <div className="space-y-8">
          <section aria-labelledby="incoming-title">
            <h2 id="incoming-title" className="eyebrow mb-3">
              Received ({requests.received.length})
            </h2>
            {requests.received.length === 0 ? (
              <EmptyState icon={UserPlus} title="No pending requests">
                When someone asks to connect, you can accept or decline here.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {requests.received.map((r) => (
                  <li key={r.id}>
                    {r.person && (
                      <PersonCard person={r.person} reason={r.message ? `“${r.message}”` : null} actions={<IncomingRequestActions requestId={r.id} />} showSkills={false} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {requests.sent.length > 0 && (
            <section aria-labelledby="sent-title">
              <h2 id="sent-title" className="eyebrow mb-3">
                Sent ({requests.sent.length})
              </h2>
              <ul className="space-y-3">
                {requests.sent.map((r) => (
                  <li key={r.id}>{r.person && <PersonCard person={r.person} showSkills={false} actions={<OutgoingRequestActions requestId={r.id} />} />}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "suggestions" &&
        (suggestions.length === 0 ? (
          <EmptyState icon={Users} title="No suggestions right now">
            Suggestions come from people at your college who share your skills, interests or department. Add skills to your profile to improve them.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {suggestions.map((p) => (
              <li key={p.id}>
                <PersonCard
                  person={{ ...p, skills: p.shared_skills }}
                  reason={
                    p.shared_skills?.length
                      ? `Shared skills: ${p.shared_skills.join(", ")}`
                      : p.shared_interests?.length
                        ? `Shared interests: ${p.shared_interests.join(", ")}`
                        : p.same_department
                          ? "In your department"
                          : "From your college"
                  }
                  actions={<QuickConnect personId={p.id} />}
                />
              </li>
            ))}
          </ul>
        ))}

      {tab === "blocked" &&
        (blocked.length === 0 ? (
          <EmptyState icon={ShieldBan} title="You have not blocked anyone">
            Blocked people cannot see your profile or posts, and cannot message you.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {blocked.map((b) => (
              <li key={b.id} className="surface flex items-center gap-3 p-4">
                <UserAvatar name={b.full_name} avatarKey={b.avatar_key} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.full_name}</p>
                  {b.username && <p className="text-muted-foreground text-xs">@{b.username}</p>}
                </div>
                <UnblockButton targetId={b.id} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

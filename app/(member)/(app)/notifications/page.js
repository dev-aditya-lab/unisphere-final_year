import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { listNotifications } from "@/lib/services/notifications";
import { NOTIFICATION_CATEGORIES } from "@/lib/notification-text";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications", robots: { index: false, follow: false } };

export default async function NotificationsPage({ searchParams }) {
  const { user } = await requireProfile();
  const sp = await searchParams;
  const category = NOTIFICATION_CATEGORIES.some((c) => c.value === sp.category) ? sp.category : null;
  const SHORT = { social: "Social", connections: "Connections", projects: "Projects", mentorship: "Mentorship", events: "Events", moderation: "Account", announcements: "Announcements" };
  const page = await listNotifications({ userId: user.id, category });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Inbox" title="Notifications" actions={<Button asChild variant="outline" size="sm"><Link href="/settings/notifications">Preferences</Link></Button>} />
      <nav aria-label="Filter notifications" className="-mx-1 mb-4 overflow-x-auto pb-1">
        <ul className="flex min-w-max gap-1.5 px-1">
          {[{ value: null, label: "All" }, ...NOTIFICATION_CATEGORIES.filter((c) => c.value !== "messages")].map((c) => (
            <li key={c.value ?? "all"}>
              <Link href={c.value ? `/notifications?category=${c.value}` : "/notifications"} aria-current={category === c.value ? "true" : undefined}
                className={cn("block rounded-full border px-3 py-1 text-[13px] font-medium", category === c.value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {c.value ? SHORT[c.value] : "All"}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {page.items.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing here yet">When people react to your posts, request to connect or invite you to projects, you will see it here.</EmptyState>
      ) : (
        <NotificationList key={category ?? "all"} initialItems={page.items} initialCursor={page.nextCursor} category={category} />
      )}
    </div>
  );
}

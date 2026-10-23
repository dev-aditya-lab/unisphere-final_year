"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellOff, ChevronDown, ChevronRight, UserPlus } from "lucide-react";
import { Settings, Users } from "@/components/icons/lucide-compat";
import { ChannelIcon } from "@/components/community/channel-icon";
import { useWorkspace } from "@/components/community/workspace-provider";
import { MediaImage } from "@/components/media-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roleAtLeast } from "@/lib/community/rules";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "unisphere:community-collapsed";

// Which categories the member folded is remembered in this browser only. It is a convenience: when storage is blocked or empty
// everything is open, and when it cannot be written the fold lasts until the page is closed (the in-memory copy).
let memory = null;
const listeners = new Set();
const readRaw = () => {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
};
const subscribe = (cb) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
function writeCollapsed(next) {
  memory = JSON.stringify(next);
  try {
    window.localStorage.setItem(COLLAPSE_KEY, memory);
  } catch {
    /* blocked: the in-memory copy still folds it for this visit */
  }
  listeners.forEach((cb) => cb());
}

function ChannelLink({ channel, active, slug, unread, mutedChannel }) {
  const hasUnread = unread?.unread > 0 && !mutedChannel;
  return (
    <Link
      href={`/communities/${slug}/channels/${channel.id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/45 group flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-sm outline-none focus-visible:ring-[3px]",
        active ? "bg-accent text-foreground font-semibold" : hasUnread ? "text-foreground hover:bg-accent/60 font-semibold" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <ChannelIcon type={channel.type} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      {mutedChannel && <BellOff className="size-3.5 shrink-0 opacity-60" aria-label="Muted" />}
      {unread?.mentions > 0 && !mutedChannel ? (
        <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px]" aria-label={`${unread.mentions} mention${unread.mentions === 1 ? "" : "s"}`}>
          {unread.mentions > 99 ? "99+" : unread.mentions}
        </Badge>
      ) : hasUnread ? (
        <span className="bg-primary size-2 shrink-0 rounded-full" aria-label="Unread messages" />
      ) : null}
    </Link>
  );
}

/**
 * Categories and channels of one community. Folded categories are remembered in this browser only. Unread dots and mention counts
 * come from the community's live connection. A channel the member cannot read is not in the list at all (the server never sent it).
 */
export function ChannelSidebar({ slug, className }) {
  const { community, me, categories, channels, unread, prefs } = useWorkspace();
  const pathname = usePathname();
  const activeId = pathname?.match(/\/channels\/([0-9a-f-]{36})/i)?.[1]?.toLowerCase() ?? null;
  const raw = useSyncExternalStore(subscribe, readRaw, () => "{}");
  const collapsed = useMemo(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }, [raw]);

  const mutedIds = useMemo(() => new Set(prefs.filter((p) => p.channel_id && (p.level === "none" || (p.muted_until && new Date(p.muted_until) > new Date()))).map((p) => p.channel_id)), [prefs]);
  const communityMuted = prefs.some((p) => !p.channel_id && (p.level === "none" || (p.muted_until && new Date(p.muted_until) > new Date())));

  const live = channels.filter((c) => !c.archived_at);
  const loose = live.filter((c) => !c.category_id || !categories.some((k) => k.id === c.category_id));
  const sections = categories.filter((k) => !k.archived_at).map((k) => ({ ...k, channels: live.filter((c) => c.category_id === k.id) }));
  const staff = me && roleAtLeast(me.role, "moderator");
  const manager = me && roleAtLeast(me.role, "admin");

  function toggle(id) {
    writeCollapsed({ ...collapsed, [id]: !collapsed[id] });
  }

  return (
    <nav aria-label={`${community.name} channels`} className={cn("flex min-h-0 flex-col", className)}>
      <div className="border-b p-3">
        <Link href={`/communities/${slug}`} className="focus-visible:ring-ring/45 flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-[3px]">
          <span className="bg-accent grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-bold">
            {community.avatar_key ? <MediaImage mediaKey={community.avatar_key} width={96} className="size-full object-cover" /> : community.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="font-heading block truncate text-sm font-bold">{community.name}</span>
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Users className="size-3" aria-hidden="true" /> {community.member_count} member{community.member_count === 1 ? "" : "s"}
              {communityMuted && <BellOff className="ml-1 size-3" aria-label="Community muted" />}
            </span>
          </span>
        </Link>
        <div className="mt-2.5 flex gap-1.5">
          <Button asChild variant="outline" size="xs" className="flex-1">
            <Link href={`/communities/${slug}/invite`}><UserPlus /> Invite</Link>
          </Button>
          {staff && (
            <Button asChild variant="outline" size="xs" className="flex-1">
              <Link href={`/communities/${slug}/settings`}><Settings /> {manager ? "Manage" : "Moderate"}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {loose.length > 0 && (
          <ul className="mb-2 space-y-0.5">
            {loose.map((c) => (
              <li key={c.id}><ChannelLink channel={c} active={c.id === activeId} slug={slug} unread={unread[c.id]} mutedChannel={mutedIds.has(c.id) || communityMuted} /></li>
            ))}
          </ul>
        )}
        {sections.map((section) => {
          const open = !collapsed[section.id];
          // a folded category still shows the channel that has something new, so folding never hides a mention
          const visible = open ? section.channels : section.channels.filter((c) => c.id === activeId || unread[c.id]?.mentions > 0);
          return (
            <section key={section.id} className="mb-2" aria-label={section.name}>
              <h2 className="m-0">
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  aria-expanded={open}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/45 flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold tracking-wide uppercase outline-none focus-visible:ring-[3px]"
                >
                  {open ? <ChevronDown className="size-3" aria-hidden="true" /> : <ChevronRight className="size-3" aria-hidden="true" />}
                  {section.name}
                </button>
              </h2>
              <ul className="space-y-0.5">
                {visible.map((c) => (
                  <li key={c.id}><ChannelLink channel={c} active={c.id === activeId} slug={slug} unread={unread[c.id]} mutedChannel={mutedIds.has(c.id) || communityMuted} /></li>
                ))}
                {open && section.channels.length === 0 && <li className="text-muted-foreground px-2.5 py-1 text-xs">No channels yet.</li>}
              </ul>
            </section>
          );
        })}
        {live.length === 0 && <p className="text-muted-foreground px-2.5 py-4 text-sm">There are no channels you can read yet.</p>}
      </div>
    </nav>
  );
}

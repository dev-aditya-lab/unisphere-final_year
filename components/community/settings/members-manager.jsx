"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { ActionMenu } from "@/components/community/action-menu";
import { ModerateMemberDialog } from "@/components/community/dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { listMembersAction, setMemberRoleAction, transferOwnershipAction } from "@/lib/actions/community-workspace";
import { respondMembershipAction } from "@/lib/actions/campus";
import { ROLE_LABEL, ROLE_SUMMARY, ROLE_WARNING, rankOf, roleCan } from "@/lib/community/rules";

function RoleDialog({ target, role, communityId, onClose, onDone }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const warning = ROLE_WARNING[role];
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make {target.person.full_name} {role === "admin" ? "an administrator" : role === "moderator" ? "a moderator" : "a member"}?</DialogTitle>
          <DialogDescription>{ROLE_SUMMARY[role]}</DialogDescription>
        </DialogHeader>
        {warning && <p className="bg-warning-soft text-warning-text rounded-lg p-3 text-sm" role="note">{warning}</p>}
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() => startTransition(async () => {
              const res = await setMemberRoleAction({ communityId, userId: target.user_id, role });
              if (res.ok) { toast.success("Role updated. It is recorded in the audit log."); onDone(); onClose(); } else setError(res.error);
            })}
          >
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ target, community, onClose, onDone }) {
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState(null);
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand {community.name} to {target.person.full_name}?</DialogTitle>
          <DialogDescription>
            They become the owner. You stay on as an administrator, and only the new owner can change that. There is always exactly one owner. To confirm, type the community address:
            <strong className="mt-1 block font-mono">{community.slug}</strong>
          </DialogDescription>
        </DialogHeader>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the community address to confirm" autoComplete="off" />
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={pending || typed !== community.slug}
            onClick={() => startTransition(async () => {
              const res = await transferOwnershipAction({ communityId: community.id, userId: target.user_id, confirm: typed });
              if (res.ok) { toast.success("Ownership transferred"); onDone(); onClose(); } else setError(res.error);
            })}
          >
            {pending ? "Transferring…" : "Transfer ownership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TABS = [["active", "Members"], ["pending", "Requests"], ["banned", "Banned"]];

/** Search, review and manage members. Every button is also checked by the server against the signed-in member's rank. */
export function MembersManager({ community, myRole, myId, pendingCount }) {
  const router = useRouter();
  const [tab, setTab] = useState("active");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [state, setState] = useState({ loading: true, members: [], hasMore: false, error: null });
  const [dialog, setDialog] = useState(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async (reset) => {
    setState((s) => ({ ...s, loading: true, error: null, ...(reset ? { members: [] } : {}) }));
    const p = reset ? 0 : page + 1;
    const res = await listMembersAction({ communityId: community.id, query, status: tab, page: p });
    if (!res.ok) return setState((s) => ({ ...s, loading: false, error: res.error }));
    setPage(p);
    setState((s) => ({ loading: false, error: null, hasMore: res.hasMore, members: reset ? res.members : [...s.members, ...res.members] }));
  }, [community.id, query, tab, page]);

  useEffect(() => {
    const t = setTimeout(() => load(true), query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query]);

  const refresh = () => { load(true); router.refresh(); };
  const respond = (m, accept) =>
    startTransition(async () => {
      const res = await respondMembershipAction({ communityId: community.id, userId: m.user_id, accept });
      if (res.ok) { toast.success(accept ? "Member added" : "Request declined"); refresh(); } else toast.error(res.error);
    });

  const canActOn = (m) => m.user_id !== myId && m.role !== "owner" && rankOf(myRole) > rankOf(m.role);

  function menuFor(m) {
    const items = [];
    if (m.status === "active") {
      const person = { ...m.person, user_id: m.user_id };
      if (roleCan(myRole, "roles.manage") && m.role !== "admin") items.push({ id: "admin", label: "Make administrator…", onSelect: () => setDialog({ type: "role", m, role: "admin" }) });
      if (roleCan(myRole, "roles.manage_limited") && canActOn(m) && m.role !== "moderator") items.push({ id: "mod", label: "Make moderator…", onSelect: () => setDialog({ type: "role", m, role: "moderator" }) });
      if (roleCan(myRole, "roles.manage_limited") && canActOn(m) && m.role !== "member") items.push({ id: "member", label: "Make ordinary member…", onSelect: () => setDialog({ type: "role", m, role: "member" }) });
      if (roleCan(myRole, "members.restrict") && canActOn(m)) {
        items.push({ id: "warn", label: "Warn…", onSelect: () => setDialog({ type: "moderate", m: person, action: "warn" }), separatorBefore: items.length > 0 });
        items.push({ id: "timeout", label: m.muted_until && new Date(m.muted_until) > new Date() ? "End timeout…" : "Time out…", onSelect: () => setDialog({ type: "moderate", m: person, action: m.muted_until && new Date(m.muted_until) > new Date() ? "clear_timeout" : "timeout" }) });
        items.push({ id: "note", label: "Add a private note…", onSelect: () => setDialog({ type: "moderate", m: person, action: "note" }) });
      }
      if (roleCan(myRole, "members.ban") && canActOn(m)) {
        items.push({ id: "remove", label: "Remove from community…", destructive: true, onSelect: () => setDialog({ type: "moderate", m: person, action: "remove" }), separatorBefore: true });
        items.push({ id: "ban", label: "Ban…", destructive: true, onSelect: () => setDialog({ type: "moderate", m: person, action: "ban" }) });
      }
      if (roleCan(myRole, "community.transfer") && m.user_id !== myId) items.push({ id: "transfer", label: "Make owner (hand over)…", destructive: true, separatorBefore: true, onSelect: () => setDialog({ type: "transfer", m }) });
    }
    if (m.status === "banned" && roleCan(myRole, "members.ban")) items.push({ id: "unban", label: "Lift the ban…", onSelect: () => setDialog({ type: "moderate", m: { ...m.person, user_id: m.user_id }, action: "unban" }) });
    return items;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Member lists" className="bg-muted inline-flex rounded-lg p-1">
          {TABS.filter(([v]) => v === "active" || roleCan(myRole, "members.approve")).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={tab === v} type="button" onClick={() => { setTab(v); setPage(0); }} className={`focus-visible:ring-ring/45 rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-[3px] ${tab === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {label}{v === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or username" aria-label="Search members" className="max-w-xs" maxLength={40} />
      </div>

      {state.error && <p role="alert" className="text-destructive-text text-sm">{state.error} <button type="button" onClick={() => load(true)} className="underline">Try again</button></p>}
      <ul className="divide-y">
        {state.members.map((m) => {
          const items = menuFor(m);
          const timedOut = m.muted_until && new Date(m.muted_until) > new Date();
          return (
            <li key={m.user_id} className="flex items-center gap-3 py-2.5">
              <UserAvatar name={m.person.full_name} avatarKey={m.person.avatar_key} size="sm" />
              <div className="min-w-0 flex-1">
                {m.person.username ? <Link href={`/u/${m.person.username}`} prefetch={false} className="block truncate text-sm font-semibold hover:underline">{m.person.full_name}</Link> : <span className="block truncate text-sm font-semibold">{m.person.full_name}</span>}
                <span className="text-muted-foreground text-xs">{m.person.username ? `@${m.person.username} · ` : ""}joined {new Date(m.joined_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
              </div>
              {timedOut && <Badge variant="mono">Timed out</Badge>}
              {m.role !== "member" && <Badge variant={m.role === "owner" ? "soft" : "mono"}>{ROLE_LABEL[m.role]}</Badge>}
              {m.status === "pending" && roleCan(myRole, "members.approve") && (
                <span className="flex gap-1.5">
                  <Button size="sm" onClick={() => respond(m, true)}><Check /> Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => respond(m, false)}><X /> Decline</Button>
                </span>
              )}
              {items.length > 0 && (
                <ActionMenu
                  title={m.person.full_name}
                  items={items}
                  trigger={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.person.full_name}`}><MoreHorizontal /></Button>}
                />
              )}
            </li>
          );
        })}
      </ul>
      {state.loading && <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>}
      {!state.loading && !state.error && state.members.length === 0 && <p className="text-muted-foreground text-sm">{query ? "No one matches that search." : tab === "pending" ? "No one is waiting to join." : tab === "banned" ? "No one is banned." : "No members yet."}</p>}
      {state.hasMore && !state.loading && <Button variant="outline" onClick={() => load(false)}>Show more</Button>}

      {dialog?.type === "role" && <RoleDialog target={dialog.m} role={dialog.role} communityId={community.id} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.type === "transfer" && <TransferDialog target={dialog.m} community={community} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.type === "moderate" && (
        <ModerateMemberDialog open onOpenChange={(o) => !o && setDialog(null)} communityId={community.id} person={dialog.m} action={dialog.action} onDone={refresh} />
      )}
    </div>
  );
}

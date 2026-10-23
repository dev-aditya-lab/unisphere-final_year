"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { createInviteAction, revokeInviteAction } from "@/lib/actions/community-workspace";
import { suggestMentionsAction } from "@/lib/actions/discovery";
import { INVITE_EXPIRY_OPTIONS, INVITE_USE_OPTIONS } from "@/lib/community/rules";

const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function statusOf(i) {
  if (i.revoked_at) return "Revoked";
  if (new Date(i.expires_at) <= new Date()) return "Expired";
  if (i.max_uses !== null && i.uses >= i.max_uses) return "Used up";
  return "Active";
}

/** Find one person to invite by name (people the member may already see; the server checks again). */
function PersonPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState([]);
  useEffect(() => {
    const term = q.trim().replace(/^@/, "");
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await suggestMentionsAction({ query: term });
      if (live && res.ok) setOptions(res.people);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  if (value) {
    return (
      <div className="bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <UserAvatar name={value.full_name} avatarKey={value.avatar_key} size="xs" />
        <span className="flex-1 truncate font-medium">{value.full_name} <span className="text-muted-foreground">@{value.username}</span></span>
        <button type="button" onClick={() => onChange(null)} aria-label="Choose someone else" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
    );
  }
  return (
    <div>
      <Input id="inv-person" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or username" autoComplete="off" maxLength={40} />
      {q.trim().replace(/^@/, "").length >= 2 && options.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border" aria-label="People">
          {options.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onChange(p); setQ(""); setOptions([]); }} className="hover:bg-accent flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm">
                <UserAvatar name={p.full_name} avatarKey={p.avatar_key} size="xs" />
                <span className="truncate font-medium">{p.full_name}</span><span className="text-muted-foreground truncate">@{p.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Invitation links: choose how long and how many people, or name one person. The link is shown once, when it is made (only a
 * hash is stored), so it can be copied now and never read back from the database by anyone.
 */
export function InvitesPanel({ communityId, invites, canManage, invitePolicy }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hours, setHours] = useState("168");
  const [uses, setUses] = useState(canManage ? "0" : "25");
  const [person, setPerson] = useState(null);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const limited = !canManage;

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copied");
    } catch {
      toast.error("Your browser would not let us copy that. Select the link and copy it by hand.");
    }
  }

  function create(e) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createInviteAction({ communityId, hours: Number(hours), maxUses: Number(uses) || null, inviteeId: person?.id ?? null });
      if (res.ok) {
        setCreated({ url: `${window.location.origin}/join/${res.code}`, person });
        setPerson(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="space-y-4 rounded-xl border p-4" noValidate>
        <h3 className="text-sm font-bold">Create an invitation</h3>
        {limited && <p className="text-muted-foreground text-xs">Member invitations last up to 7 days and work for up to 25 people.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="inv-hours" label="Valid for">
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger id="inv-hours" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{INVITE_EXPIRY_OPTIONS.filter((o) => !limited || o.hours <= 168).map((o) => <SelectItem key={o.hours} value={String(o.hours)}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="inv-uses" label="Can be used by" hint={person ? "A named invitation works once, for that person only." : undefined}>
            <Select value={person ? "1" : uses} onValueChange={setUses} disabled={Boolean(person)}>
              <SelectTrigger id="inv-uses" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{INVITE_USE_OPTIONS.filter((o) => !limited || (o.value > 0 && o.value <= 25)).map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field id="inv-person" label="Or invite one person by name" optional hint="They get a notification with the link.">
          <PersonPicker value={person} onChange={setPerson} />
        </Field>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Link2 />} Create invitation</Button>
      </form>

      {created && (
        <div className="bg-primary-soft rounded-xl border p-4" role="status">
          <p className="mb-2 text-sm font-semibold">{created.person ? `Invitation sent to ${created.person.full_name}.` : "Your invitation link is ready."} Copy it now: for safety it cannot be shown again.</p>
          <div className="flex gap-2">
            <Input readOnly value={created.url} aria-label="Invitation link" onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button type="button" onClick={() => copy(created.url)}><Copy /> Copy</Button>
          </div>
        </div>
      )}

      <section aria-label="Invitations">
        <h3 className="mb-2 text-sm font-bold">{canManage ? "All invitations" : "Your invitations"}</h3>
        {invites.length === 0 ? (
          <p className="text-muted-foreground text-sm">No invitations yet.</p>
        ) : (
          <ul className="divide-y">
            {invites.map((i) => {
              const st = statusOf(i);
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="font-mono text-xs">…{i.code_hint}</span>
                  <Badge variant={st === "Active" ? "soft" : "mono"}>{st}</Badge>
                  <span className="text-muted-foreground flex-1 text-xs">
                    {i.invitee_id ? "Named invitation · " : ""}{i.uses}{i.max_uses ? ` of ${i.max_uses}` : ""} used · expires {fmt.format(new Date(i.expires_at))}
                  </span>
                  {st === "Active" && (
                    <Button size="xs" variant="outline" disabled={pending} onClick={() => startTransition(async () => { const r = await revokeInviteAction(i.id); if (r.ok) { toast.success("Invitation revoked"); router.refresh(); } else toast.error(r.error); })}>
                      <X /> Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {invitePolicy === "staff" && canManage && <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs"><Check className="size-3.5" /> Only moderators and above can create invitations. Change this in General.</p>}
      </section>
    </div>
  );
}

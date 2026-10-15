"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Loader2, Plus, Search, Sparkles, Trash2, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TagInput } from "@/components/forms/tag-input";
import { UserAvatar } from "@/components/user-avatar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  addRoleAction, deleteProjectAction, deleteRoleAction, inviteToProjectAction, removeMemberAction, respondToJoinRequestAction,
  revokeInvitationAction, setMemberRoleAction, setRoleOpenAction, teammateSuggestionsAction,
} from "@/lib/actions/projects";
import { searchPeopleAction } from "@/lib/actions/people";
import { timeAgo } from "@/lib/format";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn, success) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (success) toast.success(success);
        router.refresh();
      } else toast.error(res.error);
    });
  return [pending, run];
}

function Person({ person, sub }) {
  if (!person) return <span className="text-muted-foreground text-sm">Unavailable member</span>;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar name={person.full_name} avatarKey={person.avatar_key} size="sm" />
      <div className="min-w-0 leading-tight">
        {person.username ? (
          <Link prefetch={false} href={`/u/${person.username}`} className="flex items-center gap-1 truncate text-sm font-semibold hover:underline">
            {person.full_name}
            {person.verified && <BadgeCheck className="text-teal-text size-3.5" aria-label="Verified" />}
          </Link>
        ) : (
          <span className="text-sm font-semibold">{person.full_name}</span>
        )}
        {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
      </div>
    </div>
  );
}

export function TeamPanel({ projectId, team, myRole }) {
  const [pending, run] = useRun();
  const isOwner = myRole === "owner";
  return (
    <ul className="divide-y">
      {team.map((m) => (
        <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <Person person={m.person} sub={m.title || m.person.headline} />
          <div className="flex items-center gap-2">
            {isOwner && m.role !== "owner" ? (
              <Select value={m.role} onValueChange={(role) => run(() => setMemberRoleAction({ projectId, userId: m.user_id, role }), "Role updated")} disabled={pending}>
                <SelectTrigger size="sm" className="w-32" aria-label={`Role of ${m.person.full_name}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={m.role === "owner" ? "soft" : "mono"} className="capitalize">{m.role}</Badge>
            )}
            {m.role !== "owner" && (myRole === "owner" || (myRole === "manager" && m.role === "member")) && (
              <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Remove ${m.person.full_name}`} onClick={() => run(() => removeMemberAction({ projectId, userId: m.user_id }), "Member removed")}>
                <UserMinus />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RequestsPanel({ requests, roles }) {
  const [pending, run] = useRun();
  if (!requests.length) return <p className="text-muted-foreground text-sm">No pending join requests.</p>;
  const roleTitle = (id) => roles.find((r) => r.id === id)?.title;
  return (
    <ul className="divide-y">
      {requests.map((r) => (
        <li key={r.id} className="space-y-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Person person={r.person} sub={`${timeAgo(r.created_at)}${r.role_id ? ` · for ${roleTitle(r.role_id) ?? "a role"}` : ""}`} />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => run(() => respondToJoinRequestAction({ requestId: r.id, accept: true }), "Added to the team")}><Check /> Accept</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => respondToJoinRequestAction({ requestId: r.id, accept: false }))}><X /> Decline</Button>
            </div>
          </div>
          {r.person?.skills?.length > 0 && <p className="text-muted-foreground text-xs">Lists: {r.person.skills.slice(0, 6).join(", ")}</p>}
          {r.message && <p className="bg-muted/50 rounded-md p-2.5 text-sm">“{r.message}”</p>}
        </li>
      ))}
    </ul>
  );
}

export function InvitePanel({ projectId, invitations }) {
  const [pending, run] = useRun();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounced = useDebouncedValue(query, 350);

  useEffect(() => {
    let cancelled = false;
    if (debounced.trim().length < 2) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    searchPeopleAction({ query: debounced }).then((res) => {
      if (cancelled) return;
      setSearching(false);
      setResults(res.ok ? res.people : []);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const shown = debounced.trim().length < 2 ? [] : results;

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="invite-search" className="text-[13px] font-semibold">Invite someone</label>
        <div className="relative mt-1.5">
          <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input id="invite-search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, username or skill" autoComplete="off" />
          {searching && <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" aria-label="Searching" />}
        </div>
        {shown.length > 0 && (
          <ul className="mt-2 divide-y rounded-md border" aria-label="Search results">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 p-2.5">
                <Person person={p} sub={p.headline} />
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => inviteToProjectAction({ projectId, inviteeId: p.id }), `Invitation sent to ${p.full_name}`)}>Invite</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="eyebrow mb-2">Pending invitations</h3>
        {invitations.length === 0 ? (
          <p className="text-muted-foreground text-sm">None right now.</p>
        ) : (
          <ul className="divide-y">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2.5">
                <Person person={i.person} sub={`Invited ${timeAgo(i.created_at)}${i.role_label ? ` as ${i.role_label}` : ""}`} />
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeInvitationAction(i.id), "Invitation revoked")}>Revoke</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SuggestionsPanel({ projectId, project }) {
  const [pending, startTransition] = useTransition();
  const [pendingInvite, run] = useRun();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await teammateSuggestionsAction({ projectId, project: { name: project.name, tagline: project.tagline, required_skills: project.required_skills } });
      if (res.ok) setData(res);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Suggestions come from people who marked themselves open to collaboration and <em>list</em> skills, roles or interests that match this project. Score = 3 × matching skills + 2 × matching roles + 1 × matching interests. Nobody is credited with a skill they did not list.
      </p>
      {!data && (
        <Button variant="outline" onClick={load} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Find teammates
        </Button>
      )}
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      {data && data.items.length === 0 && <p className="text-sm">No matches yet. Add required skills and open roles, or ask people to list their skills.</p>}
      {data && data.items.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {data.items.map((c) => (
            <li key={c.id} className="space-y-1.5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Person person={{ ...c, verified: c.verified }} sub={c.headline} />
                <div className="flex items-center gap-2">
                  <Badge variant="mono" title="3×skills + 2×roles + 1×interests">score {c.score}</Badge>
                  <Button size="sm" variant="outline" disabled={pendingInvite} onClick={() => run(() => inviteToProjectAction({ projectId, inviteeId: c.id }), `Invitation sent to ${c.full_name}`)}>Invite</Button>
                </div>
              </div>
              <p className="text-sm">
                {c.source === "ai" && <Sparkles className="text-teal-text mr-1 inline size-3.5" aria-label="AI-written" />}
                {c.why}
              </p>
              {c.availability && <p className="text-muted-foreground text-xs">Availability: {c.availability.replace("_", " ")}</p>}
            </li>
          ))}
        </ul>
      )}
      {data && <p className="text-muted-foreground text-xs">{data.aiUsed ? "Reasons rephrased by AI from the listed facts above." : "Reasons are generated from profile facts."}</p>}
    </div>
  );
}

export function RolesPanel({ projectId, roles }) {
  const [pending, run] = useRun();
  const [title, setTitle] = useState("");
  const [skills, setSkills] = useState([]);
  return (
    <div className="space-y-4">
      {roles.length === 0 ? (
        <p className="text-muted-foreground text-sm">No roles yet.</p>
      ) : (
        <ul className="divide-y">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="text-sm font-semibold">{r.title} {!r.is_open && <Badge variant="mono">closed</Badge>}</p>
                {r.skills?.length > 0 && <p className="text-muted-foreground text-xs">{r.skills.join(", ")}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setRoleOpenAction({ roleId: r.id, isOpen: !r.is_open }))}>{r.is_open ? "Close" : "Reopen"}</Button>
                <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Delete role ${r.title}`} onClick={() => run(() => deleteRoleAction(r.id), "Role removed")}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 rounded-md border p-3">
        <label htmlFor="new-role" className="text-[13px] font-semibold">Add an open role</label>
        <Input id="new-role" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Backend developer" maxLength={60} />
        <TagInput label="Skills for the role" value={skills} onChange={setSkills} max={10} placeholder="Skills (optional)" />
        <Button size="sm" disabled={pending || title.trim().length < 2} onClick={() => run(async () => { const r = await addRoleAction({ projectId, role: { title, skills } }); if (r.ok) { setTitle(""); setSkills([]); } return r; }, "Role added")}>
          <Plus /> Add role
        </Button>
      </div>
    </div>
  );
}

export function DeleteProjectButton({ projectId, name }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm"><Trash2 /> Delete project</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>The project disappears for everyone, including pending requests. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-white" disabled={pending} onClick={() => startTransition(async () => { const res = await deleteProjectAction(projectId); if (res.ok) { toast.success("Project deleted"); router.push("/projects"); router.refresh(); } else toast.error(res.error); })}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { listMembersAction } from "@/lib/actions/community-workspace";
import { ROLE_LABEL } from "@/lib/community/rules";

/** The people in a community, searchable and paged. Ordinary members see active members only; the server decides, not this list. */
export function MembersList({ communityId, initial }) {
  const [query, setQuery] = useState("");
  const [base, setBase] = useState({ members: initial.members, hasMore: initial.hasMore, page: 0 }); // the plain list and the pages loaded after it
  const [found, setFound] = useState({ query: "", members: [], hasMore: false, page: 0 }); // the result of the search being shown
  const [state, setState] = useState({ loading: false, error: null });
  const searching = query.trim().length > 0;

  const fetchPage = useCallback(async (q, page) => {
    setState({ loading: true, error: null });
    const res = await listMembersAction({ communityId, query: q, status: "active", page });
    if (!res.ok) {
      setState({ loading: false, error: res.error });
      return null;
    }
    setState({ loading: false, error: null });
    return res;
  }, [communityId]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await fetchPage(q, 0);
      if (live && res) setFound({ query: q, members: res.members, hasMore: res.hasMore, page: 0 });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, fetchPage]);

  async function more() {
    if (searching) {
      const res = await fetchPage(found.query, found.page + 1);
      if (res) setFound((f) => ({ ...f, members: [...f.members, ...res.members], hasMore: res.hasMore, page: f.page + 1 }));
    } else {
      const res = await fetchPage("", base.page + 1);
      if (res) setBase((b) => ({ members: [...b.members, ...res.members], hasMore: res.hasMore, page: b.page + 1 }));
    }
  }

  const shown = searching ? (found.query === query.trim() ? found : { members: [], hasMore: false }) : base;
  return (
    <div className="surface space-y-3 p-4">
      <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members" aria-label="Search members" maxLength={40} className="max-w-xs" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-2.5">
            <UserAvatar name={m.person.full_name} avatarKey={m.person.avatar_key} size="sm" />
            <div className="min-w-0 leading-tight">
              {m.person.username ? <Link href={`/u/${m.person.username}`} prefetch={false} className="block truncate text-sm font-semibold hover:underline">{m.person.full_name}</Link> : <span className="block truncate text-sm font-semibold">{m.person.full_name}</span>}
              {m.role !== "member" && <Badge variant={m.role === "owner" ? "soft" : "mono"} className="mt-0.5">{ROLE_LABEL[m.role]}</Badge>}
            </div>
          </li>
        ))}
      </ul>
      {state.loading && <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Loading…</p>}
      {state.error && <p role="alert" className="text-destructive-text text-sm">{state.error}</p>}
      {!state.loading && !state.error && shown.members.length === 0 && <p className="text-muted-foreground text-sm">{searching ? "No one matches that search." : "No members yet."}</p>}
      {shown.hasMore && !state.loading && <Button variant="outline" onClick={more}>Show more</Button>}
    </div>
  );
}

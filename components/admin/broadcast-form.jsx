"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { previewBroadcastAction, sendBroadcastAction } from "@/lib/actions/admin";
import { ACCOUNT_TYPES, splitNames } from "@/lib/validators/broadcast";

const field = "border-input bg-card h-9 w-full rounded-md border px-2 text-sm";
const TYPE_LABEL = { student: "Students", alumni: "Alumni", faculty: "Faculty", staff: "Staff" };

/**
 * Compose an official notification and choose who gets it. The count under the audience comes from the database for the signed-in
 * administrator, so it already respects what they may reach; sending asks once more, with the number, before anything goes out.
 */
export function BroadcastForm({ colleges, canReachEveryone }) {
  const [everyone, setEveryone] = useState(false);
  const [collegeIds, setCollegeIds] = useState([]);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [communityText, setCommunityText] = useState("");
  const [peopleText, setPeopleText] = useState("");
  const [types, setTypes] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [push, setPush] = useState(true);
  const [count, setCount] = useState(null); // { count, sample } | { error }
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const audience = useMemo(
    () => ({ everyone, colleges: collegeIds, communities: splitNames(communityText), usernames: splitNames(peopleText), accountTypes: types }),
    [everyone, collegeIds, communityText, peopleText, types],
  );
  const chosen = everyone || collegeIds.length > 0 || audience.communities.length > 0 || audience.usernames.length > 0;
  const shownColleges = colleges.filter((c) => !collegeFilter.trim() || c.name.toLowerCase().includes(collegeFilter.trim().toLowerCase()));

  // How many people this audience reaches, a moment after the administrator stops changing it.
  useEffect(() => {
    if (!chosen) return undefined;
    let current = true;
    const timer = setTimeout(async () => {
      const res = await previewBroadcastAction({ audience });
      if (current) setCount(res.ok ? { count: res.count, sample: res.sample } : { error: res.fieldErrors?.audience ?? res.error });
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [audience, chosen]);
  const reach = chosen ? count : null;

  const toggle = (list, setList, value) => setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const ready = chosen && title.trim() && body.trim() && reach && !reach.error && reach.count > 0;

  function send() {
    setErrors({});
    startTransition(async () => {
      const res = await sendBroadcastAction({ title, body, href, push, audience });
      if (res.ok) {
        toast.success(res.message);
        setTitle("");
        setBody("");
        setHref("");
        setConfirming(false);
        router.refresh();
      } else {
        setConfirming(false);
        setErrors({ ...res.fieldErrors, _form: res.error });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) setConfirming(true);
      }}
      className="space-y-5"
    >
      <fieldset className="space-y-3">
        <legend className="text-[13px] font-semibold">Who is it for?</legend>
        <p className="text-muted-foreground text-xs">Add as many parts as you like; a member in any of them is included. Then narrow by type of account if you want.</p>

        {canReachEveryone && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} className="size-4" /> Everyone on UniSphere
          </label>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="bc-college-filter" className="text-xs font-medium">Colleges{collegeIds.length ? ` (${collegeIds.length} chosen)` : ""}</Label>
          <input id="bc-college-filter" value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)} placeholder="Find a college" className={field} />
          <div className="border-input max-h-40 space-y-1 overflow-y-auto rounded-md border p-2" role="group" aria-label="Colleges">
            {shownColleges.length === 0 && <p className="text-muted-foreground text-xs">No college matches.</p>}
            {shownColleges.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={collegeIds.includes(c.id)} onChange={() => toggle(collegeIds, setCollegeIds, c.id)} className="size-4" /> {c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bc-communities" className="text-xs font-medium">Communities (their addresses, for example robotics-club)</Label>
          <input id="bc-communities" value={communityText} onChange={(e) => setCommunityText(e.target.value)} placeholder="robotics-club, photography" className={field} />
          {errors["audience.communities"] && <p className="text-destructive-text text-xs">{errors["audience.communities"]}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bc-people" className="text-xs font-medium">Specific people (usernames, separated by commas or spaces)</Label>
          <Textarea id="bc-people" value={peopleText} onChange={(e) => setPeopleText(e.target.value)} rows={2} placeholder="asha, rahul_k" />
          {errors["audience.usernames"] && <p className="text-destructive-text text-xs">{errors["audience.usernames"]}</p>}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">Only these kinds of account (none ticked means all)</p>
          <div className="flex flex-wrap gap-4">
            {ACCOUNT_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={types.includes(t)} onChange={() => toggle(types, setTypes, t)} className="size-4" /> {TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        </div>

        <p role="status" aria-live="polite" className="bg-muted/60 rounded-md px-3 py-2 text-sm">
          {!chosen && "Choose an audience to see how many people it reaches."}
          {chosen && !reach && "Counting…"}
          {chosen && reach?.error && <span className="text-destructive-text">{reach.error}</span>}
          {chosen && reach && !reach.error && (
            <>
              <strong>{reach.count.toLocaleString("en-IN")}</strong> {reach.count === 1 ? "person" : "people"}
              {reach.sample?.length ? <span className="text-muted-foreground"> · for example {reach.sample.map((u) => `@${u}`).join(", ")}</span> : null}
            </>
          )}
        </p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-semibold">What does it say?</legend>
        <div className="space-y-1.5">
          <Label htmlFor="bc-title" className="text-xs font-medium">Title</Label>
          <input id="bc-title" placeholder="e.g. New: study groups are here" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={field} required />
          {errors.title && <p className="text-destructive-text text-xs">{errors.title}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bc-body" className="text-xs font-medium">Message <span className="text-muted-foreground font-normal">({body.length}/2000)</span></Label>
          <Textarea id="bc-body" placeholder="A short message members see in their notification" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} required />
          {errors.body && <p className="text-destructive-text text-xs">{errors.body}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bc-href" className="text-xs font-medium">Where tapping it goes (optional, a page on UniSphere)</Label>
          <input id="bc-href" value={href} onChange={(e) => setHref(e.target.value)} placeholder="/events" className={field} />
          {errors.href && <p className="text-destructive-text text-xs">{errors.href}</p>}
        </div>
        <div className="flex items-start gap-3">
          <Switch id="bc-push" checked={push} onCheckedChange={setPush} aria-label="Also send as a push notification" />
          <div>
            <Label htmlFor="bc-push" className="text-sm font-medium">Also send as a push notification</Label>
            <p className="text-muted-foreground text-xs">Members who turned off Push for official announcements, or have no phone or browser set up, still see it in the bell.</p>
          </div>
        </div>
      </fieldset>

      <div aria-label="Preview" className="bg-muted/50 flex items-start gap-3 rounded-xl border p-3">
        <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-lg" aria-hidden="true">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-medium">UniSphere · now</p>
          <p className="truncate text-sm font-semibold">Announcement: {title || "Your title"}</p>
          <p className="text-muted-foreground line-clamp-2 text-xs break-words">{body || "Your message appears here."}</p>
        </div>
      </div>

      {errors._form && <p role="alert" className="text-destructive-text text-sm">{errors._form}</p>}

      {confirming ? (
        <div role="alertdialog" aria-label="Confirm sending" className="border-warning/40 bg-warning/10 space-y-3 rounded-xl border p-4">
          <p className="text-sm">
            Send this to <strong>{reach?.count?.toLocaleString("en-IN")}</strong> {reach?.count === 1 ? "person" : "people"}{push ? ", by push as well as in the bell" : ", in the bell only"}? It cannot be unsent.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={send} disabled={pending}>{pending ? "Sending…" : "Yes, send it"}</Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>Go back</Button>
          </div>
        </div>
      ) : (
        <Button type="submit" disabled={!ready || pending}>
          <BellRing className="size-4" aria-hidden="true" /> Review and send
        </Button>
      )}
    </form>
  );
}

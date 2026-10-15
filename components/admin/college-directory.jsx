"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, GitMerge, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CollegePicker } from "@/components/colleges/college-picker";
import { addCollegeAliasAction, mergeCollegesAction, resolveCollegeReportAction, updateCollegeListingAction } from "@/lib/actions/admin";

const KIND_LABEL = { correction: "Correction", duplicate: "Duplicate", inaccurate: "Inaccurate", abuse: "Abuse" };

/** One open report: accept (applies a correction) or reject. */
export function CollegeReportRow({ report }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function decide(decision) {
    setError(null);
    startTransition(async () => {
      const res = await resolveCollegeReportAction({ id: report.id, decision, note: note || undefined });
      if (res.ok) {
        toast.success(decision === "accepted" ? "Report accepted" : "Report rejected");
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <li className="bg-card rounded-xl border p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="bg-warning-soft text-warning-text rounded-md px-2 py-0.5 text-xs font-bold">{KIND_LABEL[report.kind] ?? report.kind}</span>
        <span className="font-heading font-bold">{report.college_name}</span>
        <span className="text-muted-foreground text-xs">by @{report.reporter_username ?? "unknown"}</span>
      </div>
      {report.kind === "correction" && (
        <p className="mt-2 text-sm">
          Change <strong>{report.field}</strong> to <q>{report.proposed_value}</q>
        </p>
      )}
      {report.kind === "duplicate" && (
        <p className="mt-2 text-sm">
          Duplicate of <strong>{report.duplicate_name ?? "another listing"}</strong>. Merge them from the directory below.
        </p>
      )}
      {report.note && <p className="text-muted-foreground mt-1 text-sm">{report.note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={500} className="h-9 max-w-xs" aria-label="Resolution note" />
        <Button size="sm" onClick={() => decide("accepted")} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Accept
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide("rejected")} disabled={pending}>
          <X /> Reject
        </Button>
      </div>
      {error && <p role="alert" className="text-destructive-text mt-2 text-sm">{error}</p>}
    </li>
  );
}

/** Edit a directory record, manage aliases and merge it into another. */
export function CollegeDirectoryRow({ college, canVerify, canMerge }) {
  const router = useRouter();
  const [v, setV] = useState({
    name: college.name,
    shortName: college.short_name ?? "",
    city: college.city ?? "",
    state: college.state ?? "",
    country: college.country ?? "",
    website: college.website ?? "",
    description: "",
    listingStatus: college.listing_status,
    isActive: college.is_active,
  });
  const [alias, setAlias] = useState("");
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const merged = Boolean(college.merged_into);

  function run(fn, success) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
    });
  }

  const field = (id, label, key, props = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${college.id}`} className="text-[13px] font-semibold">{label}</Label>
      <Input id={`${id}-${college.id}`} value={v[key]} onChange={set(key)} disabled={merged} {...props} />
    </div>
  );

  return (
    <details className="bg-card group rounded-xl border">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-3.5">
        <span className="font-heading font-bold">{college.name}</span>
        <span className="text-muted-foreground text-xs">
          {[college.city, college.state, college.country].filter(Boolean).join(", ") || "no location"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">{Number(college.member_count).toLocaleString()} members</span>
          {Number(college.open_reports) > 0 && <span className="bg-warning-soft text-warning-text rounded-md px-2 py-0.5 font-bold">{college.open_reports} open</span>}
          {merged ? (
            <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-bold">merged</span>
          ) : !college.is_active ? (
            <span className="bg-destructive-soft text-destructive-text rounded-md px-2 py-0.5 font-bold">hidden</span>
          ) : (
            <span className={`rounded-md px-2 py-0.5 font-bold ${college.listing_status === "verified" ? "bg-success-soft text-success-text" : "bg-muted text-muted-foreground"}`}>{college.listing_status}</span>
          )}
        </span>
      </summary>

      <div className="space-y-5 border-t p-4">
        <p className="text-muted-foreground text-xs">
          /{college.slug} · added {new Date(college.created_at).toLocaleDateString("en-IN")}
          {college.created_by_username ? ` by @${college.created_by_username}` : ""}
        </p>

        {!merged && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateCollegeListingAction({ id: college.id, ...v }), "Listing saved");
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {field("name", "Name", "name", { maxLength: 160 })}
            {field("short", "Short name", "shortName", { maxLength: 24 })}
            {field("city", "City", "city", { maxLength: 80 })}
            {field("state", "State", "state", { maxLength: 80 })}
            {field("country", "Country", "country", { maxLength: 80 })}
            {field("site", "Website", "website", { maxLength: 300, type: "url" })}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`desc-${college.id}`} className="text-[13px] font-semibold">Description <span className="text-muted-foreground font-normal">(leave empty to keep as is)</span></Label>
              <Textarea id={`desc-${college.id}`} rows={2} value={v.description} onChange={set("description")} maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`status-${college.id}`} className="text-[13px] font-semibold">Listing status</Label>
              <select id={`status-${college.id}`} value={v.listingStatus} onChange={set("listingStatus")} disabled={!canVerify && college.listing_status !== "verified"} className="w-full">
                <option value="community">Community-added (unverified)</option>
                <option value="verified" disabled={!canVerify && college.listing_status !== "verified"}>Verified listing (staff checked)</option>
              </select>
              {!canVerify && <p className="text-muted-foreground text-xs">Only college administrators can mark a listing verified.</p>}
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={v.isActive} onChange={set("isActive")} /> Listed (uncheck to hide from search)
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save listing"}</Button>
            </div>
          </form>
        )}

        {!merged && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!alias.trim()) return;
              run(async () => {
                const res = await addCollegeAliasAction({ collegeId: college.id, alias });
                if (res.ok) setAlias("");
                return res;
              }, "Alias added");
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`alias-${college.id}`} className="text-[13px] font-semibold">Add a searchable alias</Label>
              <Input id={`alias-${college.id}`} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. a short name, or a former name" maxLength={120} />
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={pending || !alias.trim()}><Plus /> Add alias</Button>
          </form>
        )}

        {!merged && canMerge && (
          <div className="bg-sunken space-y-3 rounded-xl p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-bold"><GitMerge className="size-4" aria-hidden="true" /> Merge into another college</p>
            <p className="text-muted-foreground text-xs">
              Members and content move to the college you choose. This listing is kept as a redirect, so old links still work. This cannot be undone from here.
            </p>
            <CollegePicker id={`merge-${college.id}`} label="Keep this one" optional={false} value={target} onChange={setTarget} allowAdd={false} excludeId={college.id} note={false} placeholder="Search for the listing to keep" />
            <div className="space-y-1.5">
              <Label htmlFor={`reason-${college.id}`} className="text-[13px] font-semibold">Reason</Label>
              <Input id={`reason-${college.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Same college, spelled differently" />
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={pending || !target || reason.trim().length < 3}
              onClick={() => run(() => mergeCollegesAction({ sourceId: college.id, targetId: target.id, reason }), "Colleges merged")}
            >
              <GitMerge /> Merge into {target?.name ?? "…"}
            </Button>
          </div>
        )}

        {error && <p role="alert" className="text-destructive-text text-sm font-medium">{error}</p>}
      </div>
    </details>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, X } from "lucide-react";
import { Flag } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AddCollegeForm, CollegePicker } from "@/components/colleges/college-picker";
import { removeMyCollegeAction, reportCollegeAction, setMyCollegeAction } from "@/lib/actions/colleges";

/** Connect this college to my profile, or remove the connection. Never verifies anything. */
export function CollegeMembershipButton({ collegeId, collegeName, isMine, signedIn }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!signedIn) return null;

  function change(next) {
    startTransition(async () => {
      const res = await (next ? setMyCollegeAction({ collegeId: next }) : removeMyCollegeAction({ collegeId }));
      if (res.ok) {
        toast.success(next ? `${collegeName} is now your main college` : "College removed from your profile");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return isMine ? (
    <Button type="button" variant="outline" onClick={() => change(null)} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <X />} Remove from my profile
    </Button>
  ) : (
    <Button type="button" variant="hot" onClick={() => change(collegeId)} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Check />} Add to my profile
    </Button>
  );
}

const KINDS = [
  { value: "correction", label: "Suggest a correction", hint: "A name, place or link is wrong or missing." },
  { value: "duplicate", label: "This is a duplicate", hint: "The same college is listed twice." },
  { value: "inaccurate", label: "Information is inaccurate", hint: "Something here is misleading." },
  { value: "abuse", label: "Report abuse", hint: "Spam, offensive or fake content." },
];
const FIELDS = [
  ["name", "Name"],
  ["city", "City"],
  ["state", "State"],
  ["country", "Country"],
  ["website", "Website"],
  ["description", "Description"],
  ["other", "Something else"],
];

/** Suggest a correction, flag a duplicate, or report abuse. Goes to the moderators' queue. */
export function ReportCollegeDialog({ collegeId, collegeName }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("correction");
  const [field, setField] = useState("name");
  const [proposed, setProposed] = useState("");
  const [duplicateOf, setDuplicateOf] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, startTransition] = useTransition();

  function submit(e) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await reportCollegeAction({
        collegeId,
        kind,
        field: kind === "correction" ? field : undefined,
        proposed: kind === "correction" ? proposed : undefined,
        duplicateOf: kind === "duplicate" ? duplicateOf?.id : undefined,
        note,
      });
      if (res.ok) {
        toast.success("Thank you. A moderator will review this.");
        setOpen(false);
        setProposed("");
        setNote("");
        setDuplicateOf(null);
      } else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Flag /> Suggest a correction or report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Help keep this listing accurate</DialogTitle>
            <DialogDescription>{collegeName} was added by members. Corrections go to moderators; nothing changes until they accept it.</DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-2">
            <legend className="sr-only">What would you like to do?</legend>
            {KINDS.map((k) => (
              <label
                key={k.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${kind === k.value ? "border-primary bg-accent" : "hover:border-foreground/40"}`}
              >
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="mt-1" />
                <span>
                  <span className="block text-sm font-semibold">{k.label}</span>
                  <span className="text-muted-foreground text-xs">{k.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {kind === "correction" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="report-field" className="text-[13px] font-semibold">What is wrong?</Label>
                <Select value={field} onValueChange={setField}>
                  <SelectTrigger id="report-field" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-proposed" className="text-[13px] font-semibold">It should say</Label>
                <Input id="report-proposed" value={proposed} onChange={(e) => setProposed(e.target.value)} maxLength={300} aria-invalid={Boolean(fieldErrors.proposed)} />
                {fieldErrors.proposed && <p role="alert" className="text-destructive-text text-xs font-medium">{fieldErrors.proposed}</p>}
              </div>
            </div>
          )}

          {kind === "duplicate" && (
            <div>
              <CollegePicker
                id="report-duplicate-of"
                label="Which listing is the original?"
                optional={false}
                value={duplicateOf}
                onChange={setDuplicateOf}
                allowAdd={false}
                excludeId={collegeId}
                note={false}
                placeholder="Search for the other listing"
                error={fieldErrors.duplicateOf}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="report-note" className="text-[13px] font-semibold">Anything else? <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea id="report-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </div>

          {error && <p role="alert" className="text-destructive-text text-sm font-medium">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Send</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Can't find your college?" on the directory page: add it, then go to its page. */
export function AddCollegeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Add a college
      </Button>
    );
  }
  return (
    <div className="w-full max-w-xl">
      <AddCollegeForm
        onCancel={() => setOpen(false)}
        onPicked={(college) => {
          toast.success(`${college.name} is listed`);
          router.push(`/colleges/${college.slug}`);
        }}
      />
    </div>
  );
}

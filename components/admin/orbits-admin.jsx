"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw } from "lucide-react";
import { ImagePlus, Sparkles } from "@/components/icons/lucide-compat";
import { RewardIcon } from "@/components/orbits/reward-icon";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { adjustOrbitsAction, draftQuestionAction, saveQuestionAction, saveSeasonAction, setAchievementImageAction, setConfigAction, updateAchievementAction } from "@/lib/actions/orbits-admin";
import { CATEGORY_LABEL } from "@/lib/orbits/icons";

const field = "border-input bg-card h-10 w-full rounded-lg border px-3 text-sm";

/** Runs a Server Action; keeps the dialog open with the server's message when it refuses. */
function useRun(action, onDone) {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(payload) {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await action(payload);
      } catch {
        res = { ok: false, error: "Could not reach the server. Try again." };
      }
      if (res?.ok) {
        toast.success(res.message ?? "Saved.");
        onDone?.(res);
        router.refresh();
      } else setError(res?.fieldErrors ? Object.values(res.fieldErrors)[0] : (res?.error ?? "Something went wrong."));
    });
  }
  return { run, error, pending, setError };
}

/** Tomorrow's date in IST (UTC+5:30) as YYYY-MM-DD, the default day for a generated question. */
const tomorrowIst = () => new Date(Date.now() + (24 + 5.5) * 3600_000).toISOString().slice(0, 10);

const EMPTY = { id: null, question: "", options: ["", "", "", ""], correct: 0, explanation: "", category: "general", date: "", status: "draft", source: "manual" };

/** Create or edit a daily question. The correct answer is chosen explicitly; scheduling needs the date to be free. */
export function QuestionDialog({ question = null, label, variant = "outline", aiDraft = false, autoDraft = false }) {
  const [open, setOpen] = useState(false);
  const initial = question
    ? { id: question.id, question: question.question, options: question.options, correct: question.correct_index, explanation: question.explanation, category: question.category, date: question.publish_date, status: question.status, source: question.source }
    : EMPTY;
  const [f, setF] = useState(initial);
  const { run, error, pending, setError } = useRun(saveQuestionAction, () => setOpen(false));
  const locked = question && question.answers > 0;
  const [ai, setAi] = useState({ topic: "", difficulty: "medium" });
  const drafting = useRun(draftQuestionAction, (res) => setF((p) => ({ ...p, ...res.draft, date: p.date || tomorrowIst(), source: "ai_draft" })));
  const setOpt = (i, v) => setF((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? v : o)) }));

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (!o) setError(null);
      // "Generate with AI" starts drafting as soon as the form opens, so one click gives a question to review.
      else if (autoDraft && !question && !f.question) drafting.run({ category: f.category, topic: ai.topic, difficulty: ai.difficulty });
    }}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">{question ? null : autoDraft ? <Sparkles /> : <Plus />}{label}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "New daily question"}</DialogTitle>
          <DialogDescription>Check the facts before scheduling: members trust the answer and the explanation.{locked ? " Members have answered, so the wording and the correct answer are locked." : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {aiDraft && !question && (
            <fieldset className="space-y-2 rounded-xl border p-3" aria-busy={drafting.pending}>
              <legend className="px-1 text-[13px] font-semibold">Draft with AI</legend>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input aria-label="Topic (optional)" placeholder="Topic, for example binary search (optional)" maxLength={120} value={ai.topic} onChange={(e) => setAi({ ...ai, topic: e.target.value })} />
                <select aria-label="Difficulty" className={`${field} sm:w-32`} value={ai.difficulty} onChange={(e) => setAi({ ...ai, difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="secondary" disabled={drafting.pending} onClick={() => drafting.run({ category: f.category, topic: ai.topic, difficulty: ai.difficulty })}>
                  {drafting.pending ? <Loader2 className="animate-spin" /> : <Sparkles />}{drafting.pending ? "Drafting…" : "Draft a question"}
                </Button>
                <p className="text-muted-foreground text-xs">Uses the category chosen below and replaces what is in the form. Models make mistakes, so verify the answer yourself.</p>
              </div>
              {drafting.error && <p role="alert" className="text-destructive-text text-sm">{drafting.error}</p>}
            </fieldset>
          )}
          <div className="space-y-1.5"><Label htmlFor="q-text" className="text-[13px] font-semibold">Question</Label><Textarea id="q-text" rows={2} maxLength={400} value={f.question} disabled={locked} onChange={(e) => setF({ ...f, question: e.target.value })} /></div>
          <fieldset className="min-w-0 space-y-2">
            <legend className="text-[13px] font-semibold">Answers (select the correct one)</legend>
            {f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" aria-label={`Answer ${"ABCD"[i]} is correct`} checked={f.correct === i} disabled={locked} onChange={() => setF({ ...f, correct: i })} className="size-4 shrink-0" />
                <Input aria-label={`Answer ${"ABCD"[i]}`} value={o} maxLength={200} disabled={locked} onChange={(e) => setOpt(i, e.target.value)} />
              </div>
            ))}
          </fieldset>
          <div className="space-y-1.5"><Label htmlFor="q-exp" className="text-[13px] font-semibold">Explanation shown after answering</Label><Textarea id="q-exp" rows={3} maxLength={600} value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="q-cat" className="text-[13px] font-semibold">Category</Label>
              <select id="q-cat" className={field} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="q-date" className="text-[13px] font-semibold">Date (IST)</Label><input id="q-date" type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="q-status" className="text-[13px] font-semibold">Status</Label>
              <select id="q-status" className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published</option><option value="archived">Archived</option>
              </select></div>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={f.source === "ai_draft"} onChange={(e) => setF({ ...f, source: e.target.checked ? "ai_draft" : "manual" })} />
            Started from an AI draft (a human must still verify it before it is scheduled)
          </label>
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !f.date || !f.question.trim()} onClick={() => run({ ...f, correct: Number(f.correct) })}>{pending ? "Saving…" : "Save question"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One reward value. Whole numbers only; the server validates again and records the change. */
export function ConfigRow({ name, label, hint, value }) {
  const isMap = typeof value === "object";
  const [v, setV] = useState(isMap ? JSON.stringify(value) : String(value));
  const { run, error, pending } = useRun(setConfigAction);
  function save() {
    let parsed;
    try {
      parsed = isMap ? JSON.parse(v) : Number(v);
    } catch {
      return toast.error("Enter valid JSON, for example {\"3\":5,\"7\":10}.");
    }
    run({ key: name, value: parsed });
  }
  const changed = v !== (isMap ? JSON.stringify(value) : String(value));
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Label htmlFor={`cfg-${name}`} className="text-sm font-semibold">{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
        {error && <p role="alert" className="text-destructive-text mt-1 text-xs">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input id={`cfg-${name}`} value={v} onChange={(e) => setV(e.target.value)} inputMode={isMap ? "text" : "numeric"} className={isMap ? "w-64 font-mono text-xs" : "w-24"} />
        <Button size="sm" variant="secondary" disabled={!changed || pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

const PICTURE_TYPES = ["image/png", "image/webp", "image/jpeg"];

/**
 * A badge's picture. It saves on its own (separately from the wording below): the file goes to storage through the app's upload route, which
 * checks the real file type, the size and that you may manage Orbits, and then the badge points at it. The built-in artwork is the default and
 * can always be restored. The checkerboard shows whether the picture is really transparent.
 */
function BadgePicture({ a }) {
  const router = useRouter();
  const input = useRef(null);
  const [current, setCurrent] = useState(a.image_key ?? null);
  const [chosen, setChosen] = useState(null); // { file, url } : url is a local preview of the file
  const file = chosen?.file ?? null;
  const preview = chosen?.url ?? null;
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();
  const busy = pending || progress !== null;

  useEffect(() => (preview ? () => URL.revokeObjectURL(preview) : undefined), [preview]);

  function pick(e) {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) return setChosen(null);
    if (!PICTURE_TYPES.includes(f.type)) return setError("Use a PNG, WebP or JPG picture. PNG or WebP keep a transparent background.");
    if (f.size > 2 * 1024 * 1024) return setError("Keep the picture under 2 MB. A square 512 by 512 picture is plenty.");
    setChosen({ file: f, url: URL.createObjectURL(f) });
  }

  async function save() {
    if (!file) return;
    setError(null);
    setProgress(0);
    const up = await uploadFileWithProgress(file, "orbit_badge", setProgress);
    setProgress(null);
    if (!up.ok) return setError(up.error ?? "The upload failed. Try again.");
    startTransition(async () => {
      let res;
      try {
        res = await setAchievementImageAction({ id: a.id, key: up.key });
      } catch {
        res = { ok: false, error: "Could not reach the server. Try again." };
      }
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      setCurrent(res.imageKey);
      setChosen(null);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  function reset() {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await setAchievementImageAction({ id: a.id, key: null });
      } catch {
        res = { ok: false, error: "Could not reach the server. Try again." };
      }
      if (!res.ok) return setError(res.error);
      toast.success(res.message);
      setCurrent(null);
      router.refresh();
    });
  }

  const checker = "bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:14px_14px]";
  return (
    <fieldset className="space-y-2 rounded-xl border p-3" aria-busy={busy}>
      <legend className="px-1 text-[13px] font-semibold">Badge picture</legend>
      <div className="flex items-center gap-3">
        <div className={`grid size-24 shrink-0 place-items-center rounded-xl border ${checker}`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of a file the administrator just chose
            <img src={preview} alt="New picture, not saved yet" className="size-20 object-contain" />
          ) : (
            <RewardIcon name={a.icon} imageKey={current} size={80} alt={`Current picture of ${a.title}`} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 text-xs">
          <p className="text-muted-foreground">{current ? "A custom picture is in use." : "The built-in artwork is in use."} Square PNG or WebP with a transparent background looks best, up to 2 MB.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} id={`ac-img-${a.id}`} type="file" accept="image/png,image/webp,image/jpeg" onChange={pick} disabled={busy} className="sr-only" />
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><ImagePlus /> {file ? "Choose another" : "Choose picture"}</Button>
            {file && <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? <Loader2 className="animate-spin" /> : null}{progress !== null ? `Uploading ${progress}%` : pending ? "Saving…" : "Upload and use"}</Button>}
            {current && !file && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={reset}><RotateCcw /> Use built-in artwork</Button>}
          </div>
          {file && <p className="text-muted-foreground truncate">{file.name} is not saved yet.</p>}
        </div>
      </div>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
    </fieldset>
  );
}

export function AchievementDialog({ a }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: a.title, description: a.description, bonus: String(a.bonus), active: a.active });
  const { run, error, pending, setError } = useRun(updateAchievementAction, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a.title}</DialogTitle>
          <DialogDescription>The rule that earns this badge is fixed in the database; here you can reword it, change its Orbit bonus or switch it off for new awards. Members who earned it keep it.</DialogDescription>
        </DialogHeader>
        <BadgePicture a={a} />
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="ac-title" className="text-[13px] font-semibold">Title</Label><Input id="ac-title" value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ac-desc" className="text-[13px] font-semibold">Description</Label><Textarea id="ac-desc" rows={2} maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ac-bonus" className="text-[13px] font-semibold">Bonus Orbits when earned</Label><Input id="ac-bonus" inputMode="numeric" value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} className="w-28" /></div>
          <div className="flex items-center gap-2"><Switch id="ac-active" checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /><Label htmlFor="ac-active" className="text-sm">Active</Label></div>
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={() => run({ id: a.id, title: f.title, description: f.description, bonus: Number(f.bonus), active: f.active })}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A documented correction. The safety key is created per attempt, so a retry or double click cannot apply it twice. */
export function AdjustForm({ defaultUser = "" }) {
  const [userId, setUserId] = useState(defaultUser);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const { run, error, pending } = useRun(adjustOrbitsAction, () => {
    setAmount("");
    setReason("");
    setKey(crypto.randomUUID());
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); run({ userId, amount: Number(amount), reason, key }); }} className="space-y-3">
      <div className="space-y-1.5"><Label htmlFor="adj-user" className="text-[13px] font-semibold">Member ID</Label><Input id="adj-user" value={userId} onChange={(e) => setUserId(e.target.value.trim())} placeholder="Member ID (from the member page)" className="font-mono text-xs" /></div>
      <div className="space-y-1.5"><Label htmlFor="adj-amount" className="text-[13px] font-semibold">Orbits (negative takes away)</Label><Input id="adj-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" /></div>
      <div className="space-y-1.5"><Label htmlFor="adj-reason" className="text-[13px] font-semibold">Reason (kept in the ledger and audit log)</Label><Textarea id="adj-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
      <Button type="submit" disabled={pending || !userId || !Number(amount) || reason.trim().length < 5}>{pending ? "Applying…" : "Apply correction"}</Button>
    </form>
  );
}

export function SeasonDialog({ season = null }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: season?.name ?? "", from: season?.starts_on ?? "", to: season?.ends_on ?? "" });
  const { run, error, pending, setError } = useRun(saveSeasonAction, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild><Button size="sm" variant={season ? "outline" : "default"}>{season ? "Edit" : <><Plus /> New season</>}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{season ? "Edit season" : "New season"}</DialogTitle>
          <DialogDescription>Orbit Elite badges are awarded for the top 10 by Orbits earned between these dates (IST), once the season has ended and you finalise it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="s-name" className="text-[13px] font-semibold">Name</Label><Input id="s-name" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Season 1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="s-from" className="text-[13px] font-semibold">First day</Label><input id="s-from" type="date" className={field} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="s-to" className="text-[13px] font-semibold">Last day</Label><input id="s-to" type="date" className={field} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
          </div>
        </div>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !f.name.trim() || !f.from || !f.to} onClick={() => run({ id: season?.id ?? null, name: f.name, from: f.from, to: f.to })}>{pending ? "Saving…" : "Save season"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

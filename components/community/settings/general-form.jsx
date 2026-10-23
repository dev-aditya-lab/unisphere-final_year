"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { AiDraft } from "@/components/community/settings/ai-draft";
import { SubmitButton } from "@/components/forms/submit-button";
import { MarkdownEditor } from "@/components/posts/markdown-editor";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateCommunityDetailsAction } from "@/lib/actions/community-workspace";
import { COMMUNITY_TOPICS } from "@/lib/community/rules";
import { COMMUNITY_KINDS } from "@/lib/validators/campus";
import { cn } from "@/lib/utils";

function Choice({ id, label, value, onChange, options }) {
  return (
    <Field id={id} label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  );
}

/** Name, description, who can find and join it, topics, and the community rules (Markdown, with acceptance if the owner wants it). */
export function GeneralForm({ community, hasCollege, aiAvailable = false }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [v, setV] = useState({
    name: community.name, kind: community.kind, description: community.description ?? "", visibility: community.visibility, joinPolicy: community.join_policy,
    rules: community.rules ?? "", topics: community.topics ?? [], requireRulesAck: Boolean(community.require_rules_ack), invitePolicy: community.invite_policy ?? "staff",
  });
  const set = (k) => (val) => setV((cur) => ({ ...cur, [k]: val }));
  const toggleTopic = (t) => setV((cur) => ({ ...cur, topics: cur.topics.includes(t) ? cur.topics.filter((x) => x !== t) : cur.topics.length >= 8 ? cur.topics : [...cur.topics, t] }));
  const extra = v.topics.filter((t) => !COMMUNITY_TOPICS.includes(t));

  function submit(e) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await updateCommunityDetailsAction({ communityId: community.id, input: v });
      if (res.ok) {
        toast.success("Community updated");
        router.refresh();
      } else {
        setError(res.error);
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="c-name" label="Name" required error={fieldErrors.name}><Input id="c-name" value={v.name} maxLength={80} onChange={(e) => set("name")(e.target.value)} /></Field>
      <Field id="c-desc" label="Description" optional error={fieldErrors.description} labelAction={aiAvailable ? <AiDraft communityId={community.id} kind="description" name={v.name} onText={set("description")} /> : null}><Textarea id="c-desc" rows={3} maxLength={1500} value={v.description} onChange={(e) => set("description")(e.target.value)} /></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Choice id="c-kind" label="Type" value={v.kind} onChange={set("kind")} options={COMMUNITY_KINDS.map((k) => [k.value, k.label])} />
        <Choice id="c-vis" label="Who can find it" value={v.visibility} onChange={set("visibility")} options={[["public", "All members"], ...(hasCollege || community.visibility === "college" ? [["college", "My college"]] : []), ["private", "Members only (hidden)"]]} />
        <Choice id="c-join" label="How people join" value={v.joinPolicy} onChange={set("joinPolicy")} options={[["open", "Open to all"], ["request", "By request"], ["invite", "Invite only"]]} />
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">&ldquo;Members only&rdquo; communities do not appear in discovery. People join with an invite link. Joining never asks anyone to prove which college they attend.</p>

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-semibold">Topics <span className="text-muted-foreground font-normal">(up to 8, used in discovery)</span></legend>
        <div className="flex flex-wrap gap-1.5">
          {[...COMMUNITY_TOPICS, ...extra].map((t) => {
            const on = v.topics.includes(t);
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => toggleTopic(t)} className={cn("focus-visible:ring-ring/45 rounded-full border px-3 py-1 text-xs font-medium outline-none focus-visible:ring-[3px]", on ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-accent")}>
                {t.replace(/-/g, " ")}
              </button>
            );
          })}
        </div>
        {fieldErrors.topics && <p role="alert" className="text-destructive-text mt-1 text-xs">{fieldErrors.topics}</p>}
      </fieldset>

      <Field id="c-rules" label="Community rules" optional error={fieldErrors.rules} labelAction={aiAvailable ? <AiDraft communityId={community.id} kind="rules" name={v.name} onText={set("rules")} label="Draft rules with AI" /> : null}>
        <MarkdownEditor id="c-rules" value={v.rules} onChange={set("rules")} maxLength={4000} rows={6} mentions={false} hashtags={false} placeholder={"1. Be kind.\n2. Stay on topic.\n3. No spam or advertising."} />
      </Field>
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <Switch id="c-ack" checked={v.requireRulesAck} onCheckedChange={set("requireRulesAck")} disabled={!v.rules.trim()} />
        <div>
          <Label htmlFor="c-ack" className="text-sm font-semibold">Ask members to accept the rules before they post</Label>
          <p className="text-muted-foreground text-xs">Turn this on after writing rules. Members who have not accepted can read but not post until they do.</p>
        </div>
      </div>
      <Choice id="c-invite" label="Who can create invite links" value={v.invitePolicy} onChange={set("invitePolicy")} options={[["staff", "Moderators and above"], ["members", "Any member (links last up to 7 days, 25 uses)"]]} />

      <div className="flex justify-end"><SubmitButton pending={pending} pendingText="Saving…">Save changes</SubmitButton></div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw } from "lucide-react";
import { Pencil } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { ChannelIcon } from "@/components/community/channel-icon";
import { Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveCategoryAction, createCategoryAction, createChannelAction, moveChannelAction, renameCategoryAction, reorderCategoriesAction, reorderChannelsAction, updateChannelAction,
} from "@/lib/actions/community-workspace";
import { CHANNEL_TYPES, POST_ROLES, SLOW_MODE_OPTIONS, VIEW_ROLES, channelTypeLabel } from "@/lib/community/rules";

const NONE = "none";
const roleWord = { member: "everyone", moderator: "moderators+", admin: "admins+", owner: "owner only" };

function ChannelDialog({ open, onOpenChange, communityId, categories, channel = null, defaultCategory = null, onDone }) {
  const editing = Boolean(channel);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [v, setV] = useState(() => ({
    name: channel?.name ?? "", type: channel?.type ?? "text", categoryId: channel?.category_id ?? defaultCategory ?? NONE,
    description: channel?.description ?? "", topic: channel?.topic ?? "", rules: channel?.rules ?? "",
    minViewRole: channel?.min_view_role ?? "member", minPostRole: channel?.min_post_role ?? "member",
    slowModeSeconds: String(channel?.slow_mode_seconds ?? 0), allowAttachments: channel?.allow_attachments ?? true,
  }));
  const set = (k) => (val) => setV((cur) => ({ ...cur, [k]: val }));
  function pickType(type) {
    const preset = CHANNEL_TYPES.find((t) => t.value === type);
    setV((cur) => ({ ...cur, type, minViewRole: preset.view, minPostRole: preset.post }));
  }
  const typeInfo = CHANNEL_TYPES.find((t) => t.value === v.type);
  const staffOnly = v.type === "staff";

  function submit(e) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const input = { ...v, categoryId: v.categoryId === NONE ? null : v.categoryId, slowModeSeconds: Number(v.slowModeSeconds) };
    startTransition(async () => {
      const res = editing ? await updateChannelAction({ channelId: channel.id, input }) : await createChannelAction({ communityId, input });
      if (res.ok) {
        toast.success(editing ? "Channel updated" : "Channel created");
        onOpenChange(false);
        onDone();
      } else {
        setError(res.error);
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit #${channel.name}` : "Create a channel"}</DialogTitle>
          <DialogDescription>Who can read and who can post are checked by the server every time, not just hidden in the interface.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
          <Field id="ch-name" label="Name" required error={fieldErrors.name}><Input id="ch-name" value={v.name} maxLength={40} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. project-help" /></Field>
          <Field id="ch-type" label="Kind of channel">
            <Select value={v.type} onValueChange={pickType} disabled={editing}>
              <SelectTrigger id="ch-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNEL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <p className="text-muted-foreground -mt-2 text-xs">{typeInfo?.hint}{editing && " The kind cannot be changed after creating the channel."}</p>
          <Field id="ch-cat" label="Category">
            <Select value={v.categoryId} onValueChange={set("categoryId")}>
              <SelectTrigger id="ch-cat" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No category</SelectItem>
                {categories.filter((c) => !c.archived_at).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field id="ch-desc" label="Description" optional error={fieldErrors.description}><Textarea id="ch-desc" rows={2} maxLength={300} value={v.description} onChange={(e) => set("description")(e.target.value)} /></Field>
          <Field id="ch-topic" label="Topic" optional hint="Shown under the channel name." error={fieldErrors.topic}><Input id="ch-topic" value={v.topic} maxLength={120} onChange={(e) => set("topic")(e.target.value)} /></Field>
          <Field id="ch-rules" label="Channel rules" optional error={fieldErrors.rules}><Textarea id="ch-rules" rows={3} maxLength={1000} value={v.rules} onChange={(e) => set("rules")(e.target.value)} /></Field>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-[13px] font-semibold">Permissions</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field id="ch-view" label="Who can read">
                <Select value={v.minViewRole} onValueChange={(val) => setV((cur) => ({ ...cur, minViewRole: val, minPostRole: ["member", "moderator", "admin", "owner"].indexOf(cur.minPostRole) < ["member", "moderator", "admin"].indexOf(val) ? val : cur.minPostRole }))}>
                  <SelectTrigger id="ch-view" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{VIEW_ROLES.filter((r) => !staffOnly || r.value !== "member").map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field id="ch-post" label="Who can post">
                <Select value={v.minPostRole} onValueChange={set("minPostRole")}>
                  <SelectTrigger id="ch-post" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{POST_ROLES.filter((r) => (v.type !== "announcements" || r.value !== "member")).map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            {v.minPostRole === "owner" && <p className="text-warning-text text-xs">Only the owner can post. Everyone else, including administrators, can only read.</p>}
            {v.minViewRole !== "member" && <p className="text-muted-foreground text-xs">Members below this role will not see that the channel exists. Its messages are hidden from search and notifications too.</p>}
            <Field id="ch-slow" label="Slow mode" hint="Members wait between messages. Moderators and above are exempt.">
              <Select value={v.slowModeSeconds} onValueChange={set("slowModeSeconds")}>
                <SelectTrigger id="ch-slow" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOW_MODE_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="flex items-center gap-3">
              <Switch id="ch-att" checked={v.allowAttachments} onCheckedChange={set("allowAttachments")} />
              <label htmlFor="ch-att" className="text-sm">Allow photos and PDFs</label>
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || !v.name.trim()}>{pending ? "Saving…" : editing ? "Save changes" : "Create channel"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Mover({ onUp, onDown, first, last, label }) {
  return (
    <span className="flex">
      <Button type="button" variant="ghost" size="icon-xs" disabled={first} onClick={onUp} aria-label={`Move ${label} up`}><ArrowUp /></Button>
      <Button type="button" variant="ghost" size="icon-xs" disabled={last} onClick={onDown} aria-label={`Move ${label} down`}><ArrowDown /></Button>
    </span>
  );
}

const swap = (ids, i, j) => {
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/**
 * Categories and channels. Ordering uses Up/Down buttons and a "Move to" menu instead of dragging: they work with a keyboard, a
 * screen reader and a thumb, and cannot drop something in the wrong place by accident.
 */
export function ChannelsManager({ communityId, categories, channels }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState(null); // { channel?, category? }
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState(null); // { id, name }
  const refresh = () => router.refresh();

  const run = (fn, success) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (success) toast.success(success);
        refresh();
      } else toast.error(res.error);
    });

  const liveCats = categories.filter((c) => !c.archived_at);
  const archivedCats = categories.filter((c) => c.archived_at);
  const inCat = (id) => channels.filter((c) => !c.archived_at && (id === null ? !c.category_id || !categories.some((k) => k.id === c.category_id && !k.archived_at) : c.category_id === id));
  const archivedChannels = channels.filter((c) => c.archived_at && !archivedCats.some((k) => k.id === c.category_id));

  function reorderChannel(list, i, j) {
    run(() => reorderChannelsAction({ communityId, ids: swap(list.map((c) => c.id), i, j) }));
  }

  const ChannelRow = ({ channel, list, i }) => (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <ChannelIcon type={channel.type} className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{channel.name}</span>
        <span className="text-muted-foreground block text-xs">
          {channelTypeLabel(channel.type)} · read: {roleWord[channel.min_view_role]} · post: {roleWord[channel.min_post_role]}
          {channel.slow_mode_seconds > 0 && ` · slow mode ${channel.slow_mode_seconds}s`}
        </span>
      </span>
      {!channel.archived_at && (
        <>
          <Mover label={channel.name} first={i === 0} last={i === list.length - 1} onUp={() => reorderChannel(list, i, i - 1)} onDown={() => reorderChannel(list, i, i + 1)} />
          <Select value={channel.category_id ?? NONE} onValueChange={(val) => run(() => moveChannelAction({ channelId: channel.id, categoryId: val === NONE ? null : val }), "Channel moved")} disabled={pending}>
            <SelectTrigger size="sm" className="w-36" aria-label={`Move ${channel.name} to a category`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>No category</SelectItem>{liveCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </>
      )}
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDialog({ channel })} aria-label={`Edit ${channel.name}`}><Pencil /></Button>
      <Button
        type="button" variant="ghost" size="icon-sm" disabled={pending}
        aria-label={channel.archived_at ? `Restore ${channel.name}` : `Archive ${channel.name}`}
        onClick={() => run(() => updateChannelAction({
          channelId: channel.id, archived: !channel.archived_at,
          input: { name: channel.name, type: channel.type, categoryId: channel.category_id, description: channel.description, topic: channel.topic, rules: channel.rules, minViewRole: channel.min_view_role, minPostRole: channel.min_post_role, slowModeSeconds: channel.slow_mode_seconds, allowAttachments: channel.allow_attachments },
        }), channel.archived_at ? "Channel restored" : "Channel archived. Its history is kept.")}
      >
        {channel.archived_at ? <RotateCcw /> : <Archive />}
      </Button>
    </li>
  );

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newCategory.trim()) return;
          run(() => createCategoryAction({ communityId, name: newCategory }), "Category created");
          setNewCategory("");
        }}
      >
        <div className="min-w-48 flex-1"><label htmlFor="new-cat" className="mb-1 block text-[13px] font-semibold">New category</label><Input id="new-cat" value={newCategory} maxLength={40} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Study groups" /></div>
        <Button type="submit" variant="outline" disabled={pending || !newCategory.trim()}><Plus /> Add category</Button>
        <Button type="button" onClick={() => setDialog({})}><Plus /> New channel</Button>
      </form>

      {inCat(null).length > 0 && (
        <section aria-label="Channels without a category">
          <h3 className="text-muted-foreground mb-1 text-xs font-bold tracking-wide uppercase">No category</h3>
          <ul className="divide-y">{inCat(null).map((c, i, list) => <ChannelRow key={c.id} channel={c} list={list} i={i} />)}</ul>
        </section>
      )}

      {liveCats.map((cat, ci) => {
        const list = inCat(cat.id);
        return (
          <section key={cat.id} aria-label={cat.name} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              {renaming?.id === cat.id ? (
                <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(() => renameCategoryAction({ categoryId: cat.id, name: renaming.name }), "Category renamed"); setRenaming(null); }}>
                  <Input autoFocus aria-label="Category name" value={renaming.name} maxLength={40} onChange={(e) => setRenaming({ id: cat.id, name: e.target.value })} className="h-8" />
                  <Button type="submit" size="xs">Save</Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <h3 className="flex-1 text-sm font-bold">{cat.name} <Badge variant="mono" className="ml-1">{list.length}</Badge></h3>
                  <Mover label={cat.name} first={ci === 0} last={ci === liveCats.length - 1} onUp={() => run(() => reorderCategoriesAction({ communityId, ids: swap(liveCats.map((c) => c.id), ci, ci - 1) }))} onDown={() => run(() => reorderCategoriesAction({ communityId, ids: swap(liveCats.map((c) => c.id), ci, ci + 1) }))} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setRenaming({ id: cat.id, name: cat.name })} aria-label={`Rename ${cat.name}`}><Pencil /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDialog({ category: cat.id })} aria-label={`Add a channel to ${cat.name}`}><Plus /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={pending} onClick={() => run(() => archiveCategoryAction({ categoryId: cat.id, archived: true }), "Category archived with its channels. History is kept.")} aria-label={`Archive ${cat.name}`}><Archive /></Button>
                </>
              )}
            </div>
            {list.length === 0 ? <p className="text-muted-foreground py-3 text-sm">No channels here yet.</p> : <ul className="divide-y">{list.map((c, i) => <ChannelRow key={c.id} channel={c} list={list} i={i} />)}</ul>}
          </section>
        );
      })}

      {(archivedCats.length > 0 || archivedChannels.length > 0) && (
        <section aria-label="Archived" className="rounded-xl border border-dashed p-3">
          <h3 className="text-muted-foreground mb-1 text-xs font-bold tracking-wide uppercase">Archived (only staff can see these; history is kept)</h3>
          <ul className="divide-y">
            {archivedCats.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm font-medium">{c.name} <span className="text-muted-foreground text-xs">(category)</span></span>
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => archiveCategoryAction({ categoryId: c.id, archived: false }), "Category restored")}><RotateCcw /> Restore</Button>
              </li>
            ))}
            {archivedChannels.map((c, i, list) => <ChannelRow key={c.id} channel={c} list={list} i={i} />)}
          </ul>
        </section>
      )}

      {dialog && (
        <ChannelDialog
          key={dialog.channel?.id ?? `new-${dialog.category ?? "x"}`}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          communityId={communityId}
          categories={categories}
          channel={dialog.channel ?? null}
          defaultCategory={dialog.category ?? null}
          onDone={refresh}
        />
      )}
    </div>
  );
}

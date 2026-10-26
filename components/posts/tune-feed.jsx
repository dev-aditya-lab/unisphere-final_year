"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { SlidersHorizontal } from "@/components/icons/lucide-compat";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setInterestsAction } from "@/lib/actions/discovery";

const MAX_INTERESTS = 30;

/**
 * Lets a member say what they want more of. Interests are optional, saved on their profile, and used only to rank their
 * own "For you" feed with plain rules (no AI). Suggestions are the tags trending in public posts right now.
 */
export function TuneFeed({ interests: initial = [], topics = [], personalized = true }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [interests, setInterests] = useState(initial);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const changed = useRef(false);

  function save(next) {
    const previous = interests;
    setInterests(next);
    changed.current = true;
    startTransition(async () => {
      let res;
      try {
        res = await setInterestsAction({ interests: next });
      } catch {
        res = { ok: false };
      }
      if (!res.ok) {
        setInterests(previous);
        toast.error(res.error ?? "Could not save your interests.");
      }
    });
  }

  function add(raw) {
    const term = raw.trim().replace(/^#/, "").toLowerCase();
    if (term.length < 2) return;
    if (interests.some((i) => i.toLowerCase() === term)) return setDraft("");
    if (interests.length >= MAX_INTERESTS) return toast.error(`You can add up to ${MAX_INTERESTS} interests.`);
    setDraft("");
    save([...interests, term.slice(0, 40)]);
  }

  function onOpenChange(next) {
    setOpen(next);
    // Re-rank once, when the member is done, not after every chip.
    if (!next && changed.current) {
      changed.current = false;
      router.refresh();
    }
  }

  const suggestions = topics.filter((t) => !interests.some((i) => i.toLowerCase() === t)).slice(0, 8);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-11 max-sm:w-11 max-sm:px-0 sm:h-10">
          <SlidersHorizontal className="size-[18px]" /> <span className="max-sm:sr-only">Tune your feed</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] space-y-3 p-4">
        <div>
          <h2 className="text-sm font-bold">What do you want to see more of?</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Optional. Used only to order your own feed, with simple rules and no AI. {personalized ? "" : "Personalisation is off in your privacy settings."}
          </p>
        </div>

        {interests.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Your interests">
            {interests.map((i) => (
              <li key={i} className="bg-primary-soft text-primary-text flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs font-semibold">
                {i}
                <button
                  type="button"
                  onClick={() => save(interests.filter((x) => x !== i))}
                  aria-label={`Remove ${i}`}
                  className="hover:bg-primary/15 focus-visible:ring-ring/40 grid size-5 place-items-center rounded-full outline-none focus-visible:ring-2"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">No interests yet. Add a few, or leave it empty and the feed stays a varied mix.</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(draft);
          }}
          className="flex gap-2"
        >
          <label htmlFor="interest-input" className="sr-only">
            Add an interest
          </label>
          <Input id="interest-input" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. robotics" className="h-9" />
          <Button type="submit" size="sm" variant="soft" disabled={draft.trim().length < 2 || pending}>
            <Plus /> Add
          </Button>
        </form>

        {suggestions.length > 0 && (
          <div>
            <p className="eyebrow mb-1.5">Trending now</p>
            <ul className="flex flex-wrap gap-1.5">
              {suggestions.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => add(t)}
                    className="hover:bg-accent focus-visible:ring-ring/40 flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2"
                  >
                    <Plus className="size-3" aria-hidden="true" /> {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-muted-foreground border-t pt-2.5 text-xs">
          <Link href="/settings/privacy" className="text-primary-text font-semibold hover:underline">
            Feed privacy controls
          </Link>
        </p>
      </PopoverContent>
    </Popover>
  );
}

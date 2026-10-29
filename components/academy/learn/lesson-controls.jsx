"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeLessonAction } from "@/lib/actions/academy";

/** Mark an ordinary lesson done (quizzes and assignments finish only by passing), and step to the previous or next lesson. */
export function LessonControls({ courseId, lesson, done, prev, next }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(null);
  const graded = lesson.kind === "quiz" || lesson.kind === "assignment";

  function toggle() {
    setError(null);
    start(async () => {
      const res = await completeLessonAction({ lessonId: lesson.id, undo: done });
      if (!res.ok) return setError(res.error);
      if (!done) toast.success("Lesson complete");
      if (!done && next) router.push(`/academy/learn/${courseId}?lesson=${next.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="mt-10 border-t pt-6">
      <div className="flex flex-wrap items-center gap-3">
        {!graded && (
          <Button type="button" onClick={toggle} disabled={pending} variant={done ? "outline" : "default"} className="rounded-full">
            {done ? <><Undo2 aria-hidden />Mark as not done</> : <><Check aria-hidden />{next ? "Complete and continue" : "Mark complete"}</>}
          </Button>
        )}
        {graded && <p className="text-muted-foreground text-sm">{done ? "Complete." : lesson.kind === "quiz" ? "Pass the quiz to complete this lesson." : "A passing review from your mentor completes this lesson."}</p>}
        <div className="ml-auto flex gap-2">
          {prev && <Button asChild variant="outline" size="sm"><Link href={`/academy/learn/${courseId}?lesson=${prev.id}`}><ArrowLeft aria-hidden />Previous</Link></Button>}
          {next && <Button asChild variant="outline" size="sm"><Link href={`/academy/learn/${courseId}?lesson=${next.id}`}>Next<ArrowRight aria-hidden /></Link></Button>}
        </div>
      </div>
      <p role="alert" className={error ? "text-destructive-text mt-3 text-sm" : "sr-only"}>{error}</p>
    </div>
  );
}

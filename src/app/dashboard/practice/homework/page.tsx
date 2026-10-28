"use client";

import Link from "next/link";
import { useState } from "react";
import { EntryGroups } from "@/app/dashboard/homework/_parts/EntryList";
import { UndoToast } from "@/app/dashboard/homework/_parts/UndoToast";
import { localToday, useHomework } from "@/app/dashboard/homework/_parts/useHomework";
import { Panda } from "@/components/mascot/Panda";
import { RewardsBar } from "@/components/rewards/Rewards";
import { Alert, PageSkeleton } from "@/components/ui";
import { byDueDate, pairUp } from "@/lib/homework/schedule";
import { dayOf } from "@/lib/rewards";

/**
 * The child's own homework list, in Practice: homework and notices, tonight's first, big ticks, and a star the
 * first time each homework is ticked; classwork from class is folded away. The grown-up adds the work (on
 * Homework); the child only ticks it.
 */
export default function MyHomeworkPage() {
  const [cheer, setCheer] = useState<string | null>(null);
  const { entries, error, toggle, undo, justDone } = useHomework((stickers) =>
    setCheer(stickers.length ? `A star, and a new sticker: ${stickers.join(" ")}!` : "Well done! You earned a star ⭐")
  );
  const [today] = useState(localToday);
  const rows = pairUp(entries ?? []);
  const open = rows.filter((r) => !r.done && r.kind !== "classwork");
  const classwork = rows.filter((r) => !r.done && r.kind === "classwork");
  const doneToday = rows.filter((r) => r.done && r.done_at && dayOf(new Date(r.done_at)) === today);
  const onToggle = (r: (typeof rows)[number]) => void toggle(r);

  return (
    <div className="animate-fade-in space-y-6 pb-16">
      <Link href="/dashboard/practice" className="text-sm font-medium text-brand-700 hover:underline">
        ← All practice
      </Link>
      <div className="flex items-center gap-4">
        <Panda mood={cheer ? "clap" : open.length === 0 && entries ? "happy" : "wave"} className="h-24 w-20 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My homework</h1>
          <p className="text-slate-600">
            {entries === null ? "Let's see what's to do…" : open.length === 0 ? "Nothing to do. Hooray!" : `${open.length} thing${open.length === 1 ? "" : "s"} to do. Tick each one when it's finished.`}
          </p>
        </div>
      </div>
      <RewardsBar howToEarn="Tick off your homework when it's finished to earn a star." panda={false} />
      {cheer && (
        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900">
          {cheer}
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {entries === null && !error ? <PageSkeleton /> : open.length > 0 && <EntryGroups groups={byDueDate(open, today)} today={today} onToggle={onToggle} big />}
      {classwork.length > 0 && (
        <details>
          <summary className="cursor-pointer text-base font-semibold text-slate-600 hover:text-slate-900">Classwork from class ({classwork.length})</summary>
          <div className="mt-3">
            <EntryGroups groups={[{ title: "Classwork", entries: classwork }]} today={today} onToggle={onToggle} big />
          </div>
        </details>
      )}
      {doneToday.length > 0 && <EntryGroups groups={[{ title: "Done today", entries: doneToday }]} today={today} onToggle={onToggle} big />}
      <UndoToast row={justDone} onUndo={undo} />
    </div>
  );
}

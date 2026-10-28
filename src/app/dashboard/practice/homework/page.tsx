"use client";

import Link from "next/link";
import { useState } from "react";
import { EntryGroups } from "@/app/dashboard/homework/_parts/EntryList";
import { localToday, useHomework } from "@/app/dashboard/homework/_parts/useHomework";
import { Panda } from "@/components/mascot/Panda";
import { RewardsBar } from "@/components/rewards/Rewards";
import { Alert, PageSkeleton } from "@/components/ui";
import { byDueDate } from "@/lib/homework/schedule";
import { dayOf } from "@/lib/rewards";

/**
 * The child's own homework list, in Practice: tonight's work first, big ticks, and a star the first time each
 * homework is ticked. The grown-up adds the work (on Homework); the child only ticks it.
 */
export default function MyHomeworkPage() {
  const [cheer, setCheer] = useState<string | null>(null);
  const { entries, error, toggle } = useHomework((stickers) =>
    setCheer(stickers.length ? `A star, and a new sticker: ${stickers.join(" ")}!` : "Well done! You earned a star ⭐")
  );
  const [today] = useState(localToday);
  const open = (entries ?? []).filter((e) => !e.done);
  const doneToday = (entries ?? []).filter((e) => e.done && e.done_at && dayOf(new Date(e.done_at)) === today);

  return (
    <div className="animate-fade-in space-y-6">
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
      <RewardsBar />
      {cheer && (
        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900">
          {cheer}
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {entries === null && !error ? (
        <PageSkeleton />
      ) : (
        open.length > 0 && <EntryGroups groups={byDueDate(open, today)} today={today} onToggle={(e) => void toggle(e)} big />
      )}
      {doneToday.length > 0 && <EntryGroups groups={[{ title: "Done today", entries: doneToday }]} today={today} onToggle={(e) => void toggle(e)} big />}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AddDiary } from "@/app/dashboard/homework/_parts/AddDiary";
import { EntryGroups, isOverdue, type Entry } from "@/app/dashboard/homework/_parts/EntryList";
import { ListCheckIcon } from "@/components/icons";
import { Alert, EmptyState, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { OFFLINE_MESSAGE } from "@/lib/http-errors";

type Filter = "all" | "homework" | "classwork";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "homework", label: "Homework" },
  { value: "classwork", label: "Classwork" },
];

/** Today in the phone's own time, as YYYY-MM-DD (for "overdue"). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The homework and classwork tracker, fed from the class diary: open work grouped by subject (overdue
 * flagged), ticked off by hand, never automatically; done work folded away below.
 */
export default function HomeworkPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [today] = useState(localToday);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/homework");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the homework list.");
      setEntries(data.entries as Entry[]);
      setError(null);
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't load the homework list.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  /** Done or not done, shown at once and put back if it couldn't be saved. */
  async function toggle(entry: Entry) {
    const done = !entry.done;
    const swap = (to: boolean) => setEntries((list) => list?.map((e) => (e.id === entry.id ? { ...e, done: to } : e)) ?? null);
    swap(done);
    const res = await fetch(`/api/homework/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) }).catch(() => null);
    if (!res?.ok) {
      swap(!done);
      setError("Couldn't save that. Check your connection and try again.");
    }
  }

  async function remove(entry: Entry) {
    if (!window.confirm(`Remove "${entry.title}" (${entry.subject})? Use this when the diary was read wrongly.`)) return;
    const res = await fetch(`/api/homework/${entry.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setError("Couldn't remove that. Try again in a moment.");
    setEntries((list) => list?.filter((e) => e.id !== entry.id) ?? null);
  }

  const shown = (entries ?? []).filter((e) => filter === "all" || e.kind === filter);
  const open = shown.filter((e) => !e.done);
  const done = shown.filter((e) => e.done);
  const overdue = open.filter((e) => isOverdue(e, today)).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Homework" description="Classwork and homework from the class diary. Add the diary page, then tick off each piece of work when it is done." />
      <AddDiary onAdded={() => void load()} />
      {error && <Alert tone="error">{error}</Alert>}

      {entries === null && !error ? (
        <PageSkeleton />
      ) : entries && entries.length === 0 ? (
        <EmptyState icon={<ListCheckIcon className="h-6 w-6" />} title="Nothing yet" description="Add a photo or PDF of the class diary above, and its classwork and homework will appear here." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Show" className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cx(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                    filter === f.value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-600" aria-live="polite">
              <span className="font-semibold text-slate-900">{open.length}</span> to do
              {overdue > 0 && <span className="font-semibold text-red-700"> · {overdue} overdue</span>}
            </p>
          </div>

          {open.length > 0 ? (
            <EntryGroups entries={open} today={today} onToggle={(e) => void toggle(e)} onRemove={(e) => void remove(e)} />
          ) : (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">All done. Well done! 🎉</p>
          )}

          {done.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900">Done ({done.length})</summary>
              <div className="mt-3">
                <EntryGroups entries={done} today={today} onToggle={(e) => void toggle(e)} onRemove={(e) => void remove(e)} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

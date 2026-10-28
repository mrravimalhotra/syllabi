"use client";

import { useState } from "react";
import { AddDiary } from "@/app/dashboard/homework/_parts/AddDiary";
import { EntryGroups } from "@/app/dashboard/homework/_parts/EntryList";
import { isOverdue, shortDate } from "@/app/dashboard/homework/_parts/EntryRow";
import { TypeIt } from "@/app/dashboard/homework/_parts/TypeIt";
import { localToday, useHomework } from "@/app/dashboard/homework/_parts/useHomework";
import { ListCheckIcon } from "@/components/icons";
import { Alert, EmptyState, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { byDueDate, bySubject, missingDiaryDay } from "@/lib/homework/schedule";
import { usePref } from "@/lib/use-pref";

type Filter = "all" | "homework" | "classwork" | "note";
type Layout = "due" | "subject";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "homework", label: "Homework" },
  { value: "classwork", label: "Classwork" },
  { value: "note", label: "Notices" },
];
const LAYOUTS: { value: Layout; label: string }[] = [
  { value: "due", label: "By due date" },
  { value: "subject", label: "By subject" },
];
const isLayout = (v: unknown): v is Layout => v === "due" || v === "subject";

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
            value === o.value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The homework and classwork tracker, fed from the class diary (or typed in): open work by when it is due,
 * tonight's first, or by subject; ticked off by hand, never automatically; done work folded away below.
 */
export default function HomeworkPage() {
  const { entries, diaryDays, error, load, toggle, remove, added } = useHomework();
  const [filter, setFilter] = useState<Filter>("all");
  const [layout, setLayout] = usePref<Layout>("syllabi.homework.layout", "due", isLayout);
  const [today] = useState(localToday);
  const [hour] = useState(() => new Date().getHours());

  const all = entries ?? [];
  const shown = all.filter((e) => filter === "all" || e.kind === filter);
  const open = shown.filter((e) => !e.done);
  const done = shown.filter((e) => e.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const overdue = open.filter((e) => isOverdue(e, today)).length;
  const missing = missingDiaryDay(all, diaryDays, today, hour);
  const subjects = [...new Set(all.map((e) => e.subject))].sort();
  const actions = { onRemove: (e: (typeof all)[number]) => void remove(e), help: true, pages: true };

  return (
    <div className="space-y-6">
      <PageHeader title="Homework" description="Classwork and homework from the class diary. Add each day's diary page, then tick off each piece of work when it is done." />
      <AddDiary onAdded={() => void load()}>
        <TypeIt subjects={subjects} onAdded={added} />
      </AddDiary>
      {missing && (
        <Alert tone="info">
          No diary added for {shortDate(missing, Number(today.slice(0, 4)))} yet. Add its page so no homework is missed.
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {entries === null && !error ? (
        <PageSkeleton />
      ) : entries && entries.length === 0 && diaryDays.length === 0 ? (
        <EmptyState icon={<ListCheckIcon className="h-6 w-6" />} title="Nothing yet" description="Add a photo or PDF of the class diary above, and its classwork and homework will appear here." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <Choice label="Show" options={FILTERS} value={filter} onChange={setFilter} />
              <Choice label="Arrange" options={LAYOUTS} value={layout} onChange={setLayout} />
            </div>
            <p className="text-sm text-slate-600" aria-live="polite">
              <span className="font-semibold text-slate-900">{open.length}</span> to do
              {overdue > 0 && <span className="font-semibold text-red-700"> · {overdue} overdue</span>}
            </p>
          </div>

          {open.length > 0 ? (
            <EntryGroups groups={layout === "due" ? byDueDate(open, today) : bySubject(open)} today={today} onToggle={(e) => void toggle(e)} actions={actions} />
          ) : (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">All done. Well done! 🎉</p>
          )}

          {done.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900">Done ({done.length})</summary>
              <div className="mt-3">
                <EntryGroups groups={[{ title: "Done", entries: done }]} today={today} onToggle={(e) => void toggle(e)} actions={{ onRemove: actions.onRemove }} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

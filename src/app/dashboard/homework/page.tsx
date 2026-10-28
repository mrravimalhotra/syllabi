"use client";

import { useState } from "react";
import { AddDiary } from "@/app/dashboard/homework/_parts/AddDiary";
import { EntryGroups } from "@/app/dashboard/homework/_parts/EntryList";
import { isOverdue, shortDate, type Row, type RowActions } from "@/app/dashboard/homework/_parts/EntryRow";
import { TypeIt } from "@/app/dashboard/homework/_parts/TypeIt";
import { UndoToast } from "@/app/dashboard/homework/_parts/UndoToast";
import { localToday, useHomework } from "@/app/dashboard/homework/_parts/useHomework";
import { ListCheckIcon } from "@/components/icons";
import { Alert, EmptyState, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { byDueDate, bySubject, missingDiaryDay, pairUp } from "@/lib/homework/schedule";
import { usePref } from "@/lib/use-pref";

type Filter = "home" | "classwork" | "all";
type Layout = "due" | "subject";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "home", label: "Homework & notices" },
  { value: "classwork", label: "Classwork" },
  { value: "all", label: "Everything" },
];
const isLayout = (v: unknown): v is Layout => v === "due" || v === "subject";

/** Which rows a filter shows: a row with a classwork twin counts as classwork too. */
const inFilter = (r: Row, f: Filter) => f === "all" || (f === "classwork" ? r.kind === "classwork" || Boolean(r.twin) : r.kind !== "classwork");

function Filters({ value, onChange }: { value: Filter; onChange: (v: Filter) => void }) {
  return (
    <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
      {FILTERS.map((o) => (
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
 * The homework tracker, fed from the class diary (or typed in). It opens on what needs doing at home, homework
 * and notices, by when it is due; classwork done in class is kept folded away below. Ticked off by hand, never
 * automatically, with a moment to undo.
 */
export default function HomeworkPage() {
  const { entries, diaryDays, error, load, toggle, undo, justDone, remove, confirm, added } = useHomework();
  const [filter, setFilter] = useState<Filter>("home");
  const [layout, setLayout] = usePref<Layout>("syllabi.homework.layout", "due", isLayout);
  const [today] = useState(localToday);
  const [hour] = useState(() => new Date().getHours());

  const all = entries ?? [];
  const rows = pairUp(all);
  const shown = rows.filter((r) => inFilter(r, filter));
  const open = shown.filter((r) => !r.done);
  const done = shown.filter((r) => r.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const classwork = filter === "home" ? rows.filter((r) => r.kind === "classwork" && !r.done) : [];
  const overdue = open.filter((r) => isOverdue(r, today)).length;
  const missing = missingDiaryDay(all, diaryDays, today, hour);
  const subjects = [...new Set(all.filter((e) => e.kind !== "note").map((e) => e.subject))].sort();
  const actions: RowActions = { onRemove: (r: Row) => void remove(r), onChecked: (r: Row) => void confirm(r), help: true, pages: true };
  const groups = (list: Row[]) => (layout === "due" ? byDueDate(list, today) : bySubject(list));
  const list = (g: { title: string; entries: Row[] }[], rowActions = actions) => (
    <EntryGroups groups={g} today={today} onToggle={(r) => void toggle(r)} actions={rowActions} showSubject={layout === "due" || g.length === 1} />
  );

  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Homework" description="Homework and notices from the class diary. Add each day's diary page, then tick off each piece of work when it is done." />
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
        <EmptyState icon={<ListCheckIcon className="h-6 w-6" />} title="Nothing yet" description="Add a photo or PDF of the class diary above, and its homework and notices will appear here." />
      ) : (
        <>
          <div className="space-y-3">
            <Filters value={filter} onChange={setFilter} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600" aria-live="polite">
                <span className="font-semibold text-slate-900">{open.length}</span> to do
                {overdue > 0 && <span className="font-semibold text-red-700"> · {overdue} overdue</span>}
              </p>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span aria-hidden>Sort</span>
                <select aria-label="Sort" value={layout} onChange={(e) => setLayout(e.target.value as Layout)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-800">
                  <option value="due">By due date</option>
                  <option value="subject">By subject</option>
                </select>
              </div>
            </div>
          </div>

          {open.length > 0 ? (
            list(groups(open))
          ) : (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">All done. Well done! 🎉</p>
          )}

          {classwork.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900">Classwork from class ({classwork.length})</summary>
              <p className="mt-2 text-xs text-slate-500">Done in class. Tick any your child has to finish at home once it&apos;s finished.</p>
              <div className="mt-3">{list(layout === "subject" ? bySubject(classwork) : [{ title: "Classwork", entries: classwork }])}</div>
            </details>
          )}

          {done.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900">Done ({done.length})</summary>
              <div className="mt-3">{list([{ title: "Done", entries: done }], { onRemove: actions.onRemove, help: false, pages: true })}</div>
            </details>
          )}
        </>
      )}
      <UndoToast row={justDone} onUndo={undo} />
    </div>
  );
}

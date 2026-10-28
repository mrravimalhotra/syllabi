"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Spinner, button, cx } from "@/components/ui";
import { CheckIcon, LightbulbIcon, TrashIcon } from "@/components/icons";
import { helpQuestion } from "@/lib/homework/schedule";

export interface Entry {
  id: string;
  kind: "classwork" | "homework" | "note";
  subject: string;
  title: string;
  topic: string | null;
  sub_topic: string | null;
  due_date: string | null;
  given_date: string;
  done: boolean;
  done_at: string | null;
  source: "diary" | "typed";
}

/** What a row offers besides its tick: the grown-up's list has all three, the child's none. */
export interface RowActions {
  onRemove?: (e: Entry) => void;
  /** "Get help": opens Ask Syllabi with the work already typed in. */
  help?: boolean;
  /** "Diary page": the page it was read from, to check a misreading. */
  pages?: boolean;
}

/** "29 Oct" (with the year when it is not this year). */
export function shortDate(date: string, thisYear: number): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== thisYear ? { year: "numeric" } : {}) });
}

export const isOverdue = (e: Entry, today: string) => !e.done && e.due_date !== null && e.due_date < today;

/** The diary pages an entry was read from, opened under it. */
function DiaryPages({ id }: { id: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  async function show() {
    setOpen((o) => !o);
    if (pages) return;
    const res = await fetch(`/api/homework/${id}/pages`).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setError(data?.error ?? "Couldn't open the diary page.");
    setPages(data.pages as string[]);
  }
  return (
    <>
      <button type="button" className={button.small} onClick={() => void show()} aria-expanded={open}>
        {open ? "Hide diary page" : "Diary page"}
      </button>
      {open && (
        <div className="basis-full space-y-2 pt-2">
          {error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : !pages ? (
            <Spinner />
          ) : pages.length === 0 ? (
            <p className="text-sm text-slate-500">The diary page is no longer kept.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed links, not optimisable
            pages.map((src, i) => <img key={src} src={src} alt={`Diary page ${i + 1}`} className="max-h-[70vh] w-full rounded-lg border border-slate-200 object-contain" />)
          )}
        </div>
      )}
    </>
  );
}

const KIND_LABEL: Record<Entry["kind"], string> = { homework: "Homework", classwork: "Classwork", note: "Notice" };
const KIND_TONE = { homework: "brand", classwork: "neutral", note: "warning" } as const;

/** Its kind, whether it is late, and its dates. */
function Dates({ entry, today }: { entry: Entry; today: string }) {
  const year = Number(today.slice(0, 4));
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <Badge tone={KIND_TONE[entry.kind]}>{KIND_LABEL[entry.kind]}</Badge>
      {isOverdue(entry, today) && <Badge tone="danger">Overdue</Badge>}
      {entry.kind === "note" ? (
        entry.due_date && <span>For {shortDate(entry.due_date, year)}</span>
      ) : (
        <span>{entry.due_date ? `Submit by ${shortDate(entry.due_date, year)}` : "No submission date"}</span>
      )}
      <span aria-hidden>·</span>
      <span>Given {shortDate(entry.given_date, year)}</span>
      {entry.source === "typed" && <span>· typed in</span>}
    </div>
  );
}

/** "Get help" (homework only) and "Diary page" (work read from the diary). */
function Extras({ entry, actions }: { entry: Entry; actions: RowActions }) {
  const help = actions.help && entry.kind === "homework";
  const pages = actions.pages && entry.source === "diary";
  if (!help && !pages) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {help && (
        <Link href={`/dashboard?tool=solution&q=${encodeURIComponent(helpQuestion(entry))}`} className={button.small}>
          <LightbulbIcon className="h-3.5 w-3.5" /> Get help
        </Link>
      )}
      {pages && <DiaryPages id={entry.id} />}
    </div>
  );
}

/** One piece of classwork or homework: the tick, the work word for word, its dates, and what can be done with it. */
export function EntryRow({ entry, today, onToggle, actions, big }: { entry: Entry; today: string; onToggle: (e: Entry) => void; actions: RowActions; big?: boolean }) {
  const about = [entry.topic, entry.sub_topic].filter(Boolean).join(" · ");
  return (
    <li className={cx("flex items-start gap-3", big ? "py-4" : "py-3")} data-entry={entry.id}>
      <button
        type="button"
        onClick={() => onToggle(entry)}
        role="checkbox"
        aria-checked={entry.done}
        aria-label={`${entry.done ? "Done" : "Not done"}: ${entry.subject}, ${entry.title}`}
        className={cx(
          "mt-0.5 flex shrink-0 items-center justify-center border-2 transition",
          big ? "h-11 w-11 rounded-xl" : "h-7 w-7 rounded-lg",
          entry.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white hover:border-brand-500"
        )}
      >
        {entry.done && <CheckIcon className={big ? "h-6 w-6" : "h-4 w-4"} />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cx("font-medium [overflow-wrap:anywhere] text-slate-900", big && "text-lg", entry.done && "text-slate-500 line-through")}>
          {big && <span className="font-semibold">{entry.subject}: </span>}
          {entry.title}
        </p>
        {about && <p className="text-sm [overflow-wrap:anywhere] text-slate-600">{about}</p>}
        <Dates entry={entry} today={today} />
        {!entry.done && <Extras entry={entry} actions={actions} />}
      </div>
      {actions.onRemove && (
        <button
          type="button"
          onClick={() => actions.onRemove?.(entry)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
          aria-label={`Remove ${entry.subject}: ${entry.title}`}
          title="Remove (if it was read or typed wrongly)"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

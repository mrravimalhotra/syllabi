"use client";

import { useEffect, useState } from "react";
import { RowMenu, type MenuItem } from "@/app/dashboard/homework/_parts/RowMenu";
import { Badge, Spinner, cx } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
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
  /** The two readings of the diary photo disagreed on it: check it against the page. */
  needs_check?: boolean;
}

/** A row on screen: an entry, and the same work set as classwork in that period, shown with it once. */
export type Row = Entry & { twin?: Entry };

/** What a row offers besides its tick: the grown-up's list has all three (in its ⋯ menu), the child's none. */
export interface RowActions {
  onRemove?: (e: Row) => void;
  /** "Get help": opens Ask Syllabi with the work already typed in. */
  help?: boolean;
  /** "Diary page": the page it was read from, to check a misreading. */
  pages?: boolean;
  /** "Looks right": clears "Check this" once it has been checked against the diary page. */
  onChecked?: (e: Row) => void;
}

/** "Thu, 29 Oct" (with the year when it is not this year). */
export function shortDate(date: string, thisYear: number): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== thisYear ? { year: "numeric" } : {}) });
}

export const isOverdue = (e: Entry, today: string) => !e.done && e.due_date !== null && e.due_date < today;

/** The diary pages an entry was read from, shown under it. */
function DiaryPages({ id, onClose }: { id: string; onClose: () => void }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/homework/${id}/pages`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Couldn't open the diary page.");
        setPages(data.pages as string[]);
      })
      .catch((err: unknown) => setError(err instanceof TypeError || !(err instanceof Error) ? "Couldn't open the diary page. Check your connection." : err.message));
  }, [id]);
  return (
    <div className="space-y-2 pt-2">
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
      <button type="button" onClick={onClose} className="text-xs font-medium text-brand-700 hover:underline">
        Hide diary page
      </button>
    </div>
  );
}

const KIND_LABEL: Record<Entry["kind"], string> = { homework: "Homework", classwork: "Classwork", note: "Notice" };
const KIND_TONE = { homework: "brand", classwork: "neutral", note: "warning" } as const;

/** Its kind, whether it is late, when it is due, and what it is about: one short line. */
function Details({ entry, today }: { entry: Row; today: string }) {
  const year = Number(today.slice(0, 4));
  const about = [entry.topic, entry.sub_topic].filter((t, i, all) => t && all.indexOf(t) === i).join(" · ");
  const due = entry.due_date ? `${entry.kind === "note" ? "For" : "Due"} ${shortDate(entry.due_date, year)}` : entry.kind === "homework" ? "No date given" : null;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
      <Badge tone={KIND_TONE[entry.kind]}>{entry.twin ? "Class & homework" : KIND_LABEL[entry.kind]}</Badge>
      {isOverdue(entry, today) && <Badge tone="danger">Overdue</Badge>}
      {entry.needs_check && <Badge tone="warning">Check this</Badge>}
      {due && <span className="font-medium text-slate-600">{due}</span>}
      {about && <span className="basis-full [overflow-wrap:anywhere]">{about}</span>}
    </p>
  );
}

function menuItems(entry: Row, actions: RowActions, showPages: () => void): MenuItem[] {
  const items: MenuItem[] = [];
  if (actions.help && entry.kind === "homework" && !entry.done) items.push({ label: "Get help with this", href: `/dashboard?tool=solution&q=${encodeURIComponent(helpQuestion(entry))}` });
  if (actions.pages && entry.source === "diary") items.push({ label: "See the diary page", onSelect: showPages });
  if (actions.onChecked && entry.needs_check) items.push({ label: "Looks right", onSelect: () => actions.onChecked?.(entry) });
  if (actions.onRemove) items.push({ label: "Remove", danger: true, onSelect: () => actions.onRemove?.(entry) });
  return items;
}

/** One piece of work: the tick, the subject and work word for word, one line of details, and a ⋯ menu. */
export function EntryRow(props: { entry: Row; today: string; onToggle: (e: Row) => void; actions: RowActions; big?: boolean; showSubject?: boolean }) {
  const { entry, today, onToggle, actions, big, showSubject } = props;
  const [pages, setPages] = useState(false);
  const items = menuItems(entry, actions, () => setPages(true));
  const given = `Given ${shortDate(entry.given_date, Number(today.slice(0, 4)))}${entry.source === "typed" ? " (typed in)" : ""}`;
  return (
    <li className={cx("flex items-start gap-3", big ? "py-4" : "py-2.5")} data-entry={entry.id}>
      <button
        type="button"
        onClick={() => onToggle(entry)}
        role="checkbox"
        aria-checked={entry.done}
        aria-label={`${entry.done ? "Done" : "Not done"}: ${entry.subject}, ${entry.title}`}
        className={cx(
          "flex shrink-0 items-center justify-center border-2 transition",
          big ? "mt-0.5 h-11 w-11 rounded-xl" : "h-7 w-7 rounded-lg",
          entry.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white hover:border-brand-500"
        )}
      >
        {entry.done && <CheckIcon className={big ? "h-6 w-6" : "h-4 w-4"} />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cx("[overflow-wrap:anywhere] text-slate-900", big ? "text-lg font-medium" : "font-medium", entry.done && "text-slate-500 line-through")}>
          {showSubject && entry.kind !== "note" && <span className="font-semibold">{entry.subject}: </span>}
          {entry.title}
        </p>
        <Details entry={entry} today={today} />
        {pages && <DiaryPages id={entry.id} onClose={() => setPages(false)} />}
      </div>
      {items.length > 0 && <RowMenu label={`More for ${entry.subject}: ${entry.title}`} items={items} note={given} />}
    </li>
  );
}

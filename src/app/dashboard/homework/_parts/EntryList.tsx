"use client";

import { Badge, cx } from "@/components/ui";
import { CheckIcon, TrashIcon } from "@/components/icons";

export interface Entry {
  id: string;
  kind: "classwork" | "homework";
  subject: string;
  title: string;
  topic: string | null;
  sub_topic: string | null;
  due_date: string | null;
  given_date: string;
  done: boolean;
  done_at: string | null;
}

/** "29 Oct" (with the year when it is not this year). */
function shortDate(date: string, thisYear: number): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(d.getFullYear() !== thisYear ? { year: "numeric" } : {}) });
}

/** Open work in the order to do it: overdue first, then by submission date (none last), then newest given. */
function byUrgency(a: Entry, b: Entry): number {
  const da = a.due_date ?? "9999";
  const db = b.due_date ?? "9999";
  return da.localeCompare(db) || b.given_date.localeCompare(a.given_date);
}

/** Entries grouped by subject (subjects in A to Z order), each group in the order to do it. */
function bySubject(entries: Entry[]): [string, Entry[]][] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) groups.set(e.subject, [...(groups.get(e.subject) ?? []), e]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([s, list]) => [s, [...list].sort(byUrgency)]);
}

export const isOverdue = (e: Entry, today: string) => !e.done && e.due_date !== null && e.due_date < today;

/** One piece of classwork or homework: the done button, the work word for word, and its dates. */
function EntryRow({ entry, today, onToggle, onRemove }: { entry: Entry; today: string; onToggle: (e: Entry) => void; onRemove: (e: Entry) => void }) {
  const year = Number(today.slice(0, 4));
  const overdue = isOverdue(entry, today);
  const about = [entry.topic, entry.sub_topic].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-3 py-3" data-entry={entry.id}>
      <button
        type="button"
        onClick={() => onToggle(entry)}
        role="checkbox"
        aria-checked={entry.done}
        aria-label={`${entry.done ? "Done" : "Not done"}: ${entry.subject}, ${entry.title}`}
        className={cx(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition",
          entry.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white hover:border-brand-500"
        )}
      >
        {entry.done && <CheckIcon className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cx("font-medium [overflow-wrap:anywhere] text-slate-900", entry.done && "text-slate-500 line-through")}>{entry.title}</p>
        {about && <p className="text-sm [overflow-wrap:anywhere] text-slate-600">{about}</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Badge tone={entry.kind === "homework" ? "brand" : "neutral"}>{entry.kind === "homework" ? "Homework" : "Classwork"}</Badge>
          {overdue && <Badge tone="danger">Overdue</Badge>}
          <span>{entry.due_date ? `Submit by ${shortDate(entry.due_date, year)}` : "No submission date"}</span>
          <span aria-hidden>·</span>
          <span>Given {shortDate(entry.given_date, year)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(entry)}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
        aria-label={`Remove ${entry.subject}: ${entry.title}`}
        title="Remove (if the diary was read wrongly)"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

/** Entries grouped under their subjects. */
export function EntryGroups({
  entries,
  today,
  onToggle,
  onRemove,
}: {
  entries: Entry[];
  today: string;
  onToggle: (e: Entry) => void;
  onRemove: (e: Entry) => void;
}) {
  return (
    <div className="space-y-4">
      {bySubject(entries).map(([subject, list]) => (
        <section key={subject} aria-label={subject} className="rounded-2xl border border-slate-200 bg-white px-4 shadow-xs">
          <h3 className="flex items-center justify-between border-b border-slate-100 py-3 text-sm font-semibold text-slate-900">
            {subject}
            <span className="text-xs font-normal text-slate-500">{list.length}</span>
          </h3>
          <ul className="divide-y divide-slate-100">
            {list.map((e) => (
              <EntryRow key={e.id} entry={e} today={today} onToggle={onToggle} onRemove={onRemove} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

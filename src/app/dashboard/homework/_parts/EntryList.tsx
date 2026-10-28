"use client";

import { EntryRow, type Entry, type RowActions } from "@/app/dashboard/homework/_parts/EntryRow";
import { cx } from "@/components/ui";

/** The groups of the list (by due date or by subject), each a card of rows. */
export function EntryGroups({
  groups,
  today,
  onToggle,
  actions = {},
  big,
}: {
  groups: { title: string; entries: Entry[] }[];
  today: string;
  onToggle: (e: Entry) => void;
  actions?: RowActions;
  big?: boolean;
}) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="rounded-2xl border border-slate-200 bg-white px-4 shadow-xs">
          <h3
            className={cx(
              "flex items-center justify-between border-b border-slate-100 py-3 text-sm font-semibold",
              g.title === "Overdue" ? "text-red-700" : "text-slate-900"
            )}
          >
            {g.title}
            <span className="text-xs font-normal text-slate-500">{g.entries.length}</span>
          </h3>
          <ul className="divide-y divide-slate-100">
            {g.entries.map((e) => (
              <EntryRow key={e.id} entry={e} today={today} onToggle={onToggle} actions={actions} big={big} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

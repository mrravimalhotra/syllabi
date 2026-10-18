"use client";

import { cx } from "@/components/ui";
import type { FamilyRow } from "@/lib/kindergarten/worksheets";

const TINTS = ["bg-pink-200", "bg-sky-200", "bg-emerald-200", "bg-amber-200", "bg-violet-200"];

/** Word families to complete: the ending, an example word, and three dotted lines to write on. */
export function FamilySheet({ rows }: { rows: FamilyRow[] }) {
  return (
    <ol className="space-y-3">
      {rows.map((row, i) => (
        <li key={row.rime} className="flex items-center gap-3">
          <span className="w-6 text-right text-sm font-semibold text-slate-500">{i + 1}.</span>
          <span className={cx("rounded-lg px-3 py-1 text-2xl font-bold", TINTS[i % TINTS.length])}>-{row.rime}</span>
          <span className="w-16 text-2xl font-semibold text-slate-800">{row.example}</span>
          <span className="flex flex-1 gap-3" aria-hidden>
            {[0, 1, 2].map((n) => (
              <span key={n} className="flex-1 border-b-2 border-dashed border-slate-400 pt-6" />
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}

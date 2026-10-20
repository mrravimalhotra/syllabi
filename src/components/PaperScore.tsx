"use client";

import { paperSummary } from "@/lib/checks/paper";
import { cx } from "@/components/ui";

/** The score of a marked paper as a card above the report: marks, percentage and grade. Nothing for any other answer. */
export function PaperScore({ text }: { text: string }) {
  const s = paperSummary(text);
  if (!s) return null;
  const tone = s.percent >= 70 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : s.percent >= 50 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900";
  return (
    <div className={cx("flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border px-5 py-4", tone)} data-testid="paper-score">
      <p className="text-4xl font-bold tabular-nums">
        {s.marks}
        <span className="text-xl font-medium opacity-70"> / {s.max}</span>
      </p>
      <p className="text-lg font-semibold">{Math.round(s.percent)}%</p>
      <p className="rounded-lg bg-white/70 px-3 py-1 text-lg font-bold">Grade {s.grade}</p>
    </div>
  );
}

"use client";

import { NumberView } from "@/components/practice/NumberView";
import { cx } from "@/components/ui";
import type { PracticeNumber } from "@/lib/practice/numbers";

/** A row of numbers in an order, each marked right (green) or wrong (red) when marks are given. */
export function OrderRow({
  label,
  numbers,
  marks,
  ascending,
}: {
  label: string;
  numbers: PracticeNumber[];
  marks?: boolean[];
  ascending: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </p>
      <ol className="flex flex-wrap items-center gap-1.5">
        {numbers.map((n, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-slate-400" aria-hidden="true">
                {ascending ? "<" : ">"}
              </span>
            )}
            <span
              className={cx(
                "flex min-h-11 items-center rounded-lg px-2.5 text-lg font-semibold ring-1",
                !marks
                  ? "bg-amber-50 text-amber-900 ring-amber-200"
                  : marks[i]
                    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                    : "bg-red-50 text-red-700 ring-red-200",
              )}
            >
              <NumberView n={n} />
              {marks && (
                <span className="sr-only">
                  {marks[i] ? " (right place)" : " (wrong place)"}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

"use client";

import { KIND_LABELS } from "@/lib/practice/order";
import type { NumberKind } from "@/lib/practice/numbers";
import { cx } from "@/components/ui";

const KINDS: NumberKind[] = ["whole", "decimal", "fraction"];

/** Whole numbers, decimals or fractions, as a radio group. */
export function KindPicker({ kind, onChoose }: { kind: NumberKind; onChoose: (kind: NumberKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Kind of numbers" className="grid grid-cols-3 gap-2">
      {KINDS.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={kind === k}
          onClick={() => onChoose(k)}
          className={cx(
            "min-h-11 rounded-xl border-2 px-2 py-2 text-sm font-medium transition-colors",
            kind === k ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          )}
        >
          {KIND_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

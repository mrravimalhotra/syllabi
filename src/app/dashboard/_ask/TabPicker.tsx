"use client";

import { TABS } from "@/app/dashboard/_ask/constants";
import { cx } from "@/components/ui";
import type { GenerationTaskType } from "@/types/database";

/** The kinds of thing to make (answer, notes, sample paper, study pack, paper check...), as a radio group. */
export function TabPicker({ tab, onChoose }: { tab: GenerationTaskType; onChoose: (next: GenerationTaskType) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="What to make"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 print:hidden"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const selected = tab === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChoose(t.value)}
            className={cx(
              "flex items-center gap-3 rounded-xl border p-3 text-left transition",
              selected
                ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            <span
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={cx("block text-sm font-semibold", selected ? "text-brand-900" : "text-slate-900")}>{t.label}</span>
              <span className="block truncate text-xs text-slate-500">{t.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
